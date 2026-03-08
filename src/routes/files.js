const express = require("express");
const requireAuth = require("../middleware/auth");
const { handleVaultUpload } = require("../middleware/upload");
const {
    uploadFile,
    listFiles,
    viewFile,
    deleteFile,
} = require("../controllers/fileController");

const router = express.Router();

router.post("/upload", requireAuth, handleVaultUpload, uploadFile);
router.get("/files", requireAuth, listFiles);
router.get("/files/:id/view", requireAuth, viewFile);
router.delete("/files/:id", requireAuth, deleteFile);

module.exports = router;
