const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const configuredLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const activeLevel = Object.hasOwn(levels, configuredLevel)
    ? configuredLevel
    : "info";

function shouldLog(level) {
    return levels[level] <= levels[activeLevel];
}

function formatMeta(meta) {
    if (!meta || typeof meta !== "object") {
        return "";
    }

    try {
        return ` ${JSON.stringify(meta)}`;
    } catch {
        return " [unserializable metadata]";
    }
}

function log(level, message, meta) {
    if (!shouldLog(level)) {
        return;
    }

    const timestamp = new Date().toISOString();
    const output = `[${timestamp}] [${level.toUpperCase()}] ${message}${formatMeta(meta)}`;

    if (level === "error") {
        console.error(output);
        return;
    }

    if (level === "warn") {
        console.warn(output);
        return;
    }

    console.log(output);
}

module.exports = {
    error: (message, meta) => log("error", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    info: (message, meta) => log("info", message, meta),
    debug: (message, meta) => log("debug", message, meta),
};
