import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  API_BASE_URL,
  changePassword,
  clearToken,
  deleteVaultFile,
  evictSecureFileCache,
  fetchSecureFileObjectUrl,
  getToken,
  listFiles,
  revokeObjectUrl,
  uploadVaultFile,
} from '../services/api'

const THUMBNAIL_SIZE = 150
const THUMBNAIL_QUALITY = 0.78
const SWIPE_THRESHOLD = 40
const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const normalizeMimeType = (mimeType = '') => mimeType.toLowerCase()

const hasHeicMimeType = (file) => HEIC_MIME_TYPES.has(normalizeMimeType(file?.mimeType || ''))

const hasHeicExtension = (file) => /\.(heic|heif)$/i.test(file?.originalName || '')

const isHeicFile = (file) => hasHeicMimeType(file) || hasHeicExtension(file)

const isGalleryMediaFile = (file) => {
  if (isHeicFile(file)) {
    return false
  }

  const mime = normalizeMimeType(file?.mimeType || '')
  return mime.startsWith('image/') || mime.startsWith('video/')
}

const isVideoFile = (file) => normalizeMimeType(file?.mimeType || '').startsWith('video/')

const isAudioFile = (file) => normalizeMimeType(file?.mimeType || '').startsWith('audio/')

const isDocumentFile = (file) => !isGalleryMediaFile(file) && !isAudioFile(file)

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

const iconClass = 'h-5 w-5'

