import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  API_BASE_URL,
  buildSecureFileViewUrl,
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
const MAX_VIDEO_THUMBNAIL_SOURCE_BYTES = 45 * 1024 * 1024
const SWIPE_THRESHOLD = 40
const CACHE_TTL_MS = 60 * 1000
const PULL_TO_REFRESH_THRESHOLD = 72

const GALLERY_FILTER_OPTIONS = [
  { label: 'All Media', value: 'media' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
]

const DOC_FILTER_OPTIONS = [
  { label: 'All Docs', value: 'documents' },
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'word' },
  { label: 'Excel', value: 'excel' },
  { label: 'PowerPoint', value: 'powerpoint' },
  { label: 'CSV', value: 'csv' },
  { label: 'JSON', value: 'json' },
  { label: 'Text', value: 'txt' },
  { label: 'RTF', value: 'rtf' },
  { label: 'HEIC/HEIF', value: 'heic' },
]

const normalizeMimeType = (mimeType = '') => mimeType.toLowerCase()

const isVideoFile = (file) => normalizeMimeType(file?.mimeType || '').startsWith('video/')

const isThumbnailEligibleMimeType = (mimeType = '') => {
  const normalizedMimeType = normalizeMimeType(mimeType)
  return normalizedMimeType.startsWith('image/') || normalizedMimeType.startsWith('video/')
}

const blobToObjectUrl = (blob) => URL.createObjectURL(blob)

