import axios from "axios";

const TOKEN_STORAGE_KEY = "vault_jwt";
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

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
    const response = await api.post("/api/login", {
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

export async function listFiles({
    page = 1,
    limit = 50,
    fileType = "",
    fileName = "",
} = {}) {
    const response = await api.get("/api/files", {
        params: {
            page,
            limit,
            ...(fileType ? { fileType } : {}),
            ...(fileName ? { fileName } : {}),
        },
    });

    return response.data;
}

export async function uploadVaultFile(file) {
    const formData = new FormData();
    formData.append("vaultFile", file);

    const response = await api.post("/api/upload", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });

    return response.data;
}

export async function deleteVaultFile(fileId) {
    const response = await api.delete(`/api/files/${fileId}`);
    return response.data;
}

export async function fetchSecureFileBlob(fileId) {
    const response = await api.get(`/api/files/${fileId}/view`, {
        responseType: "blob",
    });

    return {
        blob: response.data,
        contentType: response.headers["content-type"] || response.data?.type,
    };
}

export async function fetchSecureFileObjectUrl(fileId) {
    const { blob, contentType } = await fetchSecureFileBlob(fileId);
    const objectUrl = URL.createObjectURL(blob);

    return {
        blob,
        objectUrl,
        contentType,
    };
}

export function revokeObjectUrl(objectUrl) {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
    }
}

export default api;