function VaultDashboard() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [activeTab, setActiveTab] = useState('gallery')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [galleryFiles, setGalleryFiles] = useState([])
  const [docFiles, setDocFiles] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const [docMenuId, setDocMenuId] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState('')
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('')
  const [passwordFormState, setPasswordFormState] = useState({
    currentPassword: '',
    newPassword: '',
  })

  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [lightboxObjectUrl, setLightboxObjectUrl] = useState('')
  const [lightboxMimeType, setLightboxMimeType] = useState('')
  const [lightboxLoading, setLightboxLoading] = useState(false)
  const [lightboxError, setLightboxError] = useState('')

  const [touchStartX, setTouchStartX] = useState(0)

  const thumbnailApiBaseUrl = API_BASE_URL || 'https://secretvault.madhih.in/api'
  const thumbnailToken = sessionStorage.getItem('token') || getToken() || ''

  const activeLightboxFile = lightboxIndex >= 0 ? galleryFiles[lightboxIndex] : null

  useEffect(() => {
    const debounce = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 280)

    return () => window.clearTimeout(debounce)
  }, [searchInput])

  const loadGalleryFiles = async (fileName) => {
    const baseQuery = {
      page: 1,
      limit: 80,
      ...(fileName ? { fileName } : {}),
    }

    const [imageResponse, videoResponse] = await Promise.all([
      listFiles({ ...baseQuery, fileType: 'image' }),
      listFiles({ ...baseQuery, fileType: 'video' }),
    ])

    const merged = [...(imageResponse.files || []), ...(videoResponse.files || [])]
    const deduped = Array.from(new Map(merged.map((file) => [file._id, file])).values())

    deduped.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
    setGalleryFiles(deduped.filter(isGalleryMediaFile))
  }

  const loadDocFiles = async (fileName) => {
    const response = await listFiles({
      page: 1,
      limit: 100,
      ...(fileName ? { fileName } : {}),
    })

    const docs = (response.files || []).filter(isDocumentFile)
    docs.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
    setDocFiles(docs)
  }

  useEffect(() => {
    let ignore = false

    const loadActiveTab = async () => {
      if (activeTab === 'audio') {
        setError('')
        return
      }

      setLoading(true)
      setError('')

      try {
        if (activeTab === 'gallery') {
          await loadGalleryFiles(searchQuery)
        } else if (activeTab === 'docs') {
          await loadDocFiles(searchQuery)
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError?.response?.data?.error ||
              requestError?.message ||
              'Unable to fetch files from the vault.',
          )
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadActiveTab()

    return () => {
      ignore = true
    }
  }, [activeTab, searchQuery])

  useEffect(() => {
    let cancelled = false

    const loadLightboxFile = async () => {
      if (!activeLightboxFile?._id) {
        setLightboxObjectUrl('')
        setLightboxMimeType('')
        setLightboxLoading(false)
        setLightboxError('')
        return
      }

      setLightboxLoading(true)
      setLightboxError('')

      try {
        const secureFile = await fetchSecureFileObjectUrl(activeLightboxFile._id)
        if (cancelled) {
          revokeObjectUrl(secureFile.objectUrl)
          return
        }

        setLightboxObjectUrl((previous) => {
          revokeObjectUrl(previous)
          return secureFile.objectUrl
        })
        setLightboxMimeType(secureFile.contentType || activeLightboxFile.mimeType || '')
      } catch (requestError) {
        if (!cancelled) {
          setLightboxError(
            requestError?.response?.data?.error ||
              requestError?.message ||
              'Unable to open file preview.',
          )
        }
      } finally {
        if (!cancelled) {
          setLightboxLoading(false)
        }
      }
    }

    loadLightboxFile()

    return () => {
      cancelled = true
    }
  }, [activeLightboxFile])

  const handleLogout = () => {
    clearToken()
    navigate('/', { replace: true })
  }

  const handlePasswordFieldChange = (event) => {
    const { name, value } = event.target
    setPasswordFormState((previous) => ({ ...previous, [name]: value }))
  }

  const handleChangePasswordSubmit = async (event) => {
    event.preventDefault()
    setChangePasswordSubmitting(true)
    setChangePasswordError('')
    setChangePasswordSuccess('')

    try {
      await changePassword({
        currentPassword: passwordFormState.currentPassword,
        newPassword: passwordFormState.newPassword,
      })
      setChangePasswordSuccess('Password changed successfully.')
      setPasswordFormState({ currentPassword: '', newPassword: '' })
    } catch (requestError) {
      const message =
        requestError?.response?.data?.error ||
        requestError?.response?.data?.message ||
        requestError?.message ||
        'Unable to change password.'
      setChangePasswordError(message)
    } finally {
      setChangePasswordSubmitting(false)
    }
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

      if (activeTab === 'docs') {
        await loadDocFiles(searchQuery)
      } else {
        await loadGalleryFiles(searchQuery)
      }
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

  const handleDeleteById = async (fileId) => {
    setDeletingId(fileId)
    setError('')

    try {
      await deleteVaultFile(fileId)
      evictSecureFileCache(fileId)
      setGalleryFiles((previous) => previous.filter((file) => file._id !== fileId))
      setDocFiles((previous) => previous.filter((file) => file._id !== fileId))

      if (activeLightboxFile?._id === fileId) {
        setLightboxIndex(-1)
      }
    } catch (deleteError) {
      setError(
        deleteError?.response?.data?.error ||
          deleteError?.message ||
          'Delete failed.',
      )
    } finally {
      setDeletingId('')
    }
  }

  const handleOpenDocument = async (file) => {
    try {
      const secureFile = await fetchSecureFileObjectUrl(file._id)
      const opened = window.open(secureFile.objectUrl, '_blank', 'noopener,noreferrer')

      if (!opened) {
        const anchor = document.createElement('a')
        anchor.href = secureFile.objectUrl
        anchor.download = file.originalName
        anchor.click()
      }

    } catch (openError) {
      setError(
        openError?.response?.data?.error ||
          openError?.message ||
          'Unable to securely open the document.',
      )
    }
  }

  const handleLightboxTouchStart = (event) => {
    setTouchStartX(event.touches[0]?.clientX || 0)
  }

  const handleLightboxTouchEnd = (event) => {
    const touchEndX = event.changedTouches[0]?.clientX || 0
    const deltaX = touchEndX - touchStartX

    if (Math.abs(deltaX) < SWIPE_THRESHOLD) {
      return
    }

    if (deltaX < 0 && lightboxIndex < galleryFiles.length - 1) {
      setLightboxIndex((current) => Math.min(current + 1, galleryFiles.length - 1))
      return
    }

    if (deltaX > 0 && lightboxIndex > 0) {
      setLightboxIndex((current) => Math.max(current - 1, 0))
    }
  }

  const mediaElement = useMemo(() => {
    if (!lightboxObjectUrl || !activeLightboxFile) {
      return null
    }

    if (isVideoFile(activeLightboxFile) || normalizeMimeType(lightboxMimeType).startsWith('video/')) {
      return <video controls autoPlay src={lightboxObjectUrl} className="h-full w-full object-contain" />
    }

    return <img src={lightboxObjectUrl} alt={activeLightboxFile.originalName} className="h-full w-full object-contain" />
  }, [activeLightboxFile, lightboxMimeType, lightboxObjectUrl])

  return (
    <main className="vault-mobile-main-gap min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 px-3 pb-3 pt-2 backdrop-blur relative">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-serif text-xl text-slate-100">Vault</h1>
          <button
            type="button"
            onClick={() => setProfileMenuOpen((previous) => !previous)}
            className="rounded-md p-2 text-slate-300 transition hover:bg-slate-800 hover:text-cyan-300"
            aria-label="Profile options"
          >
            <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
            </svg>
          </button>
        </div>

        {profileMenuOpen ? (
          <div className="absolute right-3 top-14 z-40 min-w-44 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl">
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
              onClick={() => {
                setProfileMenuOpen(false)
                setChangePasswordOpen(true)
                setChangePasswordError('')
                setChangePasswordSuccess('')
              }}
            >
              Change Password
            </button>
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-800"
              onClick={() => {
                setProfileMenuOpen(false)
                handleLogout()
              }}
            >
              Logout
            </button>
          </div>
        ) : null}

        <div className="relative">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search in vault"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-10 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </div>
      </header>

      {error ? (
        <div className="px-3 pt-3">
          <p className="rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>
        </div>
      ) : null}

      <section className="pb-28 pt-1">
        {activeTab === 'gallery' ? (
          loading ? (
            <p className="px-3 py-4 text-sm text-slate-400">Loading gallery...</p>
          ) : galleryFiles.length ? (
            <div className="grid grid-cols-4 gap-[2px] sm:grid-cols-5 md:grid-cols-6">
              {galleryFiles.map((file, index) => (
                <button
                  key={file._id}
                  type="button"
                  className="relative aspect-square overflow-hidden bg-slate-900"
                  onClick={() => setLightboxIndex(index)}
                  title={file.originalName}
                >
                  <img
                    src={`${thumbnailApiBaseUrl}/files/${file._id}/thumbnail?token=${encodeURIComponent(thumbnailToken)}`}
                    alt={file.originalName}
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      const imageElement = event.currentTarget
                      imageElement.onerror = null
                      imageElement.src = '/fallback-icon.svg'
                    }}
                  />

                  {isVideoFile(file) ? (
                    <span className="absolute right-1 top-1 rounded bg-slate-900/80 p-1 text-cyan-300">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-6 text-sm text-slate-400">No media files found.</p>
          )
        ) : null}

        {activeTab === 'docs' ? (
          loading ? (
            <p className="px-3 py-4 text-sm text-slate-400">Loading documents...</p>
          ) : docFiles.length ? (
            <ul className="divide-y divide-slate-800">
              {docFiles.map((file) => (
                <li key={file._id} className="relative flex items-center gap-3 px-3 py-3">
                  <span className="text-cyan-300">
                    <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="1.7">
                      <path d="M7 3h7l5 5v13H7z" />
                      <path d="M14 3v5h5" />
                    </svg>
                  </span>

                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleOpenDocument(file)}>
                    <p className="truncate text-sm font-medium text-slate-100">{file.originalName}</p>
                    <p className="text-xs text-slate-500">{new Date(file.uploadDate).toLocaleString()}</p>
                  </button>

                  <button
                    type="button"
                    className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
                    onClick={() => setDocMenuId((current) => (current === file._id ? '' : file._id))}
                    aria-label="Document actions"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {docMenuId === file._id ? (
                    <div className="absolute right-3 top-12 z-20 min-w-28 rounded-md border border-slate-700 bg-slate-900 shadow-xl">
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                        onClick={() => {
                          setDocMenuId('')
                          handleOpenDocument(file)
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-slate-800"
                        onClick={() => {
                          setDocMenuId('')
                          handleDeleteById(file._id)
                        }}
                        disabled={deletingId === file._id}
                      >
                        {deletingId === file._id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-sm text-slate-400">No documents found.</p>
          )
        ) : null}

        {activeTab === 'audio' ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center px-6 text-center text-slate-400">
            <div className="mb-4 rounded-full bg-slate-900 p-4 text-cyan-300">
              <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 9v6" />
                <path d="M9 6v12" />
                <path d="M13 10v4" />
                <path d="M17 8v8" />
              </svg>
            </div>
            <p className="text-base font-medium text-slate-200">No audio files uploaded.</p>
            <p className="mt-1 text-sm text-slate-500">Audio support will be added in a future update.</p>
          </div>
        ) : null}
      </section>

      <label
        className="fixed right-4 z-40 cursor-pointer"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              handleUpload(file)
            }
            event.target.value = ''
          }}
          disabled={isUploading}
        />
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400 text-3xl font-semibold text-slate-950 shadow-lg transition hover:bg-cyan-300">
          {isUploading ? '...' : '+'}
        </span>
      </label>

      <nav
        className="fixed bottom-0 left-0 z-40 w-full border-t border-slate-800 bg-slate-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-3">
          <button
            type="button"
            className={`flex flex-col items-center gap-1 py-2 text-xs ${
              activeTab === 'gallery' ? 'text-cyan-400' : 'text-slate-400'
            }`}
            onClick={() => setActiveTab('gallery')}
          >
            <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="8" height="8" rx="1.5" />
              <rect x="13" y="3" width="8" height="8" rx="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1.5" />
            </svg>
            <span>Gallery</span>
          </button>

          <button
            type="button"
            className={`flex flex-col items-center gap-1 py-2 text-xs ${
              activeTab === 'docs' ? 'text-cyan-400' : 'text-slate-400'
            }`}
            onClick={() => setActiveTab('docs')}
          >
            <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="1.8">
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v5h5" />
            </svg>
            <span>Docs</span>
          </button>

          <button
            type="button"
            className={`flex flex-col items-center gap-1 py-2 text-xs ${
              activeTab === 'audio' ? 'text-cyan-400' : 'text-slate-400'
            }`}
            onClick={() => setActiveTab('audio')}
          >
            <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="1.8">
              <path d="M5 9v6" />
              <path d="M9 6v12" />
              <path d="M13 10v4" />
              <path d="M17 8v8" />
            </svg>
            <span>Audio</span>
          </button>
        </div>
      </nav>

      {activeLightboxFile ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-slate-950"
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <div className="flex items-center justify-between border-b border-slate-800 p-3">
            <p className="truncate text-sm text-slate-200">{activeLightboxFile.originalName}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-slate-800"
                onClick={() => handleDeleteById(activeLightboxFile._id)}
                disabled={deletingId === activeLightboxFile._id}
              >
                {deletingId === activeLightboxFile._id ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                onClick={() => setLightboxIndex(-1)}
              >
                Close
              </button>
            </div>
          </div>

          <div className="relative flex-1">
            {lightboxLoading ? <p className="p-4 text-sm text-slate-400">Loading preview...</p> : null}
            {lightboxError ? <p className="p-4 text-sm text-red-300">{lightboxError}</p> : null}
            {!lightboxLoading && !lightboxError ? <div className="h-full w-full">{mediaElement}</div> : null}

            {lightboxIndex > 0 ? (
              <button
                type="button"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80 p-2 text-slate-200"
                onClick={() => setLightboxIndex((current) => Math.max(current - 1, 0))}
                aria-label="Previous"
              >
                <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="2">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </button>
            ) : null}

            {lightboxIndex < galleryFiles.length - 1 ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80 p-2 text-slate-200"
                onClick={() => setLightboxIndex((current) => Math.min(current + 1, galleryFiles.length - 1))}
                aria-label="Next"
              >
                <svg viewBox="0 0 24 24" fill="none" className={iconClass} stroke="currentColor" strokeWidth="2">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {changePasswordOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-serif text-xl text-slate-100">Change Password</h3>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800"
                onClick={() => setChangePasswordOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleChangePasswordSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="currentPassword">
                  Current Password
                </label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  value={passwordFormState.currentPassword}
                  onChange={handlePasswordFieldChange}
                  required
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-900/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="newPassword">
                  New Password
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  value={passwordFormState.newPassword}
                  onChange={handlePasswordFieldChange}
                  required
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-900/40"
                />
              </div>

              {changePasswordError ? (
                <p className="rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{changePasswordError}</p>
              ) : null}

              {changePasswordSuccess ? (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{changePasswordSuccess}</p>
              ) : null}

              <button
                type="submit"
                disabled={changePasswordSubmitting}
                className="inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {changePasswordSubmitting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default VaultDashboard
