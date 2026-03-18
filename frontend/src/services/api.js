import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "vault_jwt";
const DEFAULT_BASE_URL = "https://secretvault.madhih.in";

let inMemoryToken = null;

function normalizeApiBaseUrl(rawBaseUrl) {
    const trimmed = (rawBaseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

    if (trimmed.endsWith("/api")) {
        return trimmed;
    }

    return `${trimmed}/api`;
}

const API_BASE_URL = normalizeApiBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL,
);

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
});

api.interceptors.request.use(async (config) => {
    const token = await getToken();

    if (token) {
        config.headers["x-auth-token"] = token;
    }

    return config;
});

export async function getToken() {
    if (inMemoryToken) {
        return inMemoryToken;
    }

    const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
    inMemoryToken = storedToken;
    return storedToken;
}

export async function setToken(token) {
    inMemoryToken = token;
    await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
    inMemoryToken = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
}

export function getApiBaseUrl() {
    return API_BASE_URL;
}

export function buildSecureFileViewUrlSync(fileId, token, options = {}) {
    const url = new URL(`${API_BASE_URL}/files/${fileId}/view`);

    if (token) {
        url.searchParams.set("token", token);
    }

    if (options.download) {
        url.searchParams.set("download", "1");
    }

    return url.toString();
}

export function buildSecureThumbnailUrlSync(fileId, token) {
    const url = new URL(`${API_BASE_URL}/files/${fileId}/thumbnail`);

    if (token) {
        url.searchParams.set("token", token);
    }

    return url.toString();
}

export async function buildSecureFileViewUrl(fileId, options = {}) {
    const token = options.token || (await getToken());
    return buildSecureFileViewUrlSync(fileId, token, options);
}

export async function buildSecureThumbnailUrl(fileId, tokenOverride) {
    const token = tokenOverride || (await getToken());
    return buildSecureThumbnailUrlSync(fileId, token);
}

export async function login(username, password) {
    const response = await api.post("/login", { username, password });
    const token = response.data?.token;

    if (token) {
        await setToken(token);
    }

    return response;
}

export function changePassword(currentPassword, newPassword) {
    return api.post("/change-password", {
        currentPassword,
        newPassword,
    });
}

export function resetPasswordWithKey(payload) {
    return api.post("/reset-with-key", payload);
}

export function listFiles(params) {
    return api.get("/files", { params });
}

export function syncVaultIndex() {
    return api.post(
        "/files/sync",
        {},
        {
            timeout: 0,
        },
    );
}

export function deleteVaultFile(fileId) {
    return api.delete(`/files/${fileId}`);
}

export function initDirectUploadSession({ fileName, mimeType, fileSize }) {
    return api.post(
        "/upload/init",
        {
            fileName,
            mimeType,
            fileSize,
        },
        {
            timeout: 0,
        },
    );
}

export async function uploadToDriveResumable({
    uploadUrl,
    mimeType,
    fileBlob,
}) {
    const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": mimeType || "application/octet-stream",
        },
        body: fileBlob,
    });

    const rawBody = await response.text();
    let parsedBody = null;

    try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch (_error) {
        parsedBody = null;
    }

    if (!response.ok) {
        const message =
            parsedBody?.error?.message ||
            parsedBody?.message ||
            rawBody ||
            "Direct upload to Google Drive failed.";
        throw new Error(message);
    }

    return {
        status: response.status,
        driveFileId: parsedBody?.id,
        data: parsedBody,
    };
}

export function finalizeDirectUpload({
    originalName,
    mimeType,
    size,
    driveFileId,
    uploadSessionId,
}) {
    return api.post(
        "/upload/finalize",
        {
            originalName,
            mimeType: mimeType || "application/octet-stream",
            size,
            driveFileId,
            uploadSessionId,
        },
        {
            timeout: 0,
        },
    );
}

export function extractApiError(error, fallback) {
    return (
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        fallback
    );
}

export default api;
