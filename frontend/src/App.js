import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import LoginScreen from "./components/LoginScreen";
import VaultScreen from "./screens/VaultScreen";
import { isAuthenticated } from "./services/api";

export default function RootApp() {
    const [bootstrapping, setBootstrapping] = useState(true);
    const [signedIn, setSignedIn] = useState(false);

    useEffect(() => {
        let mounted = true;

        const bootstrap = async () => {
            const authenticated = await isAuthenticated();
            if (!mounted) {
                return;
            }

            setSignedIn(authenticated);
            setBootstrapping(false);
        };

        bootstrap();

        return () => {
            mounted = false;
        };
    }, []);

    if (bootstrapping) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#22d3ee" />
            </View>
        );
    }

    if (!signedIn) {
        return <LoginScreen onLoginSuccess={() => setSignedIn(true)} />;
    }

    return <VaultScreen onLogout={() => setSignedIn(false)} />;
}

const styles = StyleSheet.create({
    centered: {
        flex: 1,
        backgroundColor: "#020617",
        alignItems: "center",
        justifyContent: "center",
    },
});
