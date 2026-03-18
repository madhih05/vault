const File = require("../models/File");
const path = require("path");
const mongoose = require("mongoose");
const logger = require("../logger");
const { drive, folderId } = require("../config/googleDrive");

const extensionToMimeType = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".3g2": "video/3gpp2",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".aac": "audio/aac",
    ".amr": "audio/amr",
    ".wma": "audio/x-ms-wma",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".csv": "text/csv",
    ".json": "application/json",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
};

const inlinePreviewMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/avi",
    "video/msvideo",
    "video/x-matroska",
    "video/matroska",
    "video/mkv",
    "video/webm",
    "video/x-m4v",
    "video/3gpp",
    "video/3gpp2",
    "audio/mpeg",
    "audio/mp3",
    "audio/x-mpeg",
    "audio/flac",
    "audio/x-flac",
    "audio/wav",
    "audio/x-wav",
    "audio/vnd.wave",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
    "audio/opus",
    "audio/aac",
    "audio/x-aac",
    "audio/amr",
    "audio/x-ms-wma",
    "audio/aiff",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
]);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildContentDisposition(dispositionType, fileName) {
    const asciiSafeFileName = (fileName || "download")
        .replace(/[\r\n]/g, "")
        .replace(/\"/g, "");

    return `${dispositionType}; filename="${asciiSafeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName || "download")}`;
}

function buildFileRecordData({
    driveMetadata,
    userId,
    fileName,
    driveFileId,
    mimeType,
    sizeBytes,
    thumbnailDriveFileId,
    thumbnailMimeType,
    thumbnailWebViewLink,
}) {
    return {
        userId,
        originalName: driveMetadata?.name || fileName,
        driveFileId: driveFileId || driveMetadata?.id,
        thumbnailLink: driveMetadata?.thumbnailLink,
        thumbnailDriveFileId,
        thumbnailMimeType,
        thumbnailWebViewLink,
        webViewLink: driveMetadata?.webViewLink,
        mimeType: driveMetadata?.mimeType || mimeType,
        sizeBytes: Number.parseInt(driveMetadata?.size, 10) || sizeBytes,
        uploadDate: driveMetadata?.createdTime
            ? new Date(driveMetadata.createdTime)
            : undefined,
    };
}

function isVideoDriveFile(driveFile) {
    const mimeType = String(driveFile?.mimeType || "").toLowerCase();
    const fileName = String(driveFile?.name || "").toLowerCase();

    return (
        mimeType.startsWith("video/") ||
        /\.(mp4|mov|avi|mkv|webm|m4v|3gp|3g2)$/i.test(fileName)
    );
}

function buildDriveListRequest(overrides = {}) {
    return {
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...overrides,
    };
}

async function syncDriveIndex(options = {}) {
    const syncLabel = options.onlyVideos
        ? "vault Drive video sync"
        : "vault Drive sync";

    if (!folderId) {
        throw new Error("Drive folder is not configured on the backend.");
    }

    logger.info(`Starting ${syncLabel}`);

    const existingRecords = await File.find(
        {},
        "driveFileId thumbnailDriveFileId",
    ).lean();

    const indexedDriveFileIds = new Set(
        existingRecords.map((record) => record.driveFileId).filter(Boolean),
    );
    const indexedThumbnailIds = new Set(
        existingRecords
            .map((record) => record.thumbnailDriveFileId)
            .filter(Boolean),
    );

    const operations = [];
    let scannedCount = 0;
    let addedCount = 0;
    let pageToken = undefined;

    do {
        const driveListResponse = await drive.files.list(
            buildDriveListRequest({
                q: [`'${folderId}' in parents`, "trashed = false"].join(
                    " and ",
                ),
                fields: "nextPageToken, files(id,name,mimeType,size,webViewLink,thumbnailLink,createdTime)",
                orderBy: "createdTime desc",
                pageSize: 1000,
                pageToken,
                spaces: "drive",
            }),
        );

        const driveFiles = driveListResponse?.data?.files || [];
        pageToken = driveListResponse?.data?.nextPageToken || undefined;

        for (const driveFile of driveFiles) {
            scannedCount += 1;

            if (!driveFile?.id) {
                continue;
            }

            if (
                indexedDriveFileIds.has(driveFile.id) ||
                indexedThumbnailIds.has(driveFile.id) ||
                driveFile.mimeType === "application/vnd.google-apps.folder"
            ) {
                continue;
            }

            if (options.onlyVideos && !isVideoDriveFile(driveFile)) {
                continue;
            }

            operations.push({
                updateOne: {
                    filter: { driveFileId: driveFile.id },
                    update: {
                        $setOnInsert: buildFileRecordData({
                            driveMetadata: driveFile,
                            driveFileId: driveFile.id,
                        }),
                    },
                    upsert: true,
                },
            });

            indexedDriveFileIds.add(driveFile.id);
        }
    } while (pageToken);

    if (operations.length > 0) {
        const syncResult = await File.bulkWrite(operations, {
            ordered: false,
        });
        addedCount = syncResult?.upsertedCount || 0;
    }

    logger.info(`${syncLabel} completed`, {
        scannedCount,
        addedCount,
    });

    return {
        scannedCount,
        addedCount,
    };
}

async function syncUnindexedFiles(req, res) {
    try {
        const { scannedCount, addedCount } = await syncDriveIndex();

        return res.status(200).json({
            success: true,
            message:
                addedCount > 0
                    ? `Indexed ${addedCount} new file${addedCount === 1 ? "" : "s"} from Drive.`
                    : "Vault index is already up to date.",
            scannedCount,
            addedCount,
        });
    } catch (error) {
        const upstreamMessage =
            error.response?.data?.error?.message ||
            error.response?.data?.message ||
            error.message;

        logger.error("Vault Drive sync failed", {
            message: upstreamMessage,
            stack: error.stack,
            status: error.response?.status,
            details: error.response?.data,
        });

        return res.status(500).json({
            error:
                upstreamMessage ||
                "Could not sync Drive files into the vault index.",
        });
    }
}

async function initDirectUpload(req, res) {
    try {
        const { fileName, mimeType, fileSize } = req.body;
        const normalizedSize = Number.parseInt(fileSize, 10);

        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized request." });
        }

        if (!folderId) {
            logger.error("Drive folder id is not configured for upload init");
            return res.status(500).json({
                error: "Drive upload folder is not configured.",
            });
        }

        const metadata = {
            name: fileName,
            parents: [folderId],
            mimeType,
        };

        const driveResponse = await drive.files.create(
            {
                uploadType: "resumable",
                requestBody: metadata,
            },
            {
                headers: {
                    "X-Upload-Content-Type": mimeType,
                    "X-Upload-Content-Length": String(normalizedSize),
                },
            },
        );

        const rawHeaders = driveResponse?.headers || {};
        const uploadUrl =
            typeof rawHeaders?.get === "function"
                ? rawHeaders.get("location")
                : rawHeaders?.location ||
                  rawHeaders?.Location ||
                  rawHeaders?.LOCATION;

        if (!uploadUrl) {
            logger.error("Drive resumable init succeeded without location", {
                fileName,
                mimeType,
                status: driveResponse?.status,
                headerKeys:
                    typeof rawHeaders?.keys === "function"
                        ? [...rawHeaders.keys()]
                        : Object.keys(rawHeaders || {}),
            });
            return res.status(502).json({
                error: "Failed to initialize resumable upload session.",
            });
        }

        logger.info("Initialized resumable upload session", {
            userId: req.user.id,
            fileName,
            mimeType,
            fileSize: normalizedSize,
        });

        return res.status(200).json({
            success: true,
            uploadUrl,
        });
    } catch (error) {
        logger.error("Failed to initialize direct upload session", {
            message: error.message,
            stack: error.stack,
            status: error.response?.status,
            headerKeys: Object.keys(error.response?.headers || {}),
            details: error.response?.data,
        });

        return res.status(500).json({
            error: "Could not initialize direct upload session.",
        });
    }
}

