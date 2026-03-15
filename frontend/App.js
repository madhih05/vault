import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import RootApp from "./src/App";

export default function App() {
    return (
        <SafeAreaProvider>
            <StatusBar style="light" />
            <RootApp />
        </SafeAreaProvider>
    );
}
