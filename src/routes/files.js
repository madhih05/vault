const express = require("express");

const router = express.Router();

router.post("/api/upload", upload.single("vaultFile"), async (req, res) => {
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

        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        // 1. Upload to Google Drive
        const driveResponse = await drive.files.create({
            requestBody: {
                name: req.file.originalname,
                parents: [FOLDER_ID],
            },
            media: {
                mimeType: req.file.mimetype,
                body: bufferStream,
            },
            fields: "id, name, webViewLink, thumbnailLink",
        });

        logger.info("Drive upload completed", {
            originalName: req.file.originalname,
            driveFileId: driveResponse.data.id,
        });

        // 2. Save the metadata to MongoDB Atlas
        const newFileRecord = new File({
            originalName: driveResponse.data.name,
            driveFileId: driveResponse.data.id,
            thumbnailLink: driveResponse.data.thumbnailLink, // Drive provides this for images/videos
            webViewLink: driveResponse.data.webViewLink,
            mimeType: req.file.mimetype,
        });

        await newFileRecord.save();

        logger.info("Database record created", {
            dbId: newFileRecord._id,
            driveFileId: driveResponse.data.id,
        });

        res.status(200).json({
            success: true,
            message: "File securely uploaded and recorded in Vault.",
            fileData: newFileRecord,
        });
    } catch (error) {
        logger.error("Upload failed", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ error: "Failed to upload file to the vault." });
    }
});

module.exports = router;
