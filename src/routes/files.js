const express = require("express");
const requireAuth = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
	uploadFile,
	listFiles,
	viewFile,
	deleteFile,
} = require("../controllers/fileController");

const router = express.Router();

router.post("/upload", requireAuth, upload.single("vaultFile"), uploadFile);
router.get("/files", requireAuth, listFiles);
router.get("/files/:id/view", requireAuth, viewFile);
router.delete("/files/:id", requireAuth, deleteFile);

module.exports = router;
