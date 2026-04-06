import { useState } from 'react'
import { createBranch } from '../api.js'

const SEVERITY_STYLE = {
  critical:   'bg-red-100 text-red-700 border-red-200',
  warning:    'bg-amber-100 text-amber-700 border-amber-200',
  suggestion: 'bg-blue-100 text-blue-700 border-blue-200',
}

const SEVERITY_DOT = {
  critical:   'bg-red-500',
  warning:    'bg-amber-400',
  suggestion: 'bg-blue-400',
}

const SEVERITY_ORDER = { critical: 0, warning: 1, suggestion: 2 }

export default function Step5_Changes({ changes, selectedIds, onSelectionChange, onBack, onNewRepo, onPackage }) {
  const [selected, setSelected] = useState(new Set(selectedIds))
  const [active, setActive] = useState(changes[0] || null)   // highlighted recommendation
  const [branchName, setBranchName] = useState('')
  const [packaging, setPackaging] = useState(false)
  const [packagingStage, setPackagingStage] = useState('')
  const [packagingDone, setPackagingDone] = useState(0)
  const [packagingTotal, setPackagingTotal] = useState(0)
  const [packagingFile, setPackagingFile] = useState('')
  const [error, setError] = useState(null)
  const [severityFilter, setSeverityFilter] = useState('all')

  const toggle = (id) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
    onSelectionChange(Array.from(next))
  }

  const selectAll = () => {
    const ids = new Set(filtered.map((c) => c.id))
    setSelected(ids)
    onSelectionChange(Array.from(ids))
  }

  const deselectAll = () => {
    setSelected(new Set())
    onSelectionChange([])
  }

  const filtered = changes.filter((c) => severityFilter === 'all' || c.severity === severityFilter)

  const counts = changes.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1
    return acc
  }, {})

  const handlePackage = async () => {
    if (selected.size === 0) return
    setPackaging(true)
    setPackagingDone(0)
    setPackagingTotal(selected.size)
    setPackagingStage('Starting…')
    setPackagingFile('')
    setError(null)
    let result = null
    try {
      await createBranch(Array.from(selected), branchName || null, (event) => {
        if (event.event === 'stage') {
          setPackagingStage(event.message)
        } else if (event.event === 'progress') {
          setPackagingDone(event.done)
          setPackagingTotal(event.total)
          setPackagingStage(event.message)
          setPackagingFile(event.file)
        } else if (event.event === 'done') {
          result = event
          setPackagingStage('Done!')
        }
      })
      if (result) onPackage(Array.from(selected), result)
      else setError('No result received from server')
    } catch (e) {
      setError(e.message)
    } finally {
      setPackaging(false)
    }
  }

  if (changes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold text-gray-900">No Issues Found</h2>
          <p className="text-gray-500 text-sm">Your code looks great — no recommendations to apply.</p>
          <div className="flex flex-col gap-2 pt-2">
            <button onClick={onNewRepo} className="btn btn-primary w-full py-3">← Analyze a different repo</button>
            <button onClick={() => onPackage([], null)} className="btn btn-ghost w-full">Generate report anyway →</button>
            <button onClick={onBack} className="text-gray-400 text-sm hover:underline mt-1">← Back to analysis settings</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-5 h-full">

      {/* ── Left 50%: selectable recommendations list ─────────────────────── */}
      <div className="flex flex-col min-h-0 gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Recommendations</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {changes.length} issue{changes.length !== 1 ? 's' : ''} found — check the ones you want fixed.
          </p>
        </div>

        {/* Severity filter bar */}
        <div className="card p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filter by severity</p>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`px-2 py-2 rounded-lg border text-xs font-semibold transition-all text-center
                ${severityFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'}`}
            >
              All<br/>
              <span className="text-base font-bold">{changes.length}</span>
            </button>
            {['critical', 'warning', 'suggestion'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}
                className={`px-2 py-2 rounded-lg border text-xs font-semibold transition-all text-center capitalize
                  ${severityFilter === sev ? SEVERITY_STYLE[sev] + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full mb-1 ${counts[sev] ? SEVERITY_DOT[sev] : 'bg-gray-300'}`} /><br/>
                {sev}<br/>
                <span className="text-base font-bold">{counts[sev] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button onClick={selectAll} className="text-brand-600 hover:underline font-medium">Select all ({filtered.length})</button>
          <span className="text-gray-300">|</span>
          <button onClick={deselectAll} className="text-gray-500 hover:underline">Deselect all</button>
          <span className="ml-auto text-gray-400">{selected.size} selected</span>
        </div>

        <div className="flex-1 min-h-0 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 overflow-y-auto">
          {filtered.map((change) => {
            const isActive = active?.id === change.id
            const isChecked = selected.has(change.id)
            return (
              <div
                key={change.id}
                onClick={() => setActive(change)}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                  ${isActive ? 'bg-brand-50 border-l-4 border-brand-600' : 'hover:bg-gray-50'}
                  ${isChecked && !isActive ? 'bg-blue-50/40' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => { e.stopPropagation(); toggle(change.id) }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 flex-shrink-0 accent-blue-600"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[change.severity] || 'bg-gray-400'}`} />
                    <span className="font-mono text-xs text-gray-500 truncate">{change.file_path}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">:{change.line_number}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-xs font-semibold flex-shrink-0 ${SEVERITY_STYLE[change.severity]}`}>
                      {change.severity}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 leading-snug">{change.issue}</div>
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={onBack} disabled={packaging} className="btn btn-back w-full">← Back</button>
      </div>

      {/* ── Right 50%: recommendation detail + package action ─────────────── */}
      <div className="flex flex-col min-h-0 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Fix Detail</h2>
          <p className="text-gray-500 text-sm mt-0.5">Click any recommendation to see the full detail and proposed fix.</p>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {active ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-1 rounded-lg border text-xs font-semibold ${SEVERITY_STYLE[active.severity]}`}>
                    {active.severity}
                  </span>
                  <span className="badge badge-gray">{active.category}</span>
                </div>
                <p className="font-semibold text-gray-900 text-sm leading-snug">{active.issue}</p>
                <div className="text-xs text-gray-500 font-mono">
                  {active.file_path} — line {active.line_number}
                </div>
              </div>

              {/* Recommendation */}
              <div className="card p-4 space-y-2">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recommended Fix</h4>
                <p className="text-sm text-gray-800 leading-relaxed">{active.recommendation}</p>
              </div>

              {/* Note about AI applying the fix */}
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-xs text-brand-700 leading-relaxed">
                <strong>How this works:</strong> When you package selected changes, the AI will regenerate
                the corrected code for this specific issue and write it directly into the cloned file
                on a new branch. You can review the full diff before pushing.
              </div>

              {/* Toggle include/exclude */}
              <button
                onClick={() => toggle(active.id)}
                className={`w-full py-2.5 rounded-xl border text-sm font-semibold transition-all
                  ${selected.has(active.id)
                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}`}
              >
                {selected.has(active.id) ? '✕ Remove from fix branch' : '✓ Include in fix branch'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-8">
              <div className="space-y-2">
                <div className="text-3xl">👈</div>
                <p className="text-sm">Select a recommendation to see its detail</p>
              </div>
            </div>
          )}
        </div>

        {/* Package section */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-700">Ready to apply</span>
            <span className="text-brand-600 font-bold">{selected.size} fix{selected.size !== 1 ? 'es' : ''} across {new Set([...changes].filter(c => selected.has(c.id)).map(c => c.file_path)).size} file{new Set([...changes].filter(c => selected.has(c.id)).map(c => c.file_path)).size !== 1 ? 's' : ''}</span>
          </div>

          <input
            type="text"
            placeholder={`cqa/improvements-${new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)}`}
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            disabled={packaging}
            className="input font-mono text-xs disabled:opacity-50"
          />

          {packaging && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="truncate pr-2">{packagingStage}</span>
                {packagingTotal > 0 && (
                  <span className="font-semibold text-brand-600 flex-shrink-0">{packagingDone}/{packagingTotal}</span>
                )}
              </div>
              {packagingTotal > 0 && (
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.round((packagingDone / packagingTotal) * 100)}%` }} />
                </div>
              )}
              {packagingFile && <div className="text-xs text-gray-400 font-mono truncate">{packagingFile}</div>}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-red-700 text-xs">{error}</div>}

          <button
            onClick={handlePackage}
            disabled={selected.size === 0 || packaging}
            className="btn btn-primary w-full py-3"
          >
            {packaging
              ? `Generating fixes… (${packagingDone}/${packagingTotal})`
              : `Package ${selected.size} change${selected.size !== 1 ? 's' : ''} into branch →`}
          </button>
        </div>
      </div>
    </div>
  )
}
