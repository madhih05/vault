const mongoose = require("mongoose");
const logger = require("../logger");

async function connectDatabase() {
    try {
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
