const mongoose = require("mongoose");
const logger = require("../logger");

let areConnectionListenersBound = false;

function bindConnectionListeners() {
    if (areConnectionListenersBound) {
        return;
    }

    areConnectionListenersBound = true;

    mongoose.connection.on("disconnected", () => {
        logger.warn("Database connection lost");
    });

    mongoose.connection.on("reconnected", () => {
        logger.info("Database connection re-established");
    });

    mongoose.connection.on("error", (error) => {
        logger.error("Database connection emitted error", {
            message: error.message,
            stack: error.stack,
        });
    });
}

async function connectDatabase() {
    try {
        if (!process.env.MONGODB_URI) {
            logger.error(
                "Database connection skipped because MONGODB_URI is missing",
            );
            throw new Error("MONGODB_URI is not configured");
        }

        bindConnectionListeners();
        logger.info("Attempting database connection", {
            hostHint: process.env.MONGODB_URI.split("@").pop()?.split("/")[0],
        });
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info("Secure Database Connection Established!");
    } catch (error) {
        logger.error("Database connection error", {
            message: error.message,
            stack: error.stack,
        });
        throw error;
    }
}

module.exports = connectDatabase;
