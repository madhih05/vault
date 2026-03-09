function AudioView({ files, loading, error, onOpen }) {
  if (loading) {
    return <p className="text-sm text-slate-400">Loading audio files...</p>
  }

  if (error) {
    return <p className="rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>
  }

  if (!files.length) {
    return <p className="text-sm text-slate-400">No audio files found for the current filters.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
      <div className="hidden grid-cols-[minmax(0,1fr)_170px_90px] border-b border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid">
        <span>Name</span>
        <span>Modified</span>
        <span className="text-right">Preview</span>
      </div>
      <ul className="divide-y divide-slate-700">
        {files.map((file) => (
          <li
            key={file._id}
            className="flex flex-col gap-2 px-3 py-3 hover:bg-slate-800/60 sm:grid sm:grid-cols-[minmax(0,1fr)_170px_90px] sm:items-center sm:gap-3 sm:px-4"
          >
            <button type="button" onClick={() => onOpen(file)} className="min-w-0 text-left">
              <p className="truncate text-sm font-medium text-slate-100">{file.originalName}</p>
            </button>
            <p className="truncate text-xs text-slate-400">{new Date(file.uploadDate).toLocaleString()}</p>
            <div className="text-left sm:text-right">
              <button
                type="button"
                onClick={() => onOpen(file)}
                className="rounded-md border border-cyan-500/50 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-900/60"
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
