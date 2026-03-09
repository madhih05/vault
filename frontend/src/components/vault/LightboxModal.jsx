import { useEffect, useState } from 'react'
import { fetchSecureFileObjectUrl, revokeObjectUrl } from '../../services/api'

function LightboxModal({ file, onClose, onDelete }) {
  const [objectUrl, setObjectUrl] = useState('')
  const [contentType, setContentType] = useState(file?.mimeType || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let isMounted = true
    let activeObjectUrl = ''

    async function loadPreview() {
      if (!file?._id) {
        return
      }

      setLoading(true)
      setError('')

      try {
        const secureView = await fetchSecureFileObjectUrl(file._id)
        if (!isMounted) {
          revokeObjectUrl(secureView.objectUrl)
          return
        }

        activeObjectUrl = secureView.objectUrl
        setObjectUrl(secureView.objectUrl)
        setContentType(secureView.contentType || file.mimeType || '')
      } catch (requestError) {
        if (isMounted) {
          setError(requestError?.response?.data?.error || requestError?.message || 'Unable to open file preview.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      isMounted = false
      revokeObjectUrl(activeObjectUrl)
    }
  }, [file])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(file)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  const isVideo = contentType.startsWith('video/')
  const isAudio = contentType.startsWith('audio/')

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <h3 className="truncate text-sm font-medium text-slate-200">{file.originalName}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-500 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-[45vh] rounded-lg bg-slate-950 p-2 sm:min-h-[50vh]">
          {loading ? <p className="p-4 text-sm text-slate-300">Loading preview...</p> : null}
          {error ? <p className="p-4 text-sm text-red-300">{error}</p> : null}

          {!loading && !error && objectUrl ? (
            isVideo ? (
              <video controls src={objectUrl} className="max-h-[70vh] w-full rounded-md object-contain" />
            ) : isAudio ? (
              <div className="flex min-h-[40vh] items-center justify-center px-4">
                <audio controls src={objectUrl} className="w-full max-w-2xl" />
              </div>
            ) : (
              <img src={objectUrl} alt={file.originalName} className="max-h-[70vh] w-full rounded-md object-contain" />
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default LightboxModal
