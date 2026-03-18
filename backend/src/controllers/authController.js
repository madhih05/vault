const logger = require("../logger");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const {
    hashPassword,
    passwordsMatch,
    signAuthToken,
} = require("../helpers/auth");

function buildRequestMeta(req, extra = {}) {
    return {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        ...extra,
    };
}

async function register(req, res) {
    try {
        const { username, password } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            logger.warn(
                "Registration blocked because username already exists",
                buildRequestMeta(req, { username }),
            );
            return res.status(400).json({ error: "Username already taken." });
        }

        const passwordHash = await hashPassword(password);
        const newUser = new User({
            username,
            passwordHash,
        });

        await newUser.save();
        logger.info("New user registered", buildRequestMeta(req, { username }));

        return res.status(201).json({ message: "User securely created." });
    } catch (error) {
        logger.error("Registration error", {
            ...buildRequestMeta(req),
            message: error.message,
            stack: error.stack,
        });
        return res
            .status(500)
            .json({ error: "Server error during registration." });
    }
}

async function login(req, res) {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            logger.warn(
                "Login failed because user was not found",
                buildRequestMeta(req, { username }),
            );
            return res.status(400).json({ error: "Invalid credentials." });
        }

        const storedPasswordHash = user.passwordHash;
        const isMatch = await passwordsMatch(password, storedPasswordHash);
        if (!isMatch) {
            logger.warn(
                "Login failed because password did not match",
                buildRequestMeta(req, { username }),
            );
            return res.status(400).json({ error: "Invalid credentials." });
        }

        const token = signAuthToken({ id: user._id, username: user.username });

        logger.info("User logged in", buildRequestMeta(req, { username }));
        return res.status(200).json({
            token,
            user: { id: user._id, username: user.username },
        });
    } catch (error) {
        logger.error("Login error", {
            ...buildRequestMeta(req, { username: req.body?.username }),
            message: error.message,
            stack: error.stack,
        });
        return res.status(500).json({ error: "Server error during login." });
    }
}

async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            logger.warn(
                "Password change rejected because request body was incomplete",
                buildRequestMeta(req, { userId }),
            );
            return res.status(400).json({
                error: "Please provide both current and new passwords.",
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            logger.warn(
                "Password change failed because user was not found",
                buildRequestMeta(req, { userId }),
            );
            return res.status(404).json({ error: "User not found." });
        }

        const storedPasswordHash = user.passwordHash;
        const isMatch = await passwordsMatch(
            currentPassword,
            storedPasswordHash,
        );
        if (!isMatch) {
            logger.warn(
                "Failed password change attempt - Incorrect current password",
                buildRequestMeta(req, {
                    username: user.username,
                    userId,
                }),
            );
            return res
                .status(400)
                .json({ error: "Incorrect current password." });
        }

        const updatedPasswordHash = await hashPassword(newPassword);
        user.passwordHash = updatedPasswordHash;
        await user.save();

        logger.info("Password changed successfully", {
            username: user.username,
            userId,
            method: req.method,
            path: req.originalUrl,
            ip: req.ip,
        });
        return res
            .status(200)
            .json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        logger.error("Password change error", {
            ...buildRequestMeta(req, { userId: req.user?.id }),
            message: error.message,
            stack: error.stack,
        });
        return res.status(500).json({ error: "Failed to change password." });
    }
}

async function resetWithKey(req, res) {
    try {
        const { username, recoveryKey, newPassword } = req.body;

        if (!username || !recoveryKey || !newPassword) {
            logger.warn(
                "Recovery-key password reset rejected because request body was incomplete",
                buildRequestMeta(req, { username }),
            );
            return res.status(400).json({
                error: "username, recoveryKey, and newPassword are required.",
            });
        }

        const user = await User.findOne({ username });
        if (!user || !user.recoveryKey) {
            logger.warn(
                "Recovery-key password reset failed because user or recovery key was missing",
                buildRequestMeta(req, { username }),
            );
            return res
                .status(400)
                .json({ error: "Invalid request or credentials." });
        }

        const keyMatches = await bcrypt.compare(recoveryKey, user.recoveryKey);
        if (!keyMatches) {
            logger.warn(
                "Password reset with recovery key failed",
                buildRequestMeta(req, { username }),
            );
            return res
                .status(400)
                .json({ error: "Invalid request or credentials." });
        }

        const updatedPasswordHash = await bcrypt.hash(newPassword, 10);
        user.passwordHash = updatedPasswordHash;
        await user.save();

        logger.info(
            "Password reset with recovery key succeeded",
            buildRequestMeta(req, { username }),
        );
        return res.status(200).json({
            success: true,
            message: "Password updated successfully.",
        });
    } catch (error) {
        logger.error("Password reset with key error", {
            ...buildRequestMeta(req, { username: req.body?.username }),
            message: error.message,
            stack: error.stack,
        });
        return res.status(500).json({ error: "Failed to reset password." });
    }
}

module.exports = {
    register,
    login,
    changePassword,
    resetWithKey,
};
