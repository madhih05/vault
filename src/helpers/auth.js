const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

async function passwordsMatch(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

function signAuthToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });
}

module.exports = {
    hashPassword,
    passwordsMatch,
    signAuthToken,
};
