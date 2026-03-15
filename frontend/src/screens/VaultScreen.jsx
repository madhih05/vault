import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import ChangePasswordModal from '../components/ChangePasswordModal'
import PreviewModal from '../components/PreviewModal'
import { DOC_FILTER_OPTIONS, GALLERY_FILTER_OPTIONS, TABS } from '../constants/filters'
import {
  API_BASE_URL,
  buildSecureFileViewUrl,
  changePassword,
  clearToken,
  deleteVaultFile,
  getToken,
  listFiles,
  uploadVaultFile,
} from '../services/api'

function normalizeMimeType(mimeType = '') {
  return String(mimeType).toLowerCase()
}

function isGalleryFile(file) {
  const type = normalizeMimeType(file?.mimeType)
  return type.startsWith('image/') || type.startsWith('video/')
}

function isAudioFile(file) {
  return normalizeMimeType(file?.mimeType).startsWith('audio/')
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString()
}

export default function VaultScreen({ onLogout }) {
  const [activeTab, setActiveTab] = useState(TABS.gallery)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterByTab, setFilterByTab] = useState({ gallery: 'media', docs: 'documents' })

  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState('')

  const [token, setTokenState] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState('')
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('')
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
  })

  useEffect(() => {
    let mounted = true

    const loadToken = async () => {
      const currentToken = await getToken()
      if (!mounted) {
        return
      }

      setTokenState(currentToken || '')
    }

    loadToken()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 250)

    return () => clearTimeout(timeout)
  }, [searchInput])

  const fetchFiles = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh) {
      setLoading(true)
    }

    setError('')

    try {
      let fileType = ''

      if (activeTab === TABS.gallery) {
        fileType = filterByTab.gallery
      }

      if (activeTab === TABS.docs) {
        fileType = filterByTab.docs
      }

      if (activeTab === TABS.audio) {
        fileType = 'audio'
      }

      const response = await listFiles({
        page: 1,
        limit: activeTab === TABS.gallery ? 120 : 100,
        fileType,
        ...(searchQuery ? { fileName: searchQuery } : {}),
      })

      setFiles(response?.files || [])
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error ||
          requestError?.response?.data?.message ||
          requestError?.message ||
          'Unable to fetch files from the vault.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchFiles()
  }, [activeTab, searchQuery, filterByTab.gallery, filterByTab.docs])

  const currentList = useMemo(() => {
    if (activeTab === TABS.gallery) {
      return files.filter(isGalleryFile)
    }

    if (activeTab === TABS.audio) {
      return files.filter(isAudioFile)
    }

    return files.filter((file) => !isGalleryFile(file) && !isAudioFile(file))
  }, [activeTab, files])

  const filterOptions = activeTab === TABS.docs ? DOC_FILTER_OPTIONS : GALLERY_FILTER_OPTIONS
  const activeFilterValue = activeTab === TABS.docs ? filterByTab.docs : filterByTab.gallery

  const thumbnailUrl = (fileId) => {
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${API_BASE_URL}/files/${fileId}/thumbnail${query}`
  }

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: '*/*',
    })

    if (result.canceled) {
      return
    }

    setIsUploading(true)
    setError('')

    try {
      for (const asset of result.assets || []) {
        await uploadVaultFile(asset)
      }

      await fetchFiles({ forceRefresh: true })
    } catch (uploadError) {
      setError(
        uploadError?.response?.data?.error ||
          uploadError?.response?.data?.message ||
          uploadError?.message ||
          'Upload failed.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (file) => {
    setDeletingId(file._id)

    try {
      await deleteVaultFile(file._id)
      setPreviewFile((previous) => (previous?._id === file._id ? null : previous))
      setFiles((previous) => previous.filter((item) => item._id !== file._id))
    } catch (deleteError) {
      setError(deleteError?.response?.data?.error || deleteError?.message || 'Delete failed.')
    } finally {
      setDeletingId('')
    }
  }

  const handleOpenFile = async (file, { download = false } = {}) => {
    try {
      const secureUrl = buildSecureFileViewUrl(file._id, {
        token,
        download,
      })
      await Linking.openURL(secureUrl)
    } catch (openError) {
      setError(openError?.message || 'Unable to open this file.')
    }
  }

  const submitPasswordChange = async () => {
    setChangePasswordSubmitting(true)
    setChangePasswordError('')
    setChangePasswordSuccess('')

    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm({ currentPassword: '', newPassword: '' })
      setChangePasswordSuccess('Password changed successfully.')
    } catch (changeError) {
      setChangePasswordError(
        changeError?.response?.data?.error ||
          changeError?.response?.data?.message ||
          changeError?.message ||
          'Unable to change password.',
      )
    } finally {
      setChangePasswordSubmitting(false)
    }
  }

  const renderListItem = ({ item }) => {
    const isGallery = activeTab === TABS.gallery

    return (
      <Pressable style={styles.row} onPress={() => (isGallery ? setPreviewFile(item) : handleOpenFile(item))}>
        <View style={styles.rowLeft}>
          <Text numberOfLines={1} style={styles.fileName}>
            {item.originalName}
          </Text>
          <Text style={styles.fileMeta}>{formatDate(item.uploadDate)}</Text>
        </View>

        <View style={styles.rowActions}>
          {isGallery ? (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbText}>IMG</Text>
            </View>
          ) : (
            <Pressable style={styles.actionButton} onPress={() => handleOpenFile(item, { download: true })}>
              <Text style={styles.actionButtonLabel}>Download</Text>
            </Pressable>
          )}

          <Pressable style={styles.deleteAction} onPress={() => handleDelete(item)} disabled={deletingId === item._id}>
            <Text style={styles.deleteActionLabel}>{deletingId === item._id ? '...' : 'Delete'}</Text>
          </Pressable>
        </View>
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Vault</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.outlineButton}
            onPress={() => {
              setChangePasswordOpen(true)
              setChangePasswordError('')
              setChangePasswordSuccess('')
            }}
          >
            <Text style={styles.outlineLabel}>Password</Text>
          </Pressable>
          <Pressable
            style={styles.outlineButton}
            onPress={async () => {
              await clearToken()
              onLogout()
            }}
          >
            <Text style={styles.outlineLabel}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search in vault"
        placeholderTextColor="#64748b"
        value={searchInput}
        onChangeText={setSearchInput}
      />

      {activeTab !== TABS.audio ? (
        <View style={styles.filterBar}>
          {filterOptions.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.filterChip, activeFilterValue === option.value && styles.filterChipActive]}
              onPress={() => {
                if (activeTab === TABS.docs) {
                  setFilterByTab((prev) => ({ ...prev, docs: option.value }))
                } else {
                  setFilterByTab((prev) => ({ ...prev, gallery: option.value }))
                }
              }}
            >
              <Text style={styles.filterChipLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centerArea}>
          <ActivityIndicator size="large" color="#22d3ee" />
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item._id}
          renderItem={renderListItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>No files found for current filter.</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true)
            fetchFiles({ forceRefresh: true })
          }} tintColor="#22d3ee" />}
        />
      )}

      <View style={styles.bottomBar}>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, activeTab === TABS.gallery && styles.tabButtonActive]}
            onPress={() => setActiveTab(TABS.gallery)}
          >
            <Text style={styles.tabLabel}>Gallery</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, activeTab === TABS.docs && styles.tabButtonActive]} onPress={() => setActiveTab(TABS.docs)}>
            <Text style={styles.tabLabel}>Docs</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, activeTab === TABS.audio && styles.tabButtonActive]} onPress={() => setActiveTab(TABS.audio)}>
            <Text style={styles.tabLabel}>Audio</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.uploadButton, isUploading && styles.disabled]} disabled={isUploading} onPress={handleUpload}>
          <Text style={styles.uploadLabel}>{isUploading ? 'Uploading...' : 'Upload'}</Text>
        </Pressable>
      </View>

      <PreviewModal
        visible={Boolean(previewFile)}
        file={
          previewFile
            ? {
                ...previewFile,
                viewUrl: buildSecureFileViewUrl(previewFile._id),
                thumbnailUrl: thumbnailUrl(previewFile._id),
              }
            : null
        }
        token={token}
        onClose={() => setPreviewFile(null)}
        onDelete={() => previewFile && handleDelete(previewFile)}
        deleting={deletingId === previewFile?._id}
      />

      <ChangePasswordModal
        visible={changePasswordOpen}
        formState={passwordForm}
        onChange={(field, value) => setPasswordForm((prev) => ({ ...prev, [field]: value }))}
        onClose={() => setChangePasswordOpen(false)}
        onSubmit={submitPasswordChange}
        submitting={changePasswordSubmitting}
        error={changePasswordError}
        success={changePasswordSuccess}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  outlineLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1222',
    color: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 10,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    borderColor: '#22d3ee',
    backgroundColor: '#083344',
  },
  filterChipLabel: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
    marginHorizontal: 12,
    marginTop: 8,
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 130,
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    backgroundColor: '#0f172a',
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  fileMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  rowActions: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 6,
  },
  thumbPlaceholder: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  thumbText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: '#164e63',
    backgroundColor: '#083344',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonLabel: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteAction: {
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteActionLabel: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '600',
  },
  empty: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 24,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderColor: '#22d3ee',
    backgroundColor: '#083344',
  },
  tabLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadLabel: {
    color: '#020617',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
})
