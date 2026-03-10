import imageCompression from "browser-image-compression";

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
const MIN_IMAGE_COMPRESSION_BYTES = 300 * 1024;

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

const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 3,
    maxWidthOrHeight: 2880,
    initialQuality: 0.9,
    useWebWorker: true,
};

async function compressImage(file) {
    const options = {
        ...IMAGE_COMPRESSION_OPTIONS,
        useWebWorker: true,
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

    return file;
}
