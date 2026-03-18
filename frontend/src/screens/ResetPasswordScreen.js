import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import colors from "../theme/colors";
import { extractApiError, resetPasswordWithKey } from "../services/api";

export default function ResetPasswordScreen() {
    const [username, setUsername] = useState("");
    const [recoveryKey, setRecoveryKey] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState({ type: "", message: "" });

    const canSubmit = useMemo(() => {
        return (
            !submitting &&
            username.trim().length > 0 &&
            recoveryKey.trim().length > 0 &&
            newPassword.length >= 8
        );
    }, [newPassword.length, recoveryKey, submitting, username]);

    async function handleSubmit() {
        if (!canSubmit) {
            setStatus({ type: "error", message: "All fields are required." });
            return;
        }

        setSubmitting(true);
        setStatus({ type: "", message: "" });

        try {
            await resetPasswordWithKey({
                username: username.trim(),
                recoveryKey: recoveryKey.trim().toUpperCase(),
                newPassword,
            });

            setStatus({
                type: "success",
                message: "Password updated successfully.",
            });
            setUsername("");
            setRecoveryKey("");
            setNewPassword("");
        } catch (error) {
            setStatus({
                type: "error",
                message: extractApiError(error, "Could not reset password."),
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>
                    Use your recovery key format: XXXX-XXXX-XXXX-XXXX
                </Text>

                {status.message ? (
                    <Text
                        style={
                            status.type === "success"
                                ? styles.successText
                                : styles.errorText
                        }
                    >
                        {status.message}
                    </Text>
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
                    value={recoveryKey}
                    onChangeText={setRecoveryKey}
                    style={styles.input}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="Recovery key"
                    placeholderTextColor={colors.textMuted}
                />

                <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    style={styles.input}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="New password"
                    placeholderTextColor={colors.textMuted}
                />

                <Pressable
                    style={[styles.button, !canSubmit && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                >
                    <Text style={styles.buttonText}>
                        {submitting ? "Updating..." : "Update Password"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
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
    title: {
        color: colors.text,
        fontSize: 22,
        fontWeight: "800",
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: 13,
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
        backgroundColor: colors.warning,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: "center",
        marginTop: 4,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: colors.bg,
        fontWeight: "700",
        fontSize: 15,
    },
    errorText: {
        color: colors.danger,
        fontSize: 13,
    },
    successText: {
        color: colors.accent,
        fontSize: 13,
    },
});
