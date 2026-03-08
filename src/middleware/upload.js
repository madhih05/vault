const multer = require("multer");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "video/mp4",
    "application/pdf",
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
    if (allowedMimeTypes.has(file.mimetype)) {
        return cb(null, true);
    }

    const error = new Error(
        `Unsupported file type. Allowed types: ${Array.from(allowedMimeTypes).join(", ")}`,
    );
    error.statusCode = 400;
    return cb(error, false);
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 },
});

const singleVaultUpload = upload.single("vaultFile");

function handleVaultUpload(req, res, next) {
    singleVaultUpload(req, res, (error) => {
        if (!error) {
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
};
