import imageCompression from "browser-image-compression";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

const COMPRESSIBLE_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);
const IMAGE_MIME_PREFIX = "image/";
const NON_COMPRESSIBLE_IMAGE_TYPES = new Set(["image/gif", "image/svg+xml"]);
const VIDEO_MIME_TYPE = "video/mp4";
const MIN_IMAGE_COMPRESSION_BYTES = 300 * 1024;
const MAX_IN_MEMORY_VIDEO_BYTES = 45 * 1024 * 1024;

function isVideoMimeType(mimeType = "") {
    return String(mimeType).toLowerCase().startsWith("video/");
}

function normalizeMimeType(mimeType = "") {
    return String(mimeType).toLowerCase();
}

function isCompressibleImageMimeType(mimeType = "") {
    const normalized = normalizeMimeType(mimeType);

    if (NON_COMPRESSIBLE_IMAGE_TYPES.has(normalized)) {
        return false;
    }

    return (
        COMPRESSIBLE_IMAGE_MIME_TYPES.has(normalized) ||
        normalized.startsWith(IMAGE_MIME_PREFIX)
    );
}

export function isCompressibleMediaMimeType(mimeType = "") {
    return (
        isCompressibleImageMimeType(mimeType) ||
        isVideoMimeType(normalizeMimeType(mimeType))
    );
}

const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 3,
    maxWidthOrHeight: 2880,
    initialQuality: 0.9,
    useWebWorker: true,
};

function sanitizeBaseName(filename = "media") {
    const withoutExtension = filename.replace(/\.[^.]+$/, "");
    return withoutExtension.replace(/[^a-zA-Z0-9-_]/g, "_") || "media";
}

function buildTempPath(prefix, extension) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${id}.${extension}`;
}

function arrayBufferToBase64(arrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
}

function extractBase64Data(data) {
    if (!data) {
        return "";
    }

    const marker = "base64,";
    const markerIndex = data.indexOf(marker);

    if (markerIndex >= 0) {
        return data.slice(markerIndex + marker.length);
    }

    return data;
}

function getVideoEditorOrThrow() {
    const plugin = window?.VideoEditor || window?.cordova?.plugins?.VideoEditor;

    if (!plugin?.transcodeVideo) {
        throw new Error(
            "cordova-plugin-video-editor is unavailable. Ensure it is installed and synced.",
        );
    }

    return plugin;
}

async function waitForVideoEditorPlugin(timeoutMs = 4000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            return getVideoEditorOrThrow();
        } catch {
            // Cordova bridge may still be initializing after app launch.
        }

        await new Promise((resolve) => {
            window.setTimeout(resolve, 120);
        });
    }

    return getVideoEditorOrThrow();
}

function transcodeVideoWithPlugin(videoEditor, options) {
    return new Promise((resolve, reject) => {
        // cordova-plugin-video-editor expects (success, error, options).
        videoEditor.transcodeVideo(resolve, reject, options);
    });
}

function normalizeNativeFileUri(uri = "") {
    const normalized = String(uri || "").trim();

    if (!normalized) {
        return "";
    }

    if (normalized.startsWith("content://") || normalized.startsWith("file://")) {
        return normalized;
    }

    if (normalized.startsWith("/")) {
        return `file://${normalized}`;
    }

    return "";
}

function getNativeInputUriFromFile(file) {
    const candidates = [
        file?.path,
        file?.nativeURL,
        file?.localURL,
        file?.uri,
    ];

    for (const candidate of candidates) {
        const uri = normalizeNativeFileUri(candidate);
        if (uri) {
            return uri;
        }
    }

    return "";
}

function stripFileScheme(pathOrUri = "") {
    return pathOrUri.startsWith("file://")
        ? pathOrUri.replace(/^file:\/\//, "")
        : pathOrUri;
}

async function safeDeleteFile({ path, directory }) {
    if (!path) {
        return;
    }

    try {
        await Filesystem.deleteFile(
            directory
                ? {
                      path,
                      directory,
                  }
                : { path },
        );
    } catch {
        // Best-effort cleanup: skip delete errors.
    }
}

async function readTranscodedAsBase64(resultPath, fallbackName) {
    const candidates = [
        resultPath,
        stripFileScheme(resultPath),
        fallbackName,
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const read = await Filesystem.readFile({ path: candidate });
            return extractBase64Data(read.data);
        } catch {
            // Try next candidate.
        }

        try {
            const read = await Filesystem.readFile({
                path: candidate,
                directory: Directory.Cache,
            });
            return extractBase64Data(read.data);
        } catch {
            // Try next candidate.
        }
    }

    throw new Error("Unable to read transcoded video from cache.");
}

async function readTranscodedAsBlob(resultPath) {
    const candidates = [resultPath, stripFileScheme(resultPath)].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const convertedSrc = Capacitor.convertFileSrc(candidate);
            const response = await fetch(convertedSrc);

            if (response.ok) {
                const blob = await response.blob();
                if (blob.size > 0) {
                    return blob;
                }
            }
        } catch {
            // Try next candidate.
        }
    }

    return null;
}

