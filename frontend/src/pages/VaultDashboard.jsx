import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AudioView from '../components/vault/AudioView'
import DocumentsView from '../components/vault/DocumentsView'
import FilterDrawer from '../components/vault/FilterDrawer'
import GalleryView from '../components/vault/GalleryView'
import LightboxModal from '../components/vault/LightboxModal'
import UploadFab from '../components/vault/UploadFab'
import {
  clearToken,
  deleteVaultFile,
  fetchSecureFileObjectUrl,
  listFiles,
  revokeObjectUrl,
  uploadVaultFile,
} from '../services/api'

const TAB_LABELS = {
  gallery: 'Gallery',
  audio: 'Audio',
  documents: 'Documents',
  other: 'Other',
}

const UNSUPPORTED_DOWNLOAD_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const normalizeMimeType = (mimeType = '') => mimeType.toLowerCase()

const hasUnsupportedHeicMimeType = (file) =>
  UNSUPPORTED_DOWNLOAD_MIME_TYPES.has(normalizeMimeType(file?.mimeType || ''))

const hasUnsupportedHeicExtension = (file) =>
  /\.(heic|heif)$/i.test(file?.originalName || '')

const isUnsupportedDownloadFile = (file) =>
  hasUnsupportedHeicMimeType(file) || hasUnsupportedHeicExtension(file)

const isMediaMimeType = (file) => {
  const normalizedMimeType = normalizeMimeType(file?.mimeType || '')

  if (isUnsupportedDownloadFile(file)) {
    return false
  }

  return (
    normalizedMimeType.startsWith('image/') ||
    normalizedMimeType.startsWith('video/')
  )
}

const isAudioMimeType = (mimeType = '') => mimeType.startsWith('audio/')

const RECOGNIZED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/csv',
  'application/csv',
  'application/json',
  'text/plain',
  'application/rtf',
])

const isRecognizedDocumentMimeType = (mimeType = '') =>
  RECOGNIZED_DOCUMENT_MIME_TYPES.has(normalizeMimeType(mimeType))

const isUnrecognizedMimeType = (mimeType = '') => {
  const normalizedMimeType = normalizeMimeType(mimeType)
  return (
    !isMediaMimeType({ mimeType: normalizedMimeType }) &&
    !isAudioMimeType(normalizedMimeType) &&
    !isRecognizedDocumentMimeType(normalizedMimeType)
  )
}

function VaultDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('gallery')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [searchDraft, setSearchDraft] = useState('')
  const [typeDraft, setTypeDraft] = useState('')
  const [filters, setFilters] = useState({ fileName: '', fileType: '' })

  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [isUploading, setIsUploading] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const loadFiles = async () => {
    setLoading(true)
    setError('')

    try {
      const baseQuery = {
        page: 1,
        limit: 50,
        fileName: filters.fileName,
      }

      if (filters.fileType) {
        const response = await listFiles({
          ...baseQuery,
          fileType: filters.fileType,
        })
        setFiles(response.files || [])
      } else if (activeTab === 'gallery') {
        const [images, videos] = await Promise.all([
          listFiles({ ...baseQuery, fileType: 'image' }),
          listFiles({ ...baseQuery, fileType: 'video' }),
        ])

        const merged = [...(images.files || []), ...(videos.files || [])]
        const deduped = Array.from(
          new Map(merged.map((item) => [item._id, item])).values(),
        )

        deduped.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
        setFiles(deduped)
      } else if (activeTab === 'audio') {
        const response = await listFiles({
          ...baseQuery,
          fileType: 'audio',
        })
        setFiles(response.files || [])
      } else {
        const response = await listFiles(baseQuery)
        setFiles(response.files || [])
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error ||
          requestError?.message ||
          'Unable to fetch files from the vault.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [activeTab, filters])

  const visibleFiles = useMemo(() => {
    if (activeTab === 'gallery') {
      return files.filter((file) => isMediaMimeType(file))
    }

    if (activeTab === 'other') {
      return files.filter((file) => isUnrecognizedMimeType(file.mimeType))
    }

    if (activeTab === 'audio') {
      return files.filter((file) => isAudioMimeType(file.mimeType))
    }

    return files.filter(
      (file) =>
        !isMediaMimeType(file) &&
        !isAudioMimeType(file.mimeType) &&
        isRecognizedDocumentMimeType(file.mimeType),
    )
  }, [activeTab, files])

  const handleApplyFilters = () => {
    setFilters({
      fileName: searchDraft.trim(),
      fileType: typeDraft,
    })
    setDrawerOpen(false)
  }

  const handleResetFilters = () => {
    setSearchDraft('')
    setTypeDraft('')
    setFilters({ fileName: '', fileType: '' })
  }

  const handleTabChange = (tabName) => {
    setActiveTab(tabName)
    setTypeDraft('')
    setFilters((previous) => ({
      ...previous,
      fileType: '',
    }))
  }

  const handleUpload = async (file) => {
    setIsUploading(true)
    setError('')

    try {
      await uploadVaultFile(file)
      await loadFiles()
    } catch (uploadError) {
      setError(
        uploadError?.response?.data?.error ||
          uploadError?.message ||
          'Upload failed.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (file) => {
    setDeletingId(file._id)
    setError('')

    try {
      await deleteVaultFile(file._id)
      setFiles((previous) => previous.filter((item) => item._id !== file._id))
    } catch (deleteError) {
      setError(
        deleteError?.response?.data?.error ||
          deleteError?.message ||
          'Delete failed.',
      )
      throw deleteError
    } finally {
      setDeletingId('')
    }
  }

  const handleOpenDocument = async (file) => {
    try {
      const secureFile = await fetchSecureFileObjectUrl(file._id)

      if (isUnsupportedDownloadFile(file)) {
        const forcedDownloadAnchor = document.createElement('a')
        forcedDownloadAnchor.href = secureFile.objectUrl
        forcedDownloadAnchor.download = file.originalName
        forcedDownloadAnchor.click()
        window.setTimeout(() => revokeObjectUrl(secureFile.objectUrl), 15000)
        return
      }

      const opened = window.open(
        secureFile.objectUrl,
        '_blank',
        'noopener,noreferrer',
      )

      if (!opened) {
        const downloadAnchor = document.createElement('a')
        downloadAnchor.href = secureFile.objectUrl
        downloadAnchor.download = file.originalName
        downloadAnchor.click()
      }

      window.setTimeout(() => revokeObjectUrl(secureFile.objectUrl), 15000)
    } catch (openError) {
      setError(
        openError?.response?.data?.error ||
          openError?.message ||
          'Unable to securely open the document.',
      )
    }
  }

  const handleLogout = () => {
    clearToken()
    navigate('/', { replace: true })
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    event.stopPropagation()

    const nextTarget = event.relatedTarget
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)

    const droppedFile = event.dataTransfer?.files?.[0]
    if (droppedFile) {
      await handleUpload(droppedFile)
    }
  }

  return (
    <main
      className="min-h-screen bg-gradient-to-b from-stone-100 via-cyan-50 to-stone-100 px-4 py-4 sm:px-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">Secure Vault</p>
              <h1 className="font-serif text-2xl text-slate-900 sm:text-3xl">Dashboard</h1>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>

          <nav className="mt-4 flex gap-2">
            {Object.entries(TAB_LABELS).map(([tabValue, tabLabel]) => (
              <button
                key={tabValue}
                type="button"
                onClick={() => handleTabChange(tabValue)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tabValue
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tabLabel}
              </button>
            ))}
          </nav>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur-sm sm:p-5">
          {activeTab === 'gallery' ? (
            <GalleryView
              files={visibleFiles}
              loading={loading}
              error={error}
              onOpen={setSelectedMedia}
            />
          ) : activeTab === 'audio' ? (
            <AudioView
              files={visibleFiles}
              loading={loading}
              error={error}
              onOpen={setSelectedMedia}
            />
          ) : (
            <DocumentsView
              files={visibleFiles}
              loading={loading}
              error={error}
              deletingId={deletingId}
              onOpen={handleOpenDocument}
              onDelete={handleDelete}
              emptyMessage={
                activeTab === 'other'
                  ? 'No unrecognized file types found for the current filters.'
                  : 'No recognized documents found for the current filters.'
              }
            />
          )}
        </section>
      </div>

      {isDragOver ? (
        <div className="pointer-events-none fixed inset-0 z-[65] grid place-items-center bg-cyan-950/20 p-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-dashed border-cyan-500 bg-white/95 px-6 py-10 text-center shadow-xl">
            <p className="text-lg font-semibold text-cyan-800">Drop file to upload</p>
            <p className="mt-2 text-sm text-slate-600">Supported types are validated by the backend.</p>
          </div>
        </div>
      ) : null}

      <FilterDrawer
        activeTab={activeTab}
        drawerOpen={drawerOpen}
        searchDraft={searchDraft}
        typeDraft={typeDraft}
        onOpen={() => setDrawerOpen(true)}
        onClose={() => setDrawerOpen(false)}
        onSearchChange={setSearchDraft}
        onTypeChange={setTypeDraft}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      <UploadFab onFilePicked={handleUpload} isUploading={isUploading} />

      {selectedMedia ? (
        <LightboxModal
          file={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onDelete={handleDelete}
        />
      ) : null}
    </main>
  )
}

export default VaultDashboard
