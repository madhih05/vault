const express = require("express");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");
const requireAuth = require("../middleware/auth");
const validate = require("../middleware/validation");
const {
	login,
	register,
	changePassword,
	resetWithKey,
} = require("../controllers/authController");

const router = express.Router();

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many login attempts. Try again in 15 minutes." },
});

const resetLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 3,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		error: "Too many password reset attempts. Try again in 1 hour.",
	},
});

const usernameRule = body("username")
	.exists({ checkFalsy: true })
	.withMessage("username is required")
	.bail()
	.isString()
	.withMessage("username must be a string")
	.bail()
	.matches(/^[a-zA-Z0-9]+$/)
	.withMessage("username must be alphanumeric");

const passwordRule = (fieldName) =>
	body(fieldName)
		.exists({ checkFalsy: true })
		.withMessage(`${fieldName} is required`)
		.bail()
		.isString()
		.withMessage(`${fieldName} must be a string`)
		.bail()
		.isLength({ min: 8 })
		.withMessage(`${fieldName} must be at least 8 characters long`);

const recoveryKeyRule = body("recoveryKey")
	.exists({ checkFalsy: true })
	.withMessage("recoveryKey is required")
	.bail()
	.isString()
	.withMessage("recoveryKey must be a string")
	.bail()
	.matches(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/)
	.withMessage("recoveryKey must match format XXXX-XXXX-XXXX-XXXX");

router.post("/register", [usernameRule, passwordRule("password"), validate], register);

router.post(
	"/login",
	[
		loginLimiter,
		body("username")
			.exists({ checkFalsy: true })
			.withMessage("username is required")
			.bail()
			.isString()
			.withMessage("username must be a string"),
		body("password")
			.exists({ checkFalsy: true })
			.withMessage("password is required")
			.bail()
			.isString()
			.withMessage("password must be a string"),
		validate,
	],
	login,
);

router.post(
	"/change-password",
	[
		requireAuth,
		passwordRule("currentPassword"),
		passwordRule("newPassword"),
		validate,
	],
	changePassword,
);

router.post(
	"/reset-with-key",
	[resetLimiter, usernameRule, recoveryKeyRule, passwordRule("newPassword"), validate],
	resetWithKey,
);

module.exports = router;
