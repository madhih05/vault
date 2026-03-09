function UploadFab({ onFilePicked, isUploading }) {
  return (
    <label className="fixed bottom-4 right-4 z-40 cursor-pointer sm:bottom-6 sm:right-6">
      <input
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onFilePicked(file)
          }
          event.target.value = ''
        }}
        disabled={isUploading}
      />
      <span className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500 px-3 text-2xl font-semibold text-slate-950 shadow-lg transition hover:bg-cyan-400 sm:min-h-14 sm:min-w-14 sm:px-4">
        {isUploading ? '...' : '+'}
      </span>
    </label>
  )
}

export default UploadFab
