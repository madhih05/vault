const TYPE_OPTIONS = {
  gallery: [
    { label: 'All media', value: '' },
    { label: 'Images', value: 'image' },
    { label: 'Videos', value: 'video' },
    { label: 'MP4', value: 'video/mp4' },
    { label: 'MOV (QuickTime)', value: 'video/quicktime' },
    { label: 'AVI', value: 'avi' },
    { label: 'MKV', value: 'mkv' },
    { label: 'WebM', value: 'video/webm' },
    { label: 'M4V', value: 'video/x-m4v' },
    { label: '3GP', value: 'video/3gpp' },
    { label: '3G2', value: 'video/3gpp2' },
  ],
  audio: [
    { label: 'All audio', value: '' },
    { label: 'MP3', value: 'audio/mp3' },
    { label: 'FLAC', value: 'flac' },
    { label: 'WAV', value: 'wav' },
    { label: 'M4A', value: 'audio/x-m4a' },
    { label: 'OGG', value: 'audio/ogg' },
    { label: 'OPUS', value: 'audio/opus' },
    { label: 'AAC', value: 'aac' },
    { label: 'AMR', value: 'audio/amr' },
    { label: 'WMA', value: 'audio/x-ms-wma' },
    { label: 'AIFF', value: 'audio/aiff' },
  ],
  documents: [
    { label: 'All docs', value: '' },
    { label: 'PDF', value: 'pdf' },
    { label: 'Text', value: 'text' },
    { label: 'Word (.doc/.docx)', value: 'word' },
    { label: 'Excel (.xls/.xlsx)', value: 'excel' },
    { label: 'PowerPoint (.ppt/.pptx)', value: 'powerpoint' },
    { label: 'OpenDocument (.odt/.ods/.odp)', value: 'oasis' },
    { label: 'CSV', value: 'csv' },
    { label: 'JSON', value: 'json' },
    { label: 'RTF', value: 'rtf' },
  ],
  other: [
    { label: 'All unrecognized', value: '' },
    { label: 'Generic binary (octet-stream)', value: 'application/octet-stream' },
  ],
}

function FilterDrawer({
  activeTab,
  drawerOpen,
  searchDraft,
  typeDraft,
  onOpen,
  onClose,
  onSearchChange,
  onTypeChange,
  onApply,
  onReset,
}) {
  const options = TYPE_OPTIONS[activeTab]

  return (
    <>
      <button
        type="button"
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white shadow-lg"
        onClick={onOpen}
      >
        Filter
      </button>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/35" onClick={onClose} aria-hidden="true" />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[86vw] max-w-sm border-l border-slate-200 bg-white p-5 shadow-2xl transition-transform duration-300 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-slate-900">Find Files</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="fileNameFilter">
              Search Name
            </label>
            <input
              id="fileNameFilter"
              value={searchDraft}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="invoice, holiday, note..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="fileTypeFilter">
              Type
            </label>
            <select
              id="fileTypeFilter"
              value={typeDraft}
              onChange={(event) => onTypeChange(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            >
              {options.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onApply}
              className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Reset
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default FilterDrawer
