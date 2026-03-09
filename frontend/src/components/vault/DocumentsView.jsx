function DocumentsView({ files, loading, error, deletingId, onOpen, onDelete, emptyMessage = 'No documents found for the current filters.' }) {
  if (loading) {
    return <p className="text-sm text-slate-600">Loading documents...</p>
  }

  if (error) {
    return <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  }

  if (!files.length) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_170px_80px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Name</span>
        <span>Modified</span>
        <span className="text-right">Action</span>
      </div>
      <ul className="divide-y divide-slate-200">
        {files.map((file) => (
          <li key={file._id} className="grid grid-cols-[minmax(0,1fr)_170px_80px] items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <button type="button" onClick={() => onOpen(file)} className="min-w-0 text-left">
              <p className="truncate text-sm font-medium text-slate-800">{file.originalName}</p>
            </button>
            <p className="truncate text-xs text-slate-500">{new Date(file.uploadDate).toLocaleString()}</p>
            <div className="text-right">
              <button
                type="button"
                onClick={() => onDelete(file)}
                disabled={deletingId === file._id}
                className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                title="Delete file"
              >
                {deletingId === file._id ? '...' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DocumentsView
