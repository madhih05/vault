import { Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../theme/colors";

function formatUploadDate(value) {
    if (!value) {
        return "Unknown";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "Unknown";
    }

    return parsed.toLocaleString();
}

export default function FileListItem({ file, children }) {
    return (
        <View style={styles.card}>
            <Text style={styles.name} numberOfLines={1}>
                {file?.originalName || "Untitled"}
            </Text>
            <Text style={styles.meta}>
                Uploaded {formatUploadDate(file?.uploadDate)}
            </Text>
            <View style={styles.actions}>{children}</View>
        </View>
    );
}

export function ItemActionButton({ title, onPress, danger, warning }) {
    return (
        <Pressable
            style={[
                styles.actionButton,
                danger && styles.actionDanger,
                warning && styles.actionWarning,
            ]}
            onPress={onPress}
        >
            <Text
                style={[
                    styles.actionText,
                    danger && styles.actionDangerText,
                    warning && styles.actionWarningText,
                ]}
            >
                {title}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        gap: 8,
    },
    name: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "700",
    },
    meta: {
        color: colors.textMuted,
        fontSize: 12,
    },
    actions: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    actionButton: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: colors.bgAlt,
    },
    actionText: {
        color: colors.text,
        fontSize: 12,
        fontWeight: "600",
    },
    actionDanger: {
        borderColor: colors.danger,
        backgroundColor: "#3A1D23",
    },
    actionDangerText: {
        color: "#FFC3CC",
    },
    actionWarning: {
        borderColor: colors.warning,
        backgroundColor: "#3A2E1A",
    },
    actionWarningText: {
        color: "#FFDFA3",
    },
});
