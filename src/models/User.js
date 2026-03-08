const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    passwordHash: {
        type: String,
        required: true,
    }, // We will encrypt/hash this in the next phase!
});

module.exports = mongoose.model("User", userSchema);