async function compressImage(file) {
    const options = {
        ...IMAGE_COMPRESSION_OPTIONS,
        // Some Android WebView builds are more stable without worker threads.
        useWebWorker: !Capacitor.isNativePlatform(),
    };

    let compressedBlob;

    try {
        compressedBlob = await imageCompression(file, options);
    } catch (error) {
        if (!options.useWebWorker) {
            throw error;
        }

        // Retry once without worker for environments with worker constraints.
        compressedBlob = await imageCompression(file, {
            ...options,
            useWebWorker: false,
        });
    }

    if (!compressedBlob?.size || compressedBlob.size >= file.size) {
        return file;
    }

    return new File([compressedBlob], file.name, {
        type: compressedBlob.type || file.type,
        lastModified: Date.now(),
    });
}

async function compressVideoNative(file) {
    if (!Capacitor.isNativePlatform()) {
        throw new Error(
            "Video compression requires a native platform runtime.",
        );
    }

    const videoEditor = await waitForVideoEditorPlugin();
    const inputCachePath = buildTempPath("vault-input", "mp4");
    const outputCacheBaseName = buildTempPath("vault-output", "mp4").replace(
        /\.mp4$/,
        "",
    );
    const directInputUri = getNativeInputUriFromFile(file);

    let transcodedPath = "";
    let wroteInputCacheFile = false;

    try {
        let inputUriValue = directInputUri;

        if (!inputUriValue) {
            if (file.size > MAX_IN_MEMORY_VIDEO_BYTES) {
                throw new Error(
                    "Video is too large for reliable on-device compression. Please trim it and try again.",
                );
            }

            const inputBuffer = await file.arrayBuffer();
            const inputBase64 = arrayBufferToBase64(inputBuffer);

            await Filesystem.writeFile({
                path: inputCachePath,
                data: inputBase64,
                directory: Directory.Cache,
                recursive: true,
            });
            wroteInputCacheFile = true;

            const inputUri = await Filesystem.getUri({
                directory: Directory.Cache,
                path: inputCachePath,
            });

            inputUriValue = inputUri?.uri || "";
        }

        if (!inputUriValue) {
            throw new Error("Unable to access source video URI for compression.");
        }

        const transcodeResult = await transcodeVideoWithPlugin(videoEditor, {
            fileUri: inputUriValue,
            outputFileName: outputCacheBaseName,
            // Use app-specific external storage for Android compatibility.
            saveToLibrary: false,
            deleteInputFile: false,
            outputFileType: videoEditor.OutputFileType.MPEG4,
            videoBitrate: 3000000,
            maintainAspectRatio: true,
            width: 1920,
            videoCodec: videoEditor.VideoCodec.H264,
        });

        transcodedPath =
            typeof transcodeResult === "string"
                ? transcodeResult
                : transcodeResult?.file ||
                  transcodeResult?.outputFile ||
                  transcodeResult?.outputFilePath;

        console.info("Video transcode output path:", transcodedPath);

        const outputBlobFromPath = await readTranscodedAsBlob(transcodedPath);
        const outputBlob = outputBlobFromPath
            ? outputBlobFromPath
            : base64ToBlob(
                  await readTranscodedAsBase64(
                      transcodedPath,
                      `${outputCacheBaseName}.mp4`,
                  ),
                  VIDEO_MIME_TYPE,
              );

        if (!outputBlob.size) {
            throw new Error("Transcoded video output was empty.");
        }

        if (outputBlob.size >= file.size) {
            throw new Error(
                "Video compression did not reduce file size.",
            );
        }

        const outputName = `${sanitizeBaseName(file.name)}.mp4`;

        console.info("Video compression complete", {
            originalBytes: file.size,
            compressedBytes: outputBlob.size,
            mimeType: VIDEO_MIME_TYPE,
        });

        return new File([outputBlob], outputName, {
            type: VIDEO_MIME_TYPE,
            lastModified: Date.now(),
        });
    } finally {
        if (wroteInputCacheFile) {
            await safeDeleteFile({
                path: inputCachePath,
                directory: Directory.Cache,
            });
        }

        const outputRelative = `${outputCacheBaseName}.mp4`;
        await safeDeleteFile({
            path: outputRelative,
            directory: Directory.Cache,
        });

        if (transcodedPath) {
            await safeDeleteFile({ path: transcodedPath });
            await safeDeleteFile({ path: stripFileScheme(transcodedPath) });
        }
    }
}

export async function compressMedia(file) {
    if (!(file instanceof File)) {
        throw new TypeError("compressMedia(file) expects a File instance.");
    }

    const normalizedMimeType = normalizeMimeType(file.type);

    if (
        isCompressibleImageMimeType(normalizedMimeType) &&
        file.size >= MIN_IMAGE_COMPRESSION_BYTES
    ) {
        try {
            return await compressImage(file);
        } catch (error) {
            console.error(
                "Image compression failed; using original file.",
                error,
            );
            return file;
        }
    }

    if (isVideoMimeType(normalizedMimeType)) {
        try {
            return await compressVideoNative(file);
        } catch (error) {
            console.error("Video compression failed.", error);
            throw new Error(
                "Video compression failed. Please try a different video.",
            );
        }
    }

    return file;
}