async function finalizeDirectUpload(req, res) {
    try {
        const { originalName, mimeType, size, driveFileId } = req.body;
        const normalizedSize = Number.parseInt(size, 10);

        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized request." });
        }

        if (!driveFileId) {
            return res.status(400).json({
                error: "driveFileId is required.",
            });
        }

        const newFileRecord = new File({
            userId: req.user.id,
            originalName,
            driveFileId,
            mimeType,
            sizeBytes: normalizedSize,
        });

        await newFileRecord.save();

        logger.info("Direct upload finalized and persisted", {
            userId: req.user.id,
            dbId: newFileRecord._id,
            driveFileId,
        });

        return res.status(201).json({
            success: true,
            file: newFileRecord,
        });
    } catch (error) {
        logger.error("Failed to finalize direct upload", {
            message: error.message,
            stack: error.stack,
            details: error.response?.data,
        });

        return res.status(500).json({
            error: "Could not finalize direct upload.",
        });
    }
}

async function listFiles(req, res) {
    try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = Number.parseInt(req.query.limit, 10) || 20;
        const fileType = req.query.fileType?.trim();
        const fileName = req.query.fileName?.trim();

        const filter = {};

        if (fileType) {
            const normalizedFileType = fileType.toLowerCase();

            if (normalizedFileType === "media") {
                filter.$and = [
                    {
                        $or: [
                            {
                                mimeType: {
                                    $regex: "^(image|video)/",
                                    $options: "i",
                                },
                            },
                            {
                                originalName: {
                                    $regex: "\\.(jpg|jpeg|png|mp4|mov|avi|mkv|webm|m4v|3gp|3g2)$",
                                    $options: "i",
                                },
                            },
                        ],
                    },
                    {
                        mimeType: {
                            $not: {
                                $regex: "^image/hei(c|f)(-sequence)?$",
                                $options: "i",
                            },
                        },
                    },
                    {
                        originalName: {
                            $not: {
                                $regex: "\\.(heic|heif)$",
                                $options: "i",
                            },
                        },
                    },
                ];
            } else if (normalizedFileType === "documents") {
                filter.$or = [
                    {
                        mimeType: {
                            $regex: "^image/hei(c|f)(-sequence)?$",
                            $options: "i",
                        },
                    },
                    {
                        originalName: {
                            $regex: "\\.(heic|heif)$",
                            $options: "i",
                        },
                    },
                    {
                        mimeType: {
                            $not: {
                                $regex: "^(image|video|audio)/",
                                $options: "i",
                            },
                        },
                    },
                ];
            } else {
                const normalizedToken = fileType.replace(/^\./, "");
                filter.$or = [
                    {
                        mimeType: {
                            $regex: escapeRegExp(fileType),
                            $options: "i",
                        },
                    },
                    {
                        originalName: {
                            $regex: `\\.${escapeRegExp(normalizedToken)}$`,
                            $options: "i",
                        },
                    },
                ];
            }
        }

        if (fileName) {
            filter.originalName = {
                $regex: escapeRegExp(fileName),
                $options: "i",
            };
        }

        const skip = (page - 1) * limit;

        logger.info("Fetching vault gallery", {
            page,
            limit,
            fileType,
            fileName,
        });

        const [files, total] = await Promise.all([
            File.find(filter)
                .sort({ uploadDate: -1, _id: -1 })
                .skip(skip)
                .limit(limit),
            File.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limit);

        logger.info("Gallery fetched successfully", {
            fileCount: files.length,
            total,
            page,
            limit,
        });

        return res.status(200).json({
            success: true,
            files,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        });
    } catch (error) {
        logger.error("Failed to fetch gallery", {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({
            error: "Could not retrieve the vault contents.",
        });
    }
}

async function viewFile(req, res) {
    try {
        const fileId = req.params.id;
        const downloadRequested =
            String(req.query.download || "").toLowerCase() === "1" ||
            String(req.query.download || "").toLowerCase() === "true";

        if (!mongoose.Types.ObjectId.isValid(fileId)) {
            return res.status(400).json({ error: "Invalid file ID." });
        }

        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            logger.warn("View request failed - File not found in DB", {
                dbId: fileId,
            });
            return res.status(404).json({ error: "File not found." });
        }

        logger.info("Streaming file to client", {
            dbId: fileId,
            originalName: fileRecord.originalName,
        });

        const driveResponse = await drive.files.get(
            {
                fileId: fileRecord.driveFileId,
                alt: "media",
            },
            {
                responseType: "stream",
            },
        );

        const fileExtension = path
            .extname(fileRecord.originalName || "")
            .toLowerCase();
        const inferredMimeType = extensionToMimeType[fileExtension];
        const effectiveMimeType =
            fileRecord.mimeType ||
            inferredMimeType ||
            "application/octet-stream";
        const shouldPreviewInline =
            !downloadRequested && inlinePreviewMimeTypes.has(effectiveMimeType);

        res.setHeader("Content-Type", effectiveMimeType);
        res.setHeader(
            "Content-Disposition",
            buildContentDisposition(
                shouldPreviewInline ? "inline" : "attachment",
                fileRecord.originalName,
            ),
        );

        driveResponse.data.pipe(res);

        driveResponse.data.on("error", (error) => {
            logger.error("Error during file stream", {
                error: error.message,
            });
        });

        return undefined;
    } catch (error) {
        logger.error("Stream failed", {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ error: "Failed to stream the file." });
    }
}

async function getThumbnail(req, res) {
    try {
        const fileId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(fileId)) {
            return res.status(400).json({ error: "Invalid file ID." });
        }

        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ error: "File not found." });
        }

        if (!fileRecord.thumbnailDriveFileId) {
            return res.status(404).json({
                error: "No uploaded thumbnail is available for this file.",
            });
        }

        const driveResponse = await drive.files.get(
            {
                fileId: fileRecord.thumbnailDriveFileId,
                alt: "media",
            },
            {
                responseType: "stream",
            },
        );

        res.setHeader(
            "Content-Type",
            fileRecord.thumbnailMimeType || "image/jpeg",
        );
        res.setHeader(
            "Content-Disposition",
            buildContentDisposition(
                "inline",
                `${path.parse(fileRecord.originalName || "thumbnail").name}-thumb.jpg`,
            ),
        );

        driveResponse.data.pipe(res);

        driveResponse.data.on("error", (streamError) => {
            logger.error("Thumbnail stream error", {
                message: streamError.message,
                dbId: fileRecord._id,
            });
        });

        return undefined;
    } catch (error) {
        logger.error("Thumbnail fetch failed", {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ error: "Failed to load thumbnail." });
    }
}

