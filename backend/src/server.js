require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./logger");
const connectDatabase = require("./config/db");
const requestLogger = require("./middleware/requestLogger");
const authRoutes = require("./routes/auth");
const fileRoutes = require("./routes/files");
const { syncDriveIndex } = require("./controllers/fileController");

const app = express();
const PORT = process.env.PORT || 3000;
const AUTO_VIDEO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

let autoVideoSyncTimer = null;
let isAutoVideoSyncRunning = false;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.use("/api", authRoutes);
app.use("/api", fileRoutes);
// --- WAKE UP PING / HEALTHCHECK ROUTE ---
app.get("/healthcheck", (req, res) => {
    res.status(200).json({ status: "ok", message: "Server is awake!" });
});

function startAutoVideoSync() {
    if (autoVideoSyncTimer) {
        return;
    }

    autoVideoSyncTimer = setInterval(async () => {
        if (isAutoVideoSyncRunning) {
            logger.warn(
                "Skipping scheduled video sync because a previous run is still active",
            );
            return;
        }

        isAutoVideoSyncRunning = true;

        try {
            const result = await syncDriveIndex({ onlyVideos: true });
            logger.info("Scheduled non-indexed video sync finished", result);
        } catch (error) {
            logger.error("Scheduled non-indexed video sync failed", {
                message: error.message,
                stack: error.stack,
            });
        } finally {
            isAutoVideoSyncRunning = false;
        }
    }, AUTO_VIDEO_SYNC_INTERVAL_MS);

    logger.info("Scheduled non-indexed video sync enabled", {
        intervalMs: AUTO_VIDEO_SYNC_INTERVAL_MS,
    });
}

async function startServer() {
    try {
        await connectDatabase();
        startAutoVideoSync();

        app.listen(PORT, () => {
            logger.info("Secure Vault Server started", {
                url: `http://localhost:${PORT}`,
                environment: process.env.NODE_ENV || "development",
            });
        });
    } catch (error) {
        logger.error("Server startup failed", {
            message: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

startServer();