const formatSize = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

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
    // Avoid decoding very large sources in WebView during upload preparation.
    if ((file?.size || 0) > MAX_VIDEO_THUMBNAIL_SOURCE_BYTES) {
      return null
    }

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
  const [filterByTab, setFilterByTab] = useState({
    gallery: 'media',
    docs: 'documents',
  })

  const [galleryFiles, setGalleryFiles] = useState([])
  const [docFiles, setDocFiles] = useState([])
  const [audioFiles, setAudioFiles] = useState([])
  const [galleryPage, setGalleryPage] = useState(1)
  const [galleryHasNextPage, setGalleryHasNextPage] = useState(false)
  const [isFetchingMoreGallery, setIsFetchingMoreGallery] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadQueueItems, setUploadQueueItems] = useState([])
  const [uploadQueueOpen, setUploadQueueOpen] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const [docMenuId, setDocMenuId] = useState('')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
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
  const galleryLoadMoreRef = useRef(null)
  const dragDepthRef = useRef(0)
  const uploadQueueRef = useRef([])
  const uploadProcessorRunningRef = useRef(false)
  const previousTabRef = useRef('gallery')
  const scrollPositionRef = useRef({ gallery: 0, docs: 0, audio: 0 })
  const tabCacheMetaRef = useRef({
    gallery: { loaded: false, lastFetchedAt: 0, query: '', filter: 'media' },
    docs: { loaded: false, lastFetchedAt: 0, query: '', filter: 'documents' },
    audio: { loaded: false, lastFetchedAt: 0, query: '', filter: 'audio' },
  })
  const pullStartYRef = useRef(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)

  const thumbnailApiBaseUrl = API_BASE_URL || 'https://secretvault.madhih.in/api'
  const thumbnailToken = sessionStorage.getItem('token') || getToken() || ''

  const activeLightboxFile = lightboxIndex >= 0 ? galleryFiles[lightboxIndex] : null

  useEffect(() => {
    uploadQueueRef.current = uploadQueueItems
  }, [uploadQueueItems])

  const overallUploadProgress = useMemo(() => {
    if (!uploadQueueItems.length) {
      return 0
    }

    const totalBytes = uploadQueueItems.reduce((accumulator, item) => accumulator + (item.size || 0), 0)
    if (!totalBytes) {
      return 0
    }

    const uploadedBytes = uploadQueueItems.reduce(
      (accumulator, item) => accumulator + ((item.size || 0) * (item.progress || 0)) / 100,
      0,
    )

    return Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
  }, [uploadQueueItems])

  const hasUploadActivity = uploadQueueItems.some(
    (item) => item.status === 'queued' || item.status === 'uploading',
  )

  useEffect(() => {
    if (!uploadQueueItems.length || hasUploadActivity) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setUploadQueueItems([])
      setUploadQueueOpen(false)
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [hasUploadActivity, uploadQueueItems])

  useEffect(() => {
    const debounce = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 280)

    return () => window.clearTimeout(debounce)
  }, [searchInput])

  const loadGalleryFiles = async ({ fileName, filterType, page = 1, append = false }) => {
    const response = await listFiles({
      page,
      limit: 60,
      fileType: filterType,
      ...(fileName ? { fileName } : {}),
    })

    const incomingFiles = response.files || []

    setGalleryFiles((previous) => {
      if (!append) {
        return incomingFiles
      }

      const merged = [...previous, ...incomingFiles]
      return Array.from(new Map(merged.map((file) => [file._id, file])).values())
    })

    setGalleryPage(page)
    setGalleryHasNextPage(Boolean(response?.pagination?.hasNextPage))
  }

  const loadDocFiles = async ({ fileName, filterType }) => {
    const response = await listFiles({
      page: 1,
      limit: 100,
      fileType: filterType,
      ...(fileName ? { fileName } : {}),
    })

    const docs = response.files || []
    docs.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
    setDocFiles(docs)
  }

  const loadAudioFiles = async ({ fileName }) => {
    const response = await listFiles({
      page: 1,
      limit: 100,
      fileType: 'audio',
      ...(fileName ? { fileName } : {}),
    })

    const audios = response.files || []
    audios.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
    setAudioFiles(audios)
  }

  const updateTabCacheMeta = (tab, query, filter) => {
    tabCacheMetaRef.current[tab] = {
      loaded: true,
      lastFetchedAt: Date.now(),
      query,
      filter,
    }
  }

  const shouldFetchTab = (tab, query, filter, force = false) => {
    if (force) {
      return true
    }

    const meta = tabCacheMetaRef.current[tab]
    if (!meta?.loaded) {
      return true
    }

    if (meta.query !== query || meta.filter !== filter) {
      return true
    }

    return Date.now() - meta.lastFetchedAt > CACHE_TTL_MS
  }

  const refreshActiveTab = async ({ force = false } = {}) => {
    const activeFilter =
      activeTab === 'gallery' ? filterByTab.gallery : activeTab === 'docs' ? filterByTab.docs : 'audio'
    if (!shouldFetchTab(activeTab, searchQuery, activeFilter, force)) {
      return
    }

    setLoading(true)
    setError('')

    try {
      if (activeTab === 'gallery') {
        await loadGalleryFiles({
          fileName: searchQuery,
          filterType: filterByTab.gallery,
          page: 1,
          append: false,
        })
      } else if (activeTab === 'docs') {
        await loadDocFiles({
          fileName: searchQuery,
          filterType: filterByTab.docs,
        })
      } else {
        await loadAudioFiles({
          fileName: searchQuery,
        })
      }

      updateTabCacheMeta(activeTab, searchQuery, activeFilter)
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
    refreshActiveTab()
  }, [activeTab, searchQuery, filterByTab.gallery, filterByTab.docs])

  useEffect(() => {
    if (activeTab !== 'gallery' || !galleryHasNextPage) {
      return undefined
    }

    const target = galleryLoadMoreRef.current
    if (!target) {
      return undefined
    }

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting || loading || isFetchingMoreGallery) {
          return
        }

        setIsFetchingMoreGallery(true)
        setError('')

        try {
          await loadGalleryFiles({
            fileName: searchQuery,
            filterType: filterByTab.gallery,
            page: galleryPage + 1,
            append: true,
          })
          updateTabCacheMeta('gallery', searchQuery, filterByTab.gallery)
        } catch (requestError) {
          setError(
            requestError?.response?.data?.error ||
              requestError?.message ||
              'Unable to load more files.',
          )
        } finally {
          setIsFetchingMoreGallery(false)
        }
      },
      {
        root: null,
        rootMargin: '400px',
        threshold: 0,
      },
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [
    activeTab,
    filterByTab.gallery,
    galleryHasNextPage,
    galleryPage,
    isFetchingMoreGallery,
    loading,
    searchQuery,
  ])

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

  const handleTabSwitch = (tabName) => {
    scrollPositionRef.current[activeTab] = window.scrollY || 0
    setActiveTab(tabName)
    setFilterMenuOpen(false)
    setDocMenuId('')
    setProfileMenuOpen(false)
  }

  useEffect(() => {
    const previousTab = previousTabRef.current
    if (previousTab !== activeTab) {
      const savedScroll = scrollPositionRef.current[activeTab] || 0
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: savedScroll, behavior: 'auto' })
      })
      previousTabRef.current = activeTab
    }
  }, [activeTab])

  const handleTouchStart = (event) => {
    if (window.scrollY > 0 || loading || isRefreshing) {
      pullStartYRef.current = null
      return
    }

    pullStartYRef.current = event.touches?.[0]?.clientY || null
  }

  const handleTouchMove = (event) => {
    if (pullStartYRef.current === null) {
      return
    }

    const currentY = event.touches?.[0]?.clientY || 0
    const delta = currentY - pullStartYRef.current

    if (delta <= 0 || window.scrollY > 0) {
      setPullDistance(0)
      return
    }

    event.preventDefault()
    setPullDistance(Math.min(96, delta * 0.45))
  }

  const handleTouchEnd = async () => {
    if (pullStartYRef.current === null) {
      return
    }

    pullStartYRef.current = null

    if (pullDistance >= PULL_TO_REFRESH_THRESHOLD) {
      setIsRefreshing(true)
      await refreshActiveTab({ force: true })
      setIsRefreshing(false)
    }

    setPullDistance(0)
  }

  const activeFilterOptions = activeTab === 'docs' ? DOC_FILTER_OPTIONS : GALLERY_FILTER_OPTIONS
  const activeFilterValue = activeTab === 'docs' ? filterByTab.docs : filterByTab.gallery
  const activeFilterLabel =
    activeFilterOptions.find((option) => option.value === activeFilterValue)?.label || 'Filter'

  const applyFilterForActiveTab = (nextFilterValue) => {
    if (activeTab === 'audio') {
      return
    }

    setFilterByTab((previous) => {
      if (activeTab === 'docs') {
        return { ...previous, docs: nextFilterValue }
      }

      return { ...previous, gallery: nextFilterValue }
    })

    setFilterMenuOpen(false)
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

  const processUploadQueue = async () => {
    if (uploadProcessorRunningRef.current) {
      return
    }

    uploadProcessorRunningRef.current = true
    setIsUploading(true)

    let hadFailures = false
    let hadSuccessfulUploads = false

    while (true) {
      const nextItem = uploadQueueRef.current.find((item) => item.status === 'queued')
      if (!nextItem) {
        break
      }

      setUploadQueueItems((previous) =>
        previous.map((entry) =>
          entry.id === nextItem.id
            ? {
                ...entry,
                status: 'uploading',
                progress: Math.max(1, entry.progress),
                error: '',
              }
            : entry,
        ),
      )

      try {
        let thumbnailBlob = null

        try {
          thumbnailBlob = await createUploadThumbnail(nextItem.file)
        } catch (thumbnailError) {
          console.warn('Thumbnail generation failed. Uploading without custom thumbnail.', thumbnailError)
        }

        await uploadVaultFile(
          nextItem.file,
          thumbnailBlob,
          (progressEvent) => {
            const total = progressEvent?.total || nextItem.size || 1
            const loaded = progressEvent?.loaded || 0
            const percent = Math.max(1, Math.min(100, Math.round((loaded / total) * 100)))

            setUploadQueueItems((previous) =>
              previous.map((entry) =>
                entry.id === nextItem.id
                  ? {
                      ...entry,
                      status: 'uploading',
                      progress: percent,
                    }
                  : entry,
              ),
            )
          },
        )

        hadSuccessfulUploads = true
        setUploadQueueItems((previous) =>
          previous.map((entry) =>
            entry.id === nextItem.id
              ? {
                  ...entry,
                  status: 'completed',
                  progress: 100,
                }
              : entry,
          ),
        )
      } catch (uploadError) {
        hadFailures = true
        const message =
          uploadError?.response?.data?.error ||
          uploadError?.response?.data?.message ||
          uploadError?.message ||
          'Upload failed.'

        setUploadQueueItems((previous) =>
          previous.map((entry) =>
            entry.id === nextItem.id
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 100,
                  error: message,
                }
              : entry,
          ),
        )
      }
    }

    if (hadFailures) {
      setError('Some files failed to upload. Check upload progress for details.')
    }

    if (hadSuccessfulUploads) {
      await refreshActiveTab({ force: true })
    }

    uploadProcessorRunningRef.current = false
    setIsUploading(false)
  }

  const handleUploadFiles = (selectedFiles) => {
    const files = Array.from(selectedFiles || []).filter(Boolean)
    if (!files.length) {
      return
    }

    const queuedItems = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'queued',
      error: '',
    }))

    setUploadQueueItems((previous) => [...previous, ...queuedItems])
    setUploadQueueOpen(true)
    setError('')
  }

  useEffect(() => {
    const hasQueuedFiles = uploadQueueItems.some((item) => item.status === 'queued')
    if (!hasQueuedFiles || uploadProcessorRunningRef.current) {
      return
    }

    processUploadQueue()
  }, [uploadQueueItems])

  const handleDragEnter = (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!event.dataTransfer?.types?.includes('Files')) {
      return
    }

    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!event.dataTransfer?.types?.includes('Files')) {
      return
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()

    dragDepthRef.current = 0
    setIsDragActive(false)

    const droppedFiles = event.dataTransfer?.files
    if (!droppedFiles?.length) {
      return
    }

    handleUploadFiles(droppedFiles)
  }

  const handleDeleteById = async (fileId) => {
    setDeletingId(fileId)
    setError('')

    try {
      await deleteVaultFile(fileId)
      evictSecureFileCache(fileId)
      setGalleryFiles((previous) => previous.filter((file) => file._id !== fileId))
      setDocFiles((previous) => previous.filter((file) => file._id !== fileId))
      setAudioFiles((previous) => previous.filter((file) => file._id !== fileId))

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
      if (Capacitor.isNativePlatform()) {
        const secureUrl = buildSecureFileViewUrl(file._id)
        const opened = window.open(secureUrl, '_blank', 'noopener,noreferrer')

        if (!opened) {
          window.location.assign(secureUrl)
        }

        return
      }

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

  const handleDownloadDocument = async (file) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const secureUrl = buildSecureFileViewUrl(file._id, { download: true })
        const opened = window.open(secureUrl, '_blank', 'noopener,noreferrer')

        if (!opened) {
          window.location.assign(secureUrl)
        }

        return
      }

      const secureFile = await fetchSecureFileObjectUrl(file._id)
      const anchor = document.createElement('a')
      anchor.href = secureFile.objectUrl
      anchor.download = file.originalName
      anchor.click()
    } catch (downloadError) {
      setError(
        downloadError?.response?.data?.error ||
          downloadError?.message ||
          'Unable to securely download the document.',
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
    <main
      className="vault-mobile-main-gap min-h-screen bg-slate-950 text-slate-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragActive ? (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-slate-950/75 p-6">
          <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-cyan-300 bg-slate-900/90 p-6 text-center">
            <p className="text-base font-semibold text-cyan-200">Drop files to upload</p>
            <p className="mt-2 text-sm text-slate-300">Supports single and multiple files</p>
          </div>
        </div>
      ) : null}

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

        {activeTab !== 'audio' ? (
          <div className="relative mt-2 flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200"
              onClick={() => setFilterMenuOpen((previous) => !previous)}
              aria-label="Open filter options"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h16" />
                <path d="M7 12h10" />
                <path d="M10 18h4" />
              </svg>
              <span>{activeFilterLabel}</span>
            </button>

            {filterMenuOpen ? (
              <div className="absolute right-0 top-9 z-40 min-w-40 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl">
                {activeFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                      activeFilterValue === option.value
                        ? 'bg-slate-800 text-cyan-300'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                    onClick={() => applyFilterForActiveTab(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="px-3 pt-3">
          <p className="rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>
        </div>
      ) : null}

      <section className="pb-28 pt-1" style={{ transform: `translateY(${pullDistance}px)` }}>
        {pullDistance > 0 || isRefreshing ? (
          <div className="px-3 py-2 text-center text-xs text-slate-400">
            {isRefreshing
              ? 'Refreshing...'
              : pullDistance >= PULL_TO_REFRESH_THRESHOLD
              ? 'Release to refresh'
              : 'Pull to refresh'}
          </div>
        ) : null}

        {activeTab === 'gallery' ? (
          loading ? (
            <p className="px-3 py-4 text-sm text-slate-400">Loading gallery...</p>
          ) : galleryFiles.length ? (
            <>
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

              {galleryHasNextPage ? <div ref={galleryLoadMoreRef} className="h-8 w-full" /> : null}
              {isFetchingMoreGallery ? (
                <p className="px-3 py-2 text-xs text-slate-500">Loading more files...</p>
              ) : null}
            </>
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
                        className="block w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                        onClick={() => {
                          setDocMenuId('')
                          handleDownloadDocument(file)
                        }}
                      >
                        Download
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
          loading ? (
            <p className="px-3 py-4 text-sm text-slate-400">Loading audio files...</p>
          ) : audioFiles.length ? (
            <ul className="divide-y divide-slate-800">
              {audioFiles.map((file) => (
                <li key={file._id} className="px-3 py-3">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-100">{file.originalName}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteById(file._id)}
                      disabled={deletingId === file._id}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-950/50 disabled:opacity-50"
                    >
                      {deletingId === file._id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-slate-500">{new Date(file.uploadDate).toLocaleString()}</p>
                  <audio
                    controls
                    preload="none"
                    src={buildSecureFileViewUrl(file._id, { token: getToken() })}
                    className="w-full"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-sm text-slate-400">No audio files found.</p>
          )
        ) : null}
      </section>

      {uploadQueueItems.length ? (
        <button
          type="button"
          onClick={() => setUploadQueueOpen((previous) => !previous)}
          className="fixed left-4 z-40 rounded-full bg-slate-900/95 p-1 shadow-lg ring-1 ring-slate-700"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)',
          }}
          aria-label="Open upload progress"
        >
          <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
            <circle cx="22" cy="22" r="17" fill="none" stroke="rgb(51 65 85)" strokeWidth="4" />
            <circle
              cx="22"
              cy="22"
              r="17"
              fill="none"
              stroke={hasUploadActivity ? 'rgb(34 211 238)' : 'rgb(52 211 153)'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 17}`}
              strokeDashoffset={`${2 * Math.PI * 17 * (1 - overallUploadProgress / 100)}`}
            />
          </svg>
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs font-semibold text-slate-100">
            {overallUploadProgress}%
          </span>
        </button>
      ) : null}

      {uploadQueueOpen && uploadQueueItems.length ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60"
          onClick={() => setUploadQueueOpen(false)}
          role="presentation"
        >
          <div
            className="absolute bottom-24 left-3 right-3 max-h-[55vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Upload progress list"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Upload Progress</p>
                <p className="text-xs text-slate-400">{overallUploadProgress}% overall</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                onClick={() => {
                  setUploadQueueItems([])
                  setUploadQueueOpen(false)
                }}
                disabled={hasUploadActivity}
              >
                Clear
              </button>
            </div>

            <div className="max-h-[42vh] space-y-3 overflow-y-auto px-4 py-3">
              {uploadQueueItems.map((item) => {
                const statusLabel =
                  item.status === 'uploading'
                    ? 'Uploading'
                    : item.status === 'queued'
                    ? 'Queued'
                    : item.status === 'failed'
                    ? 'Failed'
                    : 'Completed'

                return (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="truncate text-sm text-slate-100">{item.name}</p>
                      <span
                        className={`text-xs ${
                          item.status === 'failed'
                            ? 'text-red-300'
                            : item.status === 'completed'
                            ? 'text-emerald-300'
                            : item.status === 'uploading'
                            ? 'text-cyan-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <p className="mb-2 text-[11px] text-slate-500">{formatSize(item.size)}</p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full transition-all ${item.status === 'failed' ? 'bg-red-400' : 'bg-cyan-400'}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    {item.error ? <p className="mt-2 text-xs text-red-300">{item.error}</p> : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      <label
        className="fixed right-4 z-40 cursor-pointer"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) {
              handleUploadFiles(event.target.files)
            }
            event.target.value = ''
          }}
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
            onClick={() => handleTabSwitch('gallery')}
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
            onClick={() => handleTabSwitch('docs')}
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
            onClick={() => handleTabSwitch('audio')}
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
