function AudioView({ files, loading, error, onOpen }) {
  if (loading) {
    return <p className="text-sm text-slate-600">Loading audio files...</p>
  }

  if (error) {
    return <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  }

  if (!files.length) {
    return <p className="text-sm text-slate-600">No audio files found for the current filters.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_170px_90px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Name</span>
        <span>Modified</span>
        <span className="text-right">Preview</span>
      </div>
      <ul className="divide-y divide-slate-200">
        {files.map((file) => (
          <li key={file._id} className="grid grid-cols-[minmax(0,1fr)_170px_90px] items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <button type="button" onClick={() => onOpen(file)} className="min-w-0 text-left">
              <p className="truncate text-sm font-medium text-slate-800">{file.originalName}</p>
            </button>
            <p className="truncate text-xs text-slate-500">{new Date(file.uploadDate).toLocaleString()}</p>
            <div className="text-right">
              <button
                type="button"
                onClick={() => onOpen(file)}
                className="rounded-md border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
              >
                Stream
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default AudioView
