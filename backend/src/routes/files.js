const express = require("express");
const { query } = require("express-validator");
const requireAuth = require("../middleware/auth");
const { handleVaultUpload } = require("../middleware/upload");
const validate = require("../middleware/validation");
const {
    uploadFile,
    listFiles,
    viewFile,
    getThumbnail,
    deleteFile,
} = require("../controllers/fileController");

const router = express.Router();

router.post("/upload", requireAuth, handleVaultUpload, uploadFile);
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
