const logger = require("../logger");
const { google } = require("googleapis");

const hasDriveCredentials = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN,
);

if (!hasDriveCredentials || !process.env.DRIVE_FOLDER_ID) {
    logger.warn("Google Drive configuration is incomplete", {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
        hasFolderId: Boolean(process.env.DRIVE_FOLDER_ID),
    });
} else {
    logger.info("Google Drive client configured", {
        hasFolderId: true,
    });
}

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground",
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth: oauth2Client });
const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

module.exports = {
    drive,
    folderId: FOLDER_ID,
    oauth2Client,
};
