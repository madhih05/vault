const multer = require("multer");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const allowedMimeTypes = new Set([
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
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "text/csv",
    "application/csv",
    "application/json",
    "text/plain",
    "application/rtf",
]);

const allowedFileExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".m4v",
    ".3gp",
    ".3g2",
    ".mp3",
    ".flac",
    ".wav",
    ".m4a",
    ".ogg",
    ".opus",
    ".aac",
    ".amr",
    ".wma",
    ".aiff",
    ".aif",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".odt",
    ".ods",
    ".odp",
    ".csv",
    ".json",
    ".txt",
    ".rtf",
]);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, os.tmpdir());
    },
    filename: (_req, file, cb) => {
        const extension = path.extname(file.originalname) || "";
        cb(null, `${crypto.randomUUID()}${extension}`);
    },
});

function fileFilter(_req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    file.isRecognizedType =
        allowedMimeTypes.has(file.mimetype) ||
        allowedFileExtensions.has(extension);

    // Unknown file types are still allowed so the vault can store arbitrary files.
    return cb(null, true);
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 },
});

const vaultUploadFields = upload.fields([
    { name: "vaultFile", maxCount: 1 },
    { name: "vaultThumbnail", maxCount: 1 },
]);

function handleVaultUpload(req, res, next) {
    vaultUploadFields(req, res, (error) => {
        if (!error) {
            const vaultFile = req.files?.vaultFile?.[0];

            // Keep backwards compatibility with handlers that read req.file.
            if (vaultFile) {
                req.file = vaultFile;
            }

            return next();
        }

        if (
            error instanceof multer.MulterError &&
            error.code === "LIMIT_FILE_SIZE"
        ) {
            return res.status(400).json({
                error: "File too large. Maximum allowed size is 50MB.",
            });
        }

        return res.status(error.statusCode || 400).json({
            error: error.message || "Invalid upload request.",
        });
    });
}

module.exports = {
    handleVaultUpload,
    allowedMimeTypes,
    allowedFileExtensions,
};
