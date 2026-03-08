require("dotenv").config(); // Loads the variables from .env
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { google } = require("googleapis");
const stream = require("stream");
const logger = require("./logger");
const mongoose = require("mongoose");
const File = require("./models/File");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User"); // We created this in the DB step!

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("Secure Database Connection Established!"))
    .catch((err) => console.error("Database connection error:", err));

app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        logger.info("HTTP request completed", {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
        });
    });

    next();
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

// Initialize Google Drive API using OAuth2 Credentials
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground",
);

// Tell the client to use your permanent refresh token
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth: oauth2Client });

const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// ==========================================
//          AUTHENTICATION SYSTEM
// ==========================================

// 1. REGISTRATION ENDPOINT (Run this twice, then comment it out!)
app.post("/api/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "Username already taken." });
        }

        // Scramble the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save to Database
        const newUser = new User({
            username,
            passwordHash: hashedPassword,
        });

        await newUser.save();
        logger.info("New user registered", { username });
        res.status(201).json({ message: "User securely created." });
    } catch (error) {
        logger.error("Registration error", { message: error.message });
        res.status(500).json({ error: "Server error during registration." });
    }
});

// 2. LOGIN ENDPOINT
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find the user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: "Invalid credentials." });
        }

        // Check the password against the scrambled hash
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials." });
        }

        // Generate the JWT Keycard (expires in 2 hours for security)
        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "2h" },
        );

        logger.info("User logged in", { username });
        res.status(200).json({
            token,
            user: { id: user._id, username: user.username },
        });
    } catch (error) {
        logger.error("Login error", { message: error.message });
        res.status(500).json({ error: "Server error during login." });
    }
});

// 3. THE SECURITY GUARD (MIDDLEWARE)
const requireAuth = (req, res, next) => {
    // Look for the token in the headers
    const token = req.header("x-auth-token");

    // If no token, block the request
    if (!token) {
        logger.warn("Unauthorized access attempt - No token");
        return res
            .status(401)
            .json({ error: "Access denied. No token provided." });
    }

    try {
        // Verify the token is real and hasn't expired
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach the user info to the request
        next(); // Let them pass to the upload endpoint
    } catch (error) {
        logger.warn("Unauthorized access attempt - Invalid token");
        res.status(401).json({ error: "Invalid or expired token." });
    }
};
// ==========================================

// --- THE UPLOAD ENDPOINT ---
app.post(
    "/api/upload",
    requireAuth,
    upload.single("vaultFile"),
    async (req, res) => {
        try {
            if (!req.file) {
                logger.warn("Upload attempted without a file");
                return res.status(400).json({ error: "No file uploaded." });
            }

            logger.info("Receiving upload", {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                fileSize: req.file.size,
            });

            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);

            // 1. Upload to Google Drive
            const driveResponse = await drive.files.create({
                requestBody: {
                    name: req.file.originalname,
                    parents: [FOLDER_ID],
                },
                media: {
                    mimeType: req.file.mimetype,
                    body: bufferStream,
                },
                fields: "id, name, webViewLink, thumbnailLink",
            });

            logger.info("Drive upload completed", {
                originalName: req.file.originalname,
                driveFileId: driveResponse.data.id,
            });

            // 2. Save the metadata to MongoDB Atlas
            const newFileRecord = new File({
                originalName: driveResponse.data.name,
                driveFileId: driveResponse.data.id,
                thumbnailLink: driveResponse.data.thumbnailLink, // Drive provides this for images/videos
                webViewLink: driveResponse.data.webViewLink,
                mimeType: req.file.mimetype,
            });

            await newFileRecord.save();

            logger.info("Database record created", {
                dbId: newFileRecord._id,
                driveFileId: driveResponse.data.id,
            });

            res.status(200).json({
                success: true,
                message: "File securely uploaded and recorded in Vault.",
                fileData: newFileRecord,
            });
        } catch (error) {
            logger.error("Upload failed", {
                message: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                error: "Failed to upload file to the vault.",
            });
        }
    },
);

// --- FETCH ALL FILES ENDPOINT (THE GALLERY) ---
app.get("/api/files", requireAuth, async (req, res) => {
    try {
        logger.info("Fetching gallery for user", {
            username: req.user.username,
        });

        // Ask MongoDB for all files, sorted by newest first (-1)
        const files = await File.find().sort({ uploadDate: -1 });

        logger.info("Gallery fetched successfully", {
            fileCount: files.length,
        });

        // Send the list of files back to the client
        res.status(200).json({
            success: true,
            files: files,
        });
    } catch (error) {
        logger.error("Failed to fetch gallery", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({
            error: "Could not retrieve the vault contents.",
        });
    }
});

app.listen(PORT, () => {
    logger.info("Secure Vault Server started", {
        url: `http://localhost:${PORT}`,
        environment: process.env.NODE_ENV || "development",
    });
});
