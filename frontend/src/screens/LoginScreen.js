import { useMemo, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import colors from "../theme/colors";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen({ navigation }) {
    const { login, extractError } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const canSubmit = useMemo(() => {
        return (
            !submitting && username.trim().length > 0 && password.length >= 8
        );
    }, [password.length, submitting, username]);

    async function handleSubmit() {
        if (!canSubmit) {
            return;
        }

        setSubmitting(true);
        setErrorMessage("");

        try {
            await login(username.trim(), password);
        } catch (error) {
            setErrorMessage(extractError(error, "Failed to log in."));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <View style={styles.card}>
                <Text style={styles.eyebrow}>Secure Access</Text>
                <Text style={styles.title}>Vault Control Center</Text>
                <Text style={styles.subtitle}>
                    Authenticate to access encrypted files and media workflows.
                </Text>

                {errorMessage ? (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                ) : null}

                <TextInput
                    value={username}
                    onChangeText={setUsername}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Username"
                    placeholderTextColor={colors.textMuted}
                />

                <TextInput
                    value={password}
                    onChangeText={setPassword}
                    style={styles.input}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Password (min 8 chars)"
                    placeholderTextColor={colors.textMuted}
                />

                <Pressable
                    style={[styles.button, !canSubmit && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                >
                    <Text style={styles.buttonText}>
                        {submitting ? "Verifying..." : "Enter Vault"}
                    </Text>
                </Pressable>

                <Pressable
                    style={styles.secondaryButton}
                    onPress={() => navigation.navigate("ResetPassword")}
                >
                    <Text style={styles.secondaryButtonText}>
                        Reset password with recovery key
                    </Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: "center",
        padding: 20,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 20,
        gap: 12,
    },
    eyebrow: {
        color: colors.accent,
        fontWeight: "700",
        letterSpacing: 1,
        textTransform: "uppercase",
        fontSize: 12,
    },
    title: {
        color: colors.text,
        fontSize: 28,
        fontWeight: "800",
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: 14,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.text,
        backgroundColor: colors.bgAlt,
    },
    button: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: "center",
        marginTop: 4,
    },
    buttonDisabled: {
        opacity: 0.55,
    },
    buttonText: {
        color: colors.bg,
        fontWeight: "700",
        fontSize: 15,
    },
    secondaryButton: {
        alignItems: "center",
        paddingVertical: 6,
    },
    secondaryButtonText: {
        color: colors.warning,
        fontWeight: "600",
        fontSize: 13,
    },
    errorText: {
        color: colors.danger,
        fontSize: 13,
    },
});
