const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    originalName: { type: String, required: true },
    driveFileId: { type: String, required: true }, // The key to fetch the file later
    thumbnailLink: { type: String }, // For the grid UI
    webViewLink: { type: String }, // To view the full file
    mimeType: { type: String }, // e.g., 'image/jpeg' or 'video/mp4'
    uploadDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", fileSchema);
