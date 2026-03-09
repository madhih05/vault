import { buildApiUrl, getToken } from '../../services/api'

function GalleryItem({ file, onOpen }) {
  const token = getToken()
  const thumbnailUrl = token
    ? `${buildApiUrl(`/files/${file._id}/thumbnail`)}?token=${encodeURIComponent(token)}`
    : '/fallback-icon.svg'
  const isVideo = file.mimeType.startsWith('video/')

  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="group relative aspect-square overflow-hidden border border-slate-700/80 bg-slate-800 text-left"
      title={file.originalName}
    >
      <img
        src={thumbnailUrl}
        alt={file.originalName}
        className="h-full w-full object-cover"
        onError={(event) => {
          const imageElement = event.currentTarget
          imageElement.onerror = null
          imageElement.src = '/fallback-icon.svg'
        }}
      />

      {isVideo ? (
        <span className="absolute right-2 top-2 bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          VIDEO
        </span>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-2 py-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <p className="truncate text-xs font-medium text-white">{file.originalName}</p>
      </div>
    </button>
  )
}

export default GalleryItem
