import axios from "axios";

const TOKEN_STORAGE_KEY = "vault_jwt";
const secureFileCache = new Map();

function normalizeApiBaseUrl(rawBaseUrl) {
    const normalized = (rawBaseUrl || "https://secretvault.madhih.in").replace(
        /\/+$/,
        "",
    );

    if (normalized.endsWith("/api")) {
        return normalized;
    }

    return `${normalized}/api`;
}

export const API_BASE_URL = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
);

export function buildApiUrl(pathname) {
    const pathWithLeadingSlash = pathname.startsWith("/")
        ? pathname
        : `/${pathname}`;

    return `${API_BASE_URL}${pathWithLeadingSlash}`;
}

export const api = axios.create({
    baseURL: API_BASE_URL,
});

export function getToken() {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    clearSecureFileCache();
}

export function isAuthenticated() {
    return Boolean(getToken());
}

api.interceptors.request.use((config) => {
    const token = getToken();

    if (token) {
        config.headers = config.headers || {};
        config.headers["x-auth-token"] = token;
    }

    return config;
});

export async function login({ username, password }) {
    const response = await api.post("/login", {
        username,
        password,
    });

    const token = response?.data?.token;
    if (!token) {
        throw new Error("Authentication token was not returned by the API.");
    }

    setToken(token);
    return token;
}

export async function changePassword({ currentPassword, newPassword }) {
    const response = await api.post("/change-password", {
        currentPassword,
        newPassword,
    });

    return response.data;
}

export async function resetPasswordWithKey({
    username,
    recoveryKey,
    newPassword,
}) {
    const response = await api.post("/reset-with-key", {
        username,
        recoveryKey,
        newPassword,
    });

    return response.data;
}

export async function listFiles({
    page = 1,
    limit = 50,
    fileType = "",
    fileName = "",
} = {}) {
    const response = await api.get("/files", {
        params: {
            page,
            limit,
            ...(fileType ? { fileType } : {}),
            ...(fileName ? { fileName } : {}),
        },
    });

    return response.data;
}

export async function uploadVaultFile(file, thumbnailBlob) {
    const postUpload = async (includeThumbnail) => {
        const formData = new FormData();
        formData.append("vaultFile", file);

        if (includeThumbnail && thumbnailBlob) {
            const baseName = (file?.name || "file").replace(/\.[^.]+$/, "");
            formData.append(
                "vaultThumbnail",
                thumbnailBlob,
                `${baseName}-thumb.jpg`,
            );
        }

        return api.post("/upload", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
    };

    const isUnexpectedFieldError = (error) => {
        const message =
            error?.response?.data?.error ||
            error?.response?.data?.message ||
            error?.message ||
            "";

        return /unexpected field/i.test(String(message));
    };

    let response;

    try {
        response = await postUpload(true);
    } catch (error) {
        // Some older deployments only accept `vaultFile`; retry without thumbnail.
        if (!thumbnailBlob || !isUnexpectedFieldError(error)) {
            throw error;
        }

        response = await postUpload(false);
    }

    return response.data;
}

export async function deleteVaultFile(fileId) {
    const response = await api.delete(`/files/${fileId}`);
    return response.data;
}

export async function fetchSecureFileBlob(fileId) {
    const response = await api.get(`/files/${fileId}/view`, {
        responseType: "blob",
    });

    return {
        blob: response.data,
        contentType: response.headers["content-type"] || response.data?.type,
    };
}

export async function fetchSecureFileObjectUrl(fileId) {
    const cached = secureFileCache.get(fileId);
    if (cached) {
        return {
            ...cached,
            fromCache: true,
        };
    }

    const { blob, contentType } = await fetchSecureFileBlob(fileId);
    const objectUrl = URL.createObjectURL(blob);

    const payload = {
        blob,
        objectUrl,
        contentType,
    };

    secureFileCache.set(fileId, payload);

    return {
        ...payload,
        fromCache: false,
    };
}

export function evictSecureFileCache(fileId) {
    const cached = secureFileCache.get(fileId);
    if (!cached) {
        return;
    }

    secureFileCache.delete(fileId);
    revokeObjectUrl(cached.objectUrl);
}

export function clearSecureFileCache() {
    for (const entry of secureFileCache.values()) {
        revokeObjectUrl(entry.objectUrl);
    }

    secureFileCache.clear();
}

export function revokeObjectUrl(objectUrl) {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
    }
}

export default api;
