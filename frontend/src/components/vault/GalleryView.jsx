import GalleryItem from './GalleryItem'

function GalleryView({ files, loading, error, onOpen }) {
  if (loading) {
    return <p className="text-sm text-slate-400">Loading gallery...</p>
  }

  if (error) {
    return <p className="rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>
  }

  if (!files.length) {
    return <p className="text-sm text-slate-400">No media files found for the current filters.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((file) => (
        <GalleryItem key={file._id} file={file} onOpen={onOpen} />
      ))}
    </div>
  )
}

export default GalleryView
