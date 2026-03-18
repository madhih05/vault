import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import FileListItem, { ItemActionButton } from "../components/FileListItem";
import { useAuth } from "../context/AuthContext";
import {
    buildSecureFileViewUrlSync,
    buildSecureThumbnailUrlSync,
    changePassword,
    deleteVaultFile,
    extractApiError,
    finalizeDirectUpload,
    initDirectUploadSession,
    listFiles,
    syncVaultIndex,
    uploadToDriveResumable,
} from "../services/api";
import colors from "../theme/colors";

const SEARCH_DEBOUNCE_MS = 280;

const TAB_ITEMS = [
    { id: "gallery", label: "Gallery" },
    { id: "docs", label: "Docs" },
    { id: "audio", label: "Audio" },
];

const FILTERS = {
    gallery: [
        { value: "media", label: "All Media" },
        { value: "image", label: "Images" },
        { value: "video", label: "Videos" },
    ],
    docs: [
        { value: "documents", label: "All Documents" },
        { value: "pdf", label: "PDF" },
        { value: "doc", label: "DOC" },
        { value: "docx", label: "DOCX" },
        { value: "txt", label: "TXT" },
        { value: "csv", label: "CSV" },
        { value: "json", label: "JSON" },
    ],
};

function queueId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isBusyUpload(queueItems) {
    return queueItems.some((item) => item.status === "uploading");
}

