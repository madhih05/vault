const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    originalName: { type: String, required: true },
    driveFileId: { type: String, required: true }, // The key to fetch the file later
    thumbnailLink: { type: String }, // Legacy Google generated thumbnail URL
    thumbnailDriveFileId: { type: String }, // Uploaded custom thumbnail file id
    thumbnailMimeType: { type: String },
    thumbnailWebViewLink: { type: String },
    webViewLink: { type: String }, // To view the full file
    mimeType: { type: String }, // e.g., 'image/jpeg' or 'video/mp4'
    sizeBytes: { type: Number },
    uploadDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", fileSchema);
