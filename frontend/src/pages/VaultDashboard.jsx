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

const THUMBNAIL_SIZE = 150
const THUMBNAIL_QUALITY = 0.78

const isThumbnailEligibleMimeType = (mimeType = '') => {
  const normalizedMimeType = normalizeMimeType(mimeType)
  return normalizedMimeType.startsWith('image/') || normalizedMimeType.startsWith('video/')
}

const blobToObjectUrl = (blob) => URL.createObjectURL(blob)

const canvasToJpegBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode thumbnail image.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      THUMBNAIL_QUALITY,
    )
  })

const drawSquareThumbnail = (source, width, height) => {
  const side = Math.min(width, height)
  const offsetX = Math.max(0, (width - side) / 2)
  const offsetY = Math.max(0, (height - side) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_SIZE
  canvas.height = THUMBNAIL_SIZE

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas context is not available in this browser.')
  }

  context.drawImage(
    source,
    offsetX,
    offsetY,
    side,
    side,
    0,
    0,
    THUMBNAIL_SIZE,
    THUMBNAIL_SIZE,
  )

  return canvas
}

const createImageThumbnailBlob = async (file) => {
  const objectUrl = blobToObjectUrl(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const imageElement = new Image()

      imageElement.onload = () => resolve(imageElement)
      imageElement.onerror = () => reject(new Error('Failed to load image for thumbnail generation.'))
      imageElement.src = objectUrl
    })

    const canvas = drawSquareThumbnail(image, image.naturalWidth, image.naturalHeight)
    return await canvasToJpegBlob(canvas)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const createVideoThumbnailBlob = async (file) => {
  const objectUrl = blobToObjectUrl(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true

  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        video.onloadeddata = null
        video.onerror = null
        video.onseeked = null
      }

      video.onloadeddata = () => {
        const safeSeekTime = Number.isFinite(video.duration)
          ? Math.min(1, Math.max(0, video.duration / 4))
          : 0

        video.currentTime = safeSeekTime
      }

      video.onseeked = () => {
        cleanup()
        resolve()
      }

      video.onerror = () => {
        cleanup()
        reject(new Error('Failed to load video frame for thumbnail generation.'))
      }

      video.src = objectUrl
    })

    const canvas = drawSquareThumbnail(video, video.videoWidth, video.videoHeight)
    return await canvasToJpegBlob(canvas)
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

const createUploadThumbnail = async (file) => {
  if (!isThumbnailEligibleMimeType(file?.type || '')) {
    return null
  }

  if (file.type.startsWith('image/')) {
    return createImageThumbnailBlob(file)
  }

  if (file.type.startsWith('video/')) {
    return createVideoThumbnailBlob(file)
  }

  return null
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
      let thumbnailBlob = null

      try {
        thumbnailBlob = await createUploadThumbnail(file)
      } catch (thumbnailError) {
        console.warn('Thumbnail generation failed. Uploading without custom thumbnail.', thumbnailError)
      }

      await uploadVaultFile(file, thumbnailBlob)
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
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-3 py-4 sm:px-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 rounded-2xl border border-slate-700/70 bg-slate-900/80 p-4 shadow-sm backdrop-blur-sm sm:mb-5 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Secure Vault</p>
              <h1 className="font-serif text-2xl text-slate-100 sm:text-3xl">Dashboard</h1>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {Object.entries(TAB_LABELS).map(([tabValue, tabLabel]) => (
              <button
                key={tabValue}
                type="button"
                onClick={() => handleTabChange(tabValue)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                  activeTab === tabValue
                    ? 'bg-cyan-500 text-slate-950'
                    : 'border border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {tabLabel}
              </button>
            ))}
          </nav>
        </header>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-3 shadow-sm backdrop-blur-sm sm:p-5">
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
        <div className="pointer-events-none fixed inset-0 z-[65] grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border-2 border-dashed border-cyan-400 bg-slate-900/95 px-6 py-8 text-center shadow-xl sm:py-10">
            <p className="text-lg font-semibold text-cyan-300">Drop file to upload</p>
            <p className="mt-2 text-sm text-slate-300">Supported types are validated by the backend.</p>
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
