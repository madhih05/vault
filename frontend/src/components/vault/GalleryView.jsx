import GalleryItem from './GalleryItem'

function GalleryView({ files, loading, error, onOpen }) {
  if (loading) {
    return <p className="text-sm text-slate-600">Loading gallery...</p>
  }

  if (error) {
    return <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  }

  if (!files.length) {
    return <p className="text-sm text-slate-600">No media files found for the current filters.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((file) => (
        <GalleryItem key={file._id} file={file} onOpen={onOpen} />
      ))}
    </div>
  )
}

export default GalleryView