async function deleteFile(req, res) {
    try {
        const fileId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(fileId)) {
            return res.status(400).json({ error: "Invalid file ID." });
        }

        logger.info("Delete request received", { dbId: fileId });

        const fileRecord = await File.findById(fileId);
        if (!fileRecord) {
            return res.status(404).json({ error: "File not found." });
        }

        await drive.files.delete({ fileId: fileRecord.driveFileId });
        logger.info("Deleted from Google Drive", {
            driveFileId: fileRecord.driveFileId,
        });

        if (fileRecord.thumbnailDriveFileId) {
            try {
                await drive.files.delete({
                    fileId: fileRecord.thumbnailDriveFileId,
                });
                logger.info("Deleted custom thumbnail from Google Drive", {
                    thumbnailDriveFileId: fileRecord.thumbnailDriveFileId,
                });
            } catch (thumbnailDeleteError) {
                logger.warn(
                    "Failed to delete custom thumbnail from Google Drive",
                    {
                        thumbnailDriveFileId: fileRecord.thumbnailDriveFileId,
                        message: thumbnailDeleteError.message,
                    },
                );
            }
        }

        await File.findByIdAndDelete(fileId);
        logger.info("Deleted from Database", { dbId: fileId });

        return res.status(200).json({
            success: true,
            message: "File permanently deleted from Vault.",
        });
    } catch (error) {
        logger.error("Delete failed", {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ error: "Failed to delete the file." });
    }
}

module.exports = {
    initDirectUpload,
    finalizeDirectUpload,
    syncDriveIndex,
    syncUnindexedFiles,
    listFiles,
    viewFile,
    getThumbnail,
    deleteFile,
};
