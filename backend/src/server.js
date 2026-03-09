require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./logger");
const connectDatabase = require("./config/db");
const requestLogger = require("./middleware/requestLogger");
const authRoutes = require("./routes/auth");
const fileRoutes = require("./routes/files");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.use("/api", authRoutes);
app.use("/api", fileRoutes);
app.get("/healthcheck", (res) => {
    res.status(200).json({ status: "ok" });
});

async function startServer() {
    try {
        await connectDatabase();

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
