const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    passwordHash: {
        type: String,
    },
    recoveryKey: {
        type: String,
    },
});

module.exports = mongoose.model("User", userSchema);
