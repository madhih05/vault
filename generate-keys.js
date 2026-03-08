require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");

function generateRecoveryKey() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const chars = [];

    for (let index = 0; index < 16; index += 1) {
        const randomIndex = crypto.randomInt(0, alphabet.length);
        chars.push(alphabet[randomIndex]);
    }

    return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}`;
}

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const users = await User.find();

        for (const user of users) {
            if (user.recoveryKey) {
                console.log(`User ${user.username} already has a recovery key.`);
                continue;
            }

            const plainRecoveryKey = generateRecoveryKey();
            const hashedRecoveryKey = await bcrypt.hash(plainRecoveryKey, 10);

            user.recoveryKey = hashedRecoveryKey;
            await user.save();

            console.log(`Recovery key for ${user.username}: ${plainRecoveryKey}`);
        }

        console.log("Recovery key generation complete.");
    } catch (error) {
        console.error("Failed to generate recovery keys:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

run();
