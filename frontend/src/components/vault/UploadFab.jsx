function UploadFab({ onFilePicked, isUploading }) {
  return (
    <label className="fixed bottom-6 right-6 z-40 cursor-pointer">
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
      <span className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-full bg-cyan-600 px-4 text-2xl font-semibold text-white shadow-lg transition hover:bg-cyan-500">
        {isUploading ? '...' : '+'}
      </span>
    </label>
  )
}

export default UploadFab
