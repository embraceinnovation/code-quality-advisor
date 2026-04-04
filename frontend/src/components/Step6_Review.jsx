import { useState } from 'react'
import { pushBranch } from '../api.js'

// Parse `git diff --stat` into [{file, additions, deletions}]
function parseStatSummary(stat) {
  const lines = (stat || '').split('\n')
  return lines
    .filter((l) => l.includes(' | '))
    .map((l) => {
      const [filePart, changePart] = l.split(' | ')
      const file = filePart.trim()
      const adds = (changePart.match(/\+/g) || []).length
      const dels = (changePart.match(/-/g) || []).length
      return { file, additions: adds, deletions: dels }
    })
}

// Split a unified diff into per-file sections
function splitDiffByFile(diffText) {
  if (!diffText) return []
  const sections = []
  let current = null
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) sections.push(current)
      const match = line.match(/diff --git a\/.+ b\/(.+)/)
      current = { file: match ? match[1] : line, lines: [line] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
}

function FileDiff({ file, additions, deletions, diffLines, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(file)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all
        ${selected ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
    >
      <span className="font-mono text-xs text-gray-800 flex-1 truncate">{file}</span>
      <span className="text-green-600 text-xs font-semibold flex-shrink-0">+{additions}</span>
      <span className="text-red-500 text-xs font-semibold flex-shrink-0">-{deletions}</span>
    </button>
  )
}

export default function Step6_Review({ pendingBranch, onBack, onPushed }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  const handlePush = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await pushBranch()
      onPushed(result.push_url)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!pendingBranch) {
    return (
      <div className="text-center py-16 space-y-3 text-gray-400">
        <p>No branch prepared.</p>
        <button onClick={onBack} className="text-blue-600 text-sm hover:underline">← Back to changes</button>
      </div>
    )
  }

  const changedFiles = parseStatSummary(pendingBranch.diff_summary)
  const fileDiffs = splitDiffByFile(pendingBranch.diff_text)
  const diffByFile = Object.fromEntries(fileDiffs.map((d) => [d.file, d.lines]))
  const displayFiles = changedFiles.length > 0 ? changedFiles : fileDiffs.map((d) => ({ file: d.file, additions: 0, deletions: 0 }))
  const activeDiff = selectedFile ? (diffByFile[selectedFile] || []) : []

  return (
    <div className="grid grid-cols-[280px_1fr] gap-5 h-full">

      {/* ── Left: file list + push action ───────────────────────────────── */}
      <div className="flex flex-col min-h-0 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Review &amp; Push</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Branch: <span className="font-mono text-brand-600 text-xs">{pendingBranch.branch_name}</span>
          </p>
        </div>

        {/* Commit stats */}
        <div className="card p-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="font-bold text-gray-900 text-base">{displayFiles.length}</div>
            <div className="text-gray-400">Files</div>
          </div>
          <div>
            <div className="font-bold text-green-600 text-base">+{changedFiles.reduce((s, f) => s + f.additions, 0)}</div>
            <div className="text-gray-400">Added</div>
          </div>
          <div>
            <div className="font-bold text-red-500 text-base">-{changedFiles.reduce((s, f) => s + f.deletions, 0)}</div>
            <div className="text-gray-400">Removed</div>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
          {displayFiles.length > 0 ? displayFiles.map(({ file, additions, deletions }) => (
            <FileDiff
              key={file}
              file={file}
              additions={additions}
              deletions={deletions}
              selected={selectedFile === file}
              onSelect={setSelectedFile}
            />
          )) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
              No file changes detected — fixes may not have applied cleanly.
            </div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">{error}</div>}

        <div className="space-y-2">
          <button onClick={handlePush} disabled={loading} className="btn btn-success w-full py-3">
            {loading ? 'Pushing…' : '🚀 Push to Origin'}
          </button>
          <button onClick={onBack} disabled={loading} className="btn btn-back w-full">← Back</button>
        </div>
      </div>

      {/* ── Right: diff viewer ───────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0 gap-2">
        <div className="text-sm font-semibold text-gray-700">
          {selectedFile
            ? <span className="font-mono text-xs text-gray-600">{selectedFile}</span>
            : <span className="text-gray-400">← Select a file to view its diff</span>}
        </div>
        <div className="flex-1 min-h-0 diff-viewer overflow-y-auto">
          {activeDiff.length > 0 ? activeDiff.map((line, i) => (
            <div key={i} className={
              line.startsWith('+') && !line.startsWith('+++') ? 'diff-add' :
              line.startsWith('-') && !line.startsWith('---') ? 'diff-remove' : ''
            }>{line}</div>
          )) : (
            <div className="text-gray-500 text-xs italic p-2">
              {selectedFile ? 'No diff content available for this file.' : 'Select a file from the list to view changes.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
