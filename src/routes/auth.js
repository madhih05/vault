const express = require("express");
const requireAuth = require("../middleware/auth");
const {
	login,
	register,
	changePassword,
	resetWithKey,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/change-password", requireAuth, changePassword);
router.post("/reset-with-key", resetWithKey);

module.exports = router;