export default function VaultScreen() {
    const { token, logout } = useAuth();

    const [activeTab, setActiveTab] = useState("gallery");
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [tabFilters, setTabFilters] = useState({
        gallery: "media",
        docs: "documents",
    });

    const [galleryFiles, setGalleryFiles] = useState([]);
    const [docFiles, setDocFiles] = useState([]);
    const [audioFiles, setAudioFiles] = useState([]);
    const [galleryPagination, setGalleryPagination] = useState({
        page: 1,
        hasNextPage: false,
    });

    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [errorBanner, setErrorBanner] = useState("");
    const [syncBanner, setSyncBanner] = useState({ type: "", message: "" });

    const [uploadQueue, setUploadQueue] = useState([]);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [changePasswordForm, setChangePasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
    });
    const [changePasswordSubmitting, setChangePasswordSubmitting] =
        useState(false);
    const [changePasswordResult, setChangePasswordResult] = useState({
        type: "",
        message: "",
    });

    const activeFilter =
        activeTab === "gallery" || activeTab === "docs"
            ? tabFilters[activeTab]
            : "audio";

    const displayFiles = useMemo(() => {
        if (activeTab === "gallery") {
            return galleryFiles;
        }

        if (activeTab === "docs") {
            return docFiles;
        }

        return audioFiles;
    }, [activeTab, audioFiles, docFiles, galleryFiles]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setSearchQuery(searchInput.trim());
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [searchInput]);

    useEffect(() => {
        refreshActiveTab();
    }, [activeTab, searchQuery, tabFilters.gallery, tabFilters.docs]);

    async function loadFiles({ tab, appendGallery = false }) {
        setLoading(true);
        setErrorBanner("");

        try {
            if (tab === "gallery") {
                const page = appendGallery ? galleryPagination.page + 1 : 1;
                const response = await listFiles({
                    page,
                    limit: 60,
                    fileType: tabFilters.gallery,
                    fileName: searchQuery || undefined,
                });

                const fetched = response?.data?.files || [];
                const pagination = response?.data?.pagination || {};

                setGalleryFiles((current) =>
                    appendGallery ? [...current, ...fetched] : fetched,
                );
                setGalleryPagination({
                    page,
                    hasNextPage: Boolean(pagination.hasNextPage),
                });
                return;
            }

            if (tab === "docs") {
                const response = await listFiles({
                    page: 1,
                    limit: 80,
                    fileType: tabFilters.docs,
                    fileName: searchQuery || undefined,
                });

                setDocFiles(response?.data?.files || []);
                return;
            }

            const response = await listFiles({
                page: 1,
                limit: 80,
                fileType: "audio",
                fileName: searchQuery || undefined,
            });
            setAudioFiles(response?.data?.files || []);
        } catch (error) {
            setErrorBanner(
                extractApiError(error, "Failed to fetch vault files."),
            );
        } finally {
            setLoading(false);
        }
    }

    async function refreshActiveTab() {
        await loadFiles({ tab: activeTab, appendGallery: false });
    }

    async function loadMoreGallery() {
        if (
            activeTab !== "gallery" ||
            loading ||
            !galleryPagination.hasNextPage
        ) {
            return;
        }

        await loadFiles({ tab: "gallery", appendGallery: true });
    }

    async function handleSuperRefresh() {
        setSyncing(true);
        setSyncBanner({ type: "", message: "" });
        setErrorBanner("");

        try {
            const response = await syncVaultIndex();
            const addedCount = response?.data?.addedCount || 0;
            const scannedCount = response?.data?.scannedCount || 0;

            setSyncBanner({
                type: "success",
                message:
                    addedCount > 0
                        ? `Indexed ${addedCount} new file${addedCount === 1 ? "" : "s"}.`
                        : scannedCount > 0
                          ? "Vault index is already up to date."
                          : "Sync complete.",
            });

            await refreshActiveTab();
        } catch (error) {
            setSyncBanner({
                type: "error",
                message: extractApiError(error, "Super refresh failed."),
            });
        } finally {
            setSyncing(false);
        }
    }

    async function openFile(file, download = false) {
        try {
            const secureUrl = buildSecureFileViewUrlSync(file._id, token, {
                download,
            });
            await Linking.openURL(secureUrl);
        } catch (error) {
            setErrorBanner(extractApiError(error, "Unable to open file."));
        }
    }

    function askDelete(file) {
        Alert.alert(
            "Delete file",
            `Delete ${file.originalName || "this file"}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteVaultFile(file._id);
                            setGalleryFiles((current) =>
                                current.filter((item) => item._id !== file._id),
                            );
                            setDocFiles((current) =>
                                current.filter((item) => item._id !== file._id),
                            );
                            setAudioFiles((current) =>
                                current.filter((item) => item._id !== file._id),
                            );
                        } catch (error) {
                            setErrorBanner(
                                extractApiError(
                                    error,
                                    "Unable to delete file.",
                                ),
                            );
                        }
                    },
                },
            ],
        );
    }

    async function runUploadQueue(initialQueue) {
        for (const queuedItem of initialQueue) {
            let currentUploadSessionId = "";
            let currentResolvedSize = Number(queuedItem.asset.size) || 1;
            let currentResolvedMimeType =
                queuedItem.asset.mimeType || "application/octet-stream";

            setUploadQueue((current) =>
                current.map((item) =>
                    item.id === queuedItem.id
                        ? {
                              ...item,
                              status: "uploading",
                              progress: 0,
                              error: "",
                          }
                        : item,
                ),
            );

            try {
                const sourceResponse = await fetch(queuedItem.asset.uri);

                if (!sourceResponse.ok) {
                    throw new Error("Unable to read selected file.");
                }

                const fileBlob = await sourceResponse.blob();
                const resolvedSize =
                    Number(queuedItem.asset.size) > 0
                        ? Number(queuedItem.asset.size)
                        : fileBlob.size;
                const resolvedMimeType =
                    queuedItem.asset.mimeType || "application/octet-stream";

                currentResolvedSize = resolvedSize;
                currentResolvedMimeType = resolvedMimeType;

                const initResponse = await initDirectUploadSession({
                    fileName: queuedItem.asset.name || "vault-file",
                    mimeType: resolvedMimeType,
                    fileSize: resolvedSize,
                });

                const uploadUrl = initResponse?.data?.uploadUrl;
                const uploadSessionId = initResponse?.data?.uploadSessionId;
                currentUploadSessionId = uploadSessionId || "";

                if (!uploadUrl) {
                    throw new Error("Upload session URL was not returned.");
                }

                setUploadQueue((current) =>
                    current.map((item) =>
                        item.id === queuedItem.id
                            ? {
                                  ...item,
                                  progress: 35,
                              }
                            : item,
                    ),
                );

                const driveUploadResult = await uploadToDriveResumable({
                    uploadUrl,
                    mimeType: resolvedMimeType,
                    fileBlob,
                });

                setUploadQueue((current) =>
                    current.map((item) =>
                        item.id === queuedItem.id
                            ? {
                                  ...item,
                                  progress: 80,
                              }
                            : item,
                    ),
                );

                const driveFileId = driveUploadResult?.driveFileId;

                await finalizeDirectUpload({
                    originalName: queuedItem.asset.name || "vault-file",
                    mimeType: resolvedMimeType,
                    size: resolvedSize,
                    driveFileId,
                    uploadSessionId,
                });

                setUploadQueue((current) =>
                    current.map((item) =>
                        item.id === queuedItem.id
                            ? {
                                  ...item,
                                  status: "completed",
                                  progress: 100,
                              }
                            : item,
                    ),
                );
            } catch (error) {
                const isFetchFailure = String(error?.message || "")
                    .toLowerCase()
                    .includes("failed to fetch");

                if (isFetchFailure && currentUploadSessionId) {
                    try {
                        for (let attempt = 1; attempt <= 6; attempt += 1) {
                            try {
                                await finalizeDirectUpload({
                                    originalName:
                                        queuedItem.asset.name || "vault-file",
                                    mimeType: currentResolvedMimeType,
                                    size: currentResolvedSize,
                                    uploadSessionId: currentUploadSessionId,
                                });
                                break;
                            } catch (finalizeError) {
                                const status = finalizeError?.response?.status;
                                const shouldRetry =
                                    status === 404 && attempt < 6;

                                if (!shouldRetry) {
                                    throw finalizeError;
                                }

                                await new Promise((resolve) =>
                                    setTimeout(resolve, 600 * attempt),
                                );
                            }
                        }

                        setUploadQueue((current) =>
                            current.map((item) =>
                                item.id === queuedItem.id
                                    ? {
                                          ...item,
                                          status: "completed",
                                          progress: 100,
                                      }
                                    : item,
                            ),
                        );
                        continue;
                    } catch (_ignoredRecoveryError) {
                        // Fall through to normal error handling.
                    }
                }

                setUploadQueue((current) =>
                    current.map((item) =>
                        item.id === queuedItem.id
                            ? {
                                  ...item,
                                  status: "failed",
                                  progress: 100,
                                  error: extractApiError(
                                      error,
                                      "Upload failed.",
                                  ),
                              }
                            : item,
                    ),
                );
            }
        }

        try {
            await refreshActiveTab();
        } catch (refreshError) {
            setErrorBanner(
                extractApiError(
                    refreshError,
                    "Upload completed but gallery refresh failed.",
                ),
            );
        }
    }

    async function handleUploadPress() {
        if (isBusyUpload(uploadQueue)) {
            return;
        }

        const result = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: true,
            type: "*/*",
        });

        if (result.canceled || !result.assets?.length) {
            return;
        }

        const nextQueueItems = result.assets.map((asset) => ({
            id: queueId(),
            asset,
            status: "queued",
            progress: 0,
            error: "",
        }));

        setUploadQueue((current) => [...current, ...nextQueueItems]);
        await runUploadQueue(nextQueueItems);
    }

    async function submitChangePassword() {
        if (
            !changePasswordForm.currentPassword ||
            !changePasswordForm.newPassword
        ) {
            setChangePasswordResult({
                type: "error",
                message: "Both fields are required.",
            });
            return;
        }

        setChangePasswordSubmitting(true);
        setChangePasswordResult({ type: "", message: "" });

        try {
            await changePassword(
                changePasswordForm.currentPassword,
                changePasswordForm.newPassword,
            );
            setChangePasswordResult({
                type: "success",
                message: "Password changed successfully.",
            });
            setChangePasswordForm({ currentPassword: "", newPassword: "" });
        } catch (error) {
            setChangePasswordResult({
                type: "error",
                message: extractApiError(error, "Could not change password."),
            });
        } finally {
            setChangePasswordSubmitting(false);
        }
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={refreshActiveTab}
                        tintColor={colors.accent}
                    />
                }
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.eyebrow}>Secure Vault</Text>
                        <Text style={styles.title}>Vault Dashboard</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            style={styles.headerButton}
                            onPress={() => setShowPasswordModal(true)}
                        >
                            <Text style={styles.headerButtonText}>
                                Password
                            </Text>
                        </Pressable>
                        <Pressable style={styles.headerButton} onPress={logout}>
                            <Text style={styles.headerButtonText}>Logout</Text>
                        </Pressable>
                    </View>
                </View>

                <TextInput
                    value={searchInput}
                    onChangeText={setSearchInput}
                    style={styles.searchInput}
                    placeholder="Search by file name"
                    placeholderTextColor={colors.textMuted}
                />

                <View style={styles.tabRow}>
                    {TAB_ITEMS.map((tab) => (
                        <Pressable
                            key={tab.id}
                            style={[
                                styles.tabButton,
                                activeTab === tab.id && styles.tabButtonActive,
                            ]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Text
                                style={[
                                    styles.tabText,
                                    activeTab === tab.id &&
                                        styles.tabTextActive,
                                ]}
                            >
                                {tab.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {(activeTab === "gallery" || activeTab === "docs") && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterRow}
                    >
                        {(FILTERS[activeTab] || []).map((filterItem) => {
                            const isSelected =
                                activeFilter === filterItem.value;
                            return (
                                <Pressable
                                    key={filterItem.value}
                                    style={[
                                        styles.filterChip,
                                        isSelected && styles.filterChipActive,
                                    ]}
                                    onPress={() =>
                                        setTabFilters((current) => ({
                                            ...current,
                                            [activeTab]: filterItem.value,
                                        }))
                                    }
                                >
                                    <Text
                                        style={[
                                            styles.filterText,
                                            isSelected &&
                                                styles.filterTextActive,
                                        ]}
                                    >
                                        {filterItem.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}

                <View style={styles.primaryActionsRow}>
                    <Pressable
                        style={styles.syncButton}
                        onPress={handleSuperRefresh}
                        disabled={syncing}
                    >
                        <Text style={styles.syncText}>
                            {syncing ? "Syncing..." : "Super Refresh"}
                        </Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.uploadButton,
                            isBusyUpload(uploadQueue) && styles.buttonDisabled,
                        ]}
                        onPress={handleUploadPress}
                        disabled={isBusyUpload(uploadQueue)}
                    >
                        <Text style={styles.uploadText}>
                            {isBusyUpload(uploadQueue)
                                ? "Uploading..."
                                : "Upload"}
                        </Text>
                    </Pressable>
                </View>

                {errorBanner ? (
                    <Text style={styles.errorBanner}>{errorBanner}</Text>
                ) : null}
                {syncBanner.message ? (
                    <Text
                        style={
                            syncBanner.type === "error"
                                ? styles.errorBanner
                                : styles.successBanner
                        }
                    >
                        {syncBanner.message}
                    </Text>
                ) : null}

                {activeTab === "gallery" ? (
                    <View style={styles.galleryGrid}>
                        {galleryFiles.map((file) => {
                            const thumbnailUrl = buildSecureThumbnailUrlSync(
                                file._id,
                                token,
                            );
                            return (
                                <Pressable
                                    key={file._id}
                                    style={styles.galleryTile}
                                    onPress={() => openFile(file, false)}
                                    onLongPress={() => askDelete(file)}
                                >
                                    <Image
                                        source={{ uri: thumbnailUrl }}
                                        style={styles.galleryImage}
                                        resizeMode="cover"
                                    />
                                    <Text
                                        style={styles.galleryLabel}
                                        numberOfLines={1}
                                    >
                                        {file.originalName}
                                    </Text>
                                </Pressable>
                            );
                        })}

                        {!galleryFiles.length && !loading ? (
                            <Text style={styles.emptyText}>
                                No media files found.
                            </Text>
                        ) : null}

                        {galleryPagination.hasNextPage ? (
                            <Pressable
                                style={styles.loadMoreButton}
                                onPress={loadMoreGallery}
                            >
                                <Text style={styles.loadMoreText}>
                                    Load more
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : (
                    <View style={styles.listWrap}>
                        {displayFiles.map((file) => (
                            <FileListItem key={file._id} file={file}>
                                <ItemActionButton
                                    title="Open"
                                    onPress={() => openFile(file, false)}
                                />
                                <ItemActionButton
                                    title="Download"
                                    warning
                                    onPress={() => openFile(file, true)}
                                />
                                <ItemActionButton
                                    title="Delete"
                                    danger
                                    onPress={() => askDelete(file)}
                                />
                            </FileListItem>
                        ))}

                        {!displayFiles.length && !loading ? (
                            <Text style={styles.emptyText}>
                                No files found.
                            </Text>
                        ) : null}
                    </View>
                )}

                {uploadQueue.length > 0 ? (
                    <View style={styles.queueWrap}>
                        <Text style={styles.queueTitle}>Upload Queue</Text>
                        {uploadQueue.map((item) => (
                            <View key={item.id} style={styles.queueItem}>
                                <View style={styles.queueRow}>
                                    <Text
                                        style={styles.queueName}
                                        numberOfLines={1}
                                    >
                                        {item.asset?.name || "Unnamed file"}
                                    </Text>
                                    <Text style={styles.queueMeta}>
                                        {item.progress}%
                                    </Text>
                                </View>
                                <Text style={styles.queueMeta}>
                                    {item.status}
                                </Text>
                                {item.error ? (
                                    <Text style={styles.queueError}>
                                        {item.error}
                                    </Text>
                                ) : null}
                            </View>
                        ))}
                    </View>
                ) : null}

                {loading ? (
                    <View style={styles.loaderWrap}>
                        <ActivityIndicator size="small" color={colors.accent} />
                    </View>
                ) : null}
            </ScrollView>

            <Modal
                animationType="slide"
                transparent
                visible={showPasswordModal}
                onRequestClose={() => setShowPasswordModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Change Password</Text>

                        {changePasswordResult.message ? (
                            <Text
                                style={
                                    changePasswordResult.type === "success"
                                        ? styles.successBanner
                                        : styles.errorBanner
                                }
                            >
                                {changePasswordResult.message}
                            </Text>
                        ) : null}

                        <TextInput
                            value={changePasswordForm.currentPassword}
                            onChangeText={(value) =>
                                setChangePasswordForm((current) => ({
                                    ...current,
                                    currentPassword: value,
                                }))
                            }
                            style={styles.searchInput}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder="Current password"
                            placeholderTextColor={colors.textMuted}
                        />

                        <TextInput
                            value={changePasswordForm.newPassword}
                            onChangeText={(value) =>
                                setChangePasswordForm((current) => ({
                                    ...current,
                                    newPassword: value,
                                }))
                            }
                            style={styles.searchInput}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder="New password"
                            placeholderTextColor={colors.textMuted}
                        />

                        <View style={styles.modalActions}>
                            <Pressable
                                style={styles.headerButton}
                                onPress={() => setShowPasswordModal(false)}
                            >
                                <Text style={styles.headerButtonText}>
                                    Close
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.uploadButton,
                                    changePasswordSubmitting &&
                                        styles.buttonDisabled,
                                ]}
                                onPress={submitChangePassword}
                                disabled={changePasswordSubmitting}
                            >
                                <Text style={styles.uploadText}>
                                    {changePasswordSubmitting
                                        ? "Saving..."
                                        : "Save"}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 16,
        gap: 12,
        paddingBottom: 32,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    eyebrow: {
        color: colors.accent,
        letterSpacing: 1,
        fontSize: 11,
        textTransform: "uppercase",
        fontWeight: "700",
    },
    title: {
        color: colors.text,
        fontSize: 23,
        fontWeight: "800",
    },
    headerActions: {
        flexDirection: "row",
        gap: 8,
    },
    headerButton: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: colors.surface,
    },
    headerButtonText: {
        color: colors.text,
        fontSize: 12,
        fontWeight: "700",
    },
    searchInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.text,
    },
    tabRow: {
        flexDirection: "row",
        gap: 8,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        backgroundColor: colors.surface,
    },
    tabButtonActive: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    tabText: {
        color: colors.text,
        fontWeight: "700",
        fontSize: 13,
    },
    tabTextActive: {
        color: colors.bg,
    },
    filterRow: {
        gap: 8,
        paddingVertical: 4,
    },
    filterChip: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.surface,
    },
    filterChipActive: {
        backgroundColor: colors.warning,
        borderColor: colors.warning,
    },
    filterText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: "700",
    },
    filterTextActive: {
        color: colors.bg,
    },
    primaryActionsRow: {
        flexDirection: "row",
        gap: 8,
    },
    syncButton: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.warning,
        backgroundColor: "#3A2E1A",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
    },
    syncText: {
        color: "#FFDFA3",
        fontWeight: "700",
        fontSize: 13,
    },
    uploadButton: {
        flex: 1,
        borderRadius: 12,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
    },
    uploadText: {
        color: colors.bg,
        fontWeight: "800",
        fontSize: 13,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    errorBanner: {
        color: "#FFC6CC",
        backgroundColor: "#3A1D23",
        borderColor: colors.danger,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 12,
    },
    successBanner: {
        color: "#BDF8DF",
        backgroundColor: "#143429",
        borderColor: colors.accent,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 12,
    },
    galleryGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    galleryTile: {
        width: "31%",
        minWidth: 104,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        overflow: "hidden",
    },
    galleryImage: {
        width: "100%",
        height: 96,
        backgroundColor: colors.bgAlt,
    },
    galleryLabel: {
        color: colors.text,
        fontSize: 11,
        paddingHorizontal: 8,
        paddingVertical: 7,
    },
    listWrap: {
        gap: 8,
    },
    emptyText: {
        color: colors.textMuted,
        textAlign: "center",
        paddingVertical: 18,
        fontSize: 13,
    },
    queueWrap: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: colors.surface,
        padding: 12,
        gap: 8,
    },
    queueTitle: {
        color: colors.warning,
        fontWeight: "800",
        fontSize: 13,
    },
    queueItem: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: 8,
        gap: 3,
        backgroundColor: colors.bgAlt,
    },
    queueRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 8,
    },
    queueName: {
        flex: 1,
        color: colors.text,
        fontSize: 12,
        fontWeight: "700",
    },
    queueMeta: {
        color: colors.textMuted,
        fontSize: 11,
    },
    queueError: {
        color: colors.danger,
        fontSize: 11,
    },
    loadMoreButton: {
        width: "100%",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
        backgroundColor: colors.surface,
    },
    loadMoreText: {
        color: colors.text,
        fontSize: 12,
        fontWeight: "700",
    },
    loaderWrap: {
        paddingVertical: 14,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0, 0, 0, 0.45)",
    },
    modalCard: {
        backgroundColor: colors.bg,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        padding: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
    },
    modalActions: {
        flexDirection: "row",
        gap: 8,
        marginTop: 4,
    },
});
