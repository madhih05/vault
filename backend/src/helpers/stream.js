const stream = require("stream");

function bufferToStream(buffer) {
    const passthrough = new stream.PassThrough();
    passthrough.end(buffer);
    return passthrough;
}

module.exports = {
    bufferToStream,
};
