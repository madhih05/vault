import { ActivityIndicator, StyleSheet, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "../screens/LoginScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import VaultScreen from "../screens/VaultScreen";
import { useAuth } from "../context/AuthContext";
import colors from "../theme/colors";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    const { isReady, isAuthenticated } = useAuth();

    if (!isReady) {
        return (
            <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                contentStyle: { backgroundColor: colors.bg },
            }}
        >
            {!isAuthenticated ? (
                <>
                    <Stack.Screen
                        name="Login"
                        component={LoginScreen}
                        options={{ title: "Vault Login" }}
                    />
                    <Stack.Screen
                        name="ResetPassword"
                        component={ResetPasswordScreen}
                        options={{ title: "Reset Password" }}
                    />
                </>
            ) : (
                <Stack.Screen
                    name="Vault"
                    component={VaultScreen}
                    options={{ title: "Vault" }}
                />
            )}
        </Stack.Navigator>
    );
}

const styles = StyleSheet.create({
    loaderWrap: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
    },
});
