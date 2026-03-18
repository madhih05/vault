import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
    clearToken,
    extractApiError,
    getToken,
    login as loginRequest,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [isReady, setIsReady] = useState(false);
    const [token, setTokenState] = useState("");
    const [user, setUser] = useState(null);

    useEffect(() => {
        async function bootstrap() {
            try {
                const storedToken = await getToken();
                if (storedToken) {
                    setTokenState(storedToken);
                }
            } finally {
                setIsReady(true);
            }
        }

        bootstrap();
    }, []);

    async function login(username, password) {
        const response = await loginRequest(username, password);
        const nextToken = response?.data?.token || "";
        const nextUser = response?.data?.user || null;

        if (!nextToken) {
            throw new Error("Token missing from login response.");
        }

        setTokenState(nextToken);
        setUser(nextUser);
        return response;
    }

    async function logout() {
        await clearToken();
        setTokenState("");
        setUser(null);
    }

    const value = useMemo(
        () => ({
            isReady,
            isAuthenticated: Boolean(token),
            token,
            user,
            login,
            logout,
            extractError: extractApiError,
        }),
        [isReady, token, user],
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}
