import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "vault_jwt";
const DEFAULT_BASE_URL = "http://localhost:3000";

let inMemoryToken = null;

function normalizeApiBaseUrl(rawBaseUrl) {
    const trimmed = (rawBaseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

    if (trimmed.endsWith("/api")) {
        return trimmed;
    }

    return `${trimmed}/api`;
}

const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

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

function appendFileToFormData(formData, fieldName, asset) {
    if (!asset?.uri) {
        return;
    }

    formData.append(fieldName, {
        uri: asset.uri,
        name: asset.name || `${fieldName}.bin`,
        type: asset.mimeType || "application/octet-stream",
    });
}

export function uploadVaultFile(asset, options = {}) {
    const formData = new FormData();
    appendFileToFormData(formData, "vaultFile", asset);

    if (options.thumbnailAsset) {
        appendFileToFormData(
            formData,
            "vaultThumbnail",
            options.thumbnailAsset,
        );
    }

    return api.post("/upload", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
        timeout: 0,
        onUploadProgress: options.onUploadProgress,
    });
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

export function finalizeDirectUpload({
    fileName,
    mimeType,
    size,
    fileId,
    uploadSessionId,
    thumbnailAsset,
}) {
    const formData = new FormData();
    formData.append("fileName", fileName);
    formData.append("mimeType", mimeType || "application/octet-stream");
    formData.append("size", String(size));

    if (fileId) {
        formData.append("fileId", fileId);
    }

    if (uploadSessionId) {
        formData.append("uploadSessionId", uploadSessionId);
    }

    if (thumbnailAsset) {
        appendFileToFormData(formData, "vaultThumbnail", thumbnailAsset);
    }

    return api.post("/upload/finalize", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
        timeout: 0,
    });
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
