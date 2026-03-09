const File = require("../models/File");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const logger = require("../logger");
const { drive, folderId } = require("../config/googleDrive");
const {
    allowedMimeTypes,
    allowedFileExtensions,
} = require("../middleware/upload");

const extensionToMimeType = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".mp4": "video/mp4",
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
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
]);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveMimeType(file) {
    const extension = path.extname(file.originalname || "").toLowerCase();

    if (allowedMimeTypes.has(file.mimetype)) {
        return file.mimetype;
    }

    if (allowedFileExtensions.has(extension)) {
        return extensionToMimeType[extension] || "application/octet-stream";
    }

    return file.mimetype || "application/octet-stream";
}

function buildContentDisposition(dispositionType, fileName) {
    const asciiSafeFileName = (fileName || "download")
        .replace(/[\r\n]/g, "")
        .replace(/\"/g, "");

    return `${dispositionType}; filename="${asciiSafeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName || "download")}`;
}

async function uploadFile(req, res) {
    const tempFilePath = req.file?.path;

    try {
        if (!req.file) {
            logger.warn("Upload attempted without a file");
            return res.status(400).json({ error: "No file uploaded." });
        }

        logger.info("Receiving upload", {
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            isRecognizedType: req.file.isRecognizedType,
        });

        const resolvedMimeType = resolveMimeType(req.file);

        const driveResponse = await drive.files.create({
            requestBody: {
                name: req.file.originalname,
                parents: [folderId],
            },
            media: {
                mimeType: resolvedMimeType,
                body: fs.createReadStream(tempFilePath),
            },
            fields: "id, name, webViewLink, thumbnailLink",
        });

        logger.info("Drive upload completed", {
            originalName: req.file.originalname,
            driveFileId: driveResponse.data.id,
        });

        const newFileRecord = new File({
            originalName: driveResponse.data.name,
            driveFileId: driveResponse.data.id,
            thumbnailLink: driveResponse.data.thumbnailLink,
            webViewLink: driveResponse.data.webViewLink,
            mimeType: resolvedMimeType,
        });

        await newFileRecord.save();

        logger.info("Database record created", {
            dbId: newFileRecord._id,
            driveFileId: driveResponse.data.id,
        });

        return res.status(200).json({
            success: true,
            message: "File securely uploaded and recorded in Vault.",
            fileData: newFileRecord,
        });
    } catch (error) {
        logger.error("Upload failed", {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({
            error: "Failed to upload file to the vault.",
        });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
                logger.warn("Failed to clean up temporary upload file", {
                    filePath: tempFilePath,
                    message: cleanupError.message,
                });
            }
        }
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
            const normalizedFileType = fileType.replace(/^\./, "");
            filter.$or = [
                {
                    mimeType: {
                        $regex: escapeRegExp(fileType),
                        $options: "i",
                    },
                },
                {
                    originalName: {
                        $regex: `\\.${escapeRegExp(normalizedFileType)}$`,
                        $options: "i",
                    },
                },
            ];
        }

        if (fileName) {
            filter.originalName = {
                $regex: escapeRegExp(fileName),
                $options: "i",
            };
        }

        const skip = (page - 1) * limit;

        logger.info("Fetching gallery for user", {
            username: req.user.username,
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
            inlinePreviewMimeTypes.has(effectiveMimeType);

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

async function deleteFile(req, res) {
    try {
        const fileId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(fileId)) {
            return res.status(400).json({ error: "Invalid file ID." });
        }

        logger.info("Delete request received", {
            dbId: fileId,
            username: req.user.username,
        });

        const fileRecord = await File.findById(fileId);
        if (!fileRecord) {
            return res.status(404).json({ error: "File not found." });
        }

        await drive.files.delete({ fileId: fileRecord.driveFileId });
        logger.info("Deleted from Google Drive", {
            driveFileId: fileRecord.driveFileId,
        });

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
    uploadFile,
    listFiles,
    viewFile,
    deleteFile,
};
