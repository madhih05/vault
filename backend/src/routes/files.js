const express = require("express");
const { body, query } = require("express-validator");
const requireAuth = require("../middleware/auth");
const {
    handleVaultUpload,
    handleDirectFinalizeUpload,
} = require("../middleware/upload");
const validate = require("../middleware/validation");
const {
    uploadFile,
    initDirectUpload,
    finalizeDirectUpload,
    syncUnindexedFiles,
    listFiles,
    viewFile,
    getThumbnail,
    deleteFile,
} = require("../controllers/fileController");

const router = express.Router();

router.post("/upload", requireAuth, handleVaultUpload, uploadFile);
router.post("/files/sync", requireAuth, syncUnindexedFiles);
router.post(
    "/upload/init",
    [
        requireAuth,
        body("fileName")
            .isString()
            .withMessage("fileName must be a string")
            .bail()
            .trim()
            .notEmpty()
            .withMessage("fileName is required")
            .isLength({ max: 255 })
            .withMessage("fileName must be at most 255 characters"),
        body("mimeType")
            .isString()
            .withMessage("mimeType must be a string")
            .bail()
            .trim()
            .notEmpty()
            .withMessage("mimeType is required")
            .isLength({ max: 255 })
            .withMessage("mimeType must be at most 255 characters"),
        body("fileSize")
            .isInt({ min: 1 })
            .withMessage("fileSize must be a positive integer"),
        validate,
    ],
    initDirectUpload,
);
router.post(
    "/upload/finalize",
    [
        requireAuth,
        handleDirectFinalizeUpload,
        body("fileName")
            .isString()
            .withMessage("fileName must be a string")
            .bail()
            .trim()
            .notEmpty()
            .withMessage("fileName is required")
            .isLength({ max: 255 })
            .withMessage("fileName must be at most 255 characters"),
        body("mimeType")
            .isString()
            .withMessage("mimeType must be a string")
            .bail()
            .trim()
            .notEmpty()
            .withMessage("mimeType is required")
            .isLength({ max: 255 })
            .withMessage("mimeType must be at most 255 characters"),
        body("size")
            .isInt({ min: 1 })
            .withMessage("size must be a positive integer"),
        body("fileId")
            .optional({ nullable: true })
            .isString()
            .withMessage("fileId must be a string")
            .bail()
            .trim(),
        body("uploadSessionId")
            .optional({ nullable: true })
            .isString()
            .withMessage("uploadSessionId must be a string")
            .bail()
            .trim(),
        body().custom((value) => {
            const hasFileId = Boolean(
                value?.fileId && String(value.fileId).trim(),
            );
            const hasUploadSessionId = Boolean(
                value?.uploadSessionId && String(value.uploadSessionId).trim(),
            );

            if (!hasFileId && !hasUploadSessionId) {
                throw new Error("Either fileId or uploadSessionId is required");
            }

            return true;
        }),
        validate,
    ],
    finalizeDirectUpload,
);
router.get(
    "/files",
    [
        requireAuth,
        query("page")
            .optional()
            .isInt({ min: 1 })
            .withMessage("page must be an integer greater than or equal to 1"),
        query("limit")
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage("limit must be an integer between 1 and 100"),
        query("fileType")
            .optional()
            .isString()
            .withMessage("fileType must be a string")
            .bail()
            .trim()
            .notEmpty()
            .withMessage("fileType cannot be empty"),
        query("fileName")
            .optional()
            .isString()
            .withMessage("fileName must be a string")
            .bail()
            .trim()
            .notEmpty()
            .withMessage("fileName cannot be empty"),
        validate,
    ],
    listFiles,
);
router.get("/files/:id/view", requireAuth, viewFile);
router.get("/files/:id/thumbnail", requireAuth, getThumbnail);
router.delete("/files/:id", requireAuth, deleteFile);

module.exports = router;
