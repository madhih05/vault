const File = require("../models/File");
const fs = require("fs");
const mongoose = require("mongoose");
const logger = require("../logger");
const { drive, folderId } = require("../config/googleDrive");

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
        });

        const driveResponse = await drive.files.create({
            requestBody: {
                name: req.file.originalname,
                parents: [folderId],
            },
            media: {
                mimeType: req.file.mimetype,
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
            mimeType: req.file.mimetype,
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
        logger.info("Fetching gallery for user", {
            username: req.user.username,
        });

        const files = await File.find().sort({ uploadDate: -1 });

        logger.info("Gallery fetched successfully", {
            fileCount: files.length,
        });

        return res.status(200).json({
            success: true,
            files,
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

        res.setHeader("Content-Type", fileRecord.mimeType);
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
