import { useState, useEffect } from 'react'
import { validateFixes } from '../api.js'

const VERDICT_CONFIG = {
  safe:   { icon: '✓', label: 'Safe',         dot: 'bg-green-500',  row: 'border-green-200 bg-green-50',  text: 'text-green-700', badge: 'bg-green-100 text-green-700' },
  risky:  { icon: '⚠', label: 'Needs Review', dot: 'bg-amber-400',  row: 'border-amber-200 bg-amber-50',  text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  reject: { icon: '✗', label: 'Reject',       dot: 'bg-red-500',    row: 'border-red-200 bg-red-50',      text: 'text-red-700',   badge: 'bg-red-100 text-red-700' },
  pending:{ icon: '·', label: 'Validating…',  dot: 'bg-gray-300',   row: 'border-gray-200 bg-white',      text: 'text-gray-400',  badge: 'bg-gray-100 text-gray-500' },
}

export default function Step5b_ValidateFixes({ changes, selectedIds, onBack, onProceed }) {
  const selected = changes.filter((c) => selectedIds.includes(c.id))
  const [verdicts, setVerdicts] = useState({}) // id -> { verdict, reason }
  const [approved, setApproved] = useState(new Set(selectedIds))
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    setStatus('running')
    validateFixes(selectedIds, (event) => {
      if (event.event === 'start') {
        setTotal(event.total)
      } else if (event.event === 'result') {
        setVerdicts((prev) => ({ ...prev, [event.id]: { verdict: event.verdict, reason: event.reason } }))
        setDone((d) => d + 1)
        // Auto-deselect rejected fixes
        if (event.verdict === 'reject') {
          setApproved((prev) => { const next = new Set(prev); next.delete(event.id); return next })
        }
      } else if (event.event === 'complete') {
        setStatus('done')
      }
    }).catch((e) => {
      setError(e.message)
      setStatus('error')
    })
  }, [])

  const toggleApproved = (id) => {
    setApproved((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const safeCount   = Object.values(verdicts).filter((v) => v.verdict === 'safe').length
  const riskyCount  = Object.values(verdicts).filter((v) => v.verdict === 'risky').length
  const rejectCount = Object.values(verdicts).filter((v) => v.verdict === 'reject').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Validate Fixes</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          AI is reviewing each proposed fix for correctness and safety before applying to your branch.
        </p>
      </div>

      {/* Progress */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{status === 'done' ? 'Validation complete' : `Validating fix ${done} of ${total}…`}</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="progress-track">
          <div className={`progress-fill ${status === 'done' ? '!bg-green-500' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        {status === 'done' && (
          <div className="flex gap-4 pt-1 text-xs">
            <span className="text-green-600 font-semibold">✓ {safeCount} safe</span>
            <span className="text-amber-600 font-semibold">⚠ {riskyCount} needs review</span>
            <span className="text-red-600 font-semibold">✗ {rejectCount} rejected</span>
          </div>
        )}
        {error && <div className="text-red-600 text-sm">Error: {error}</div>}
      </div>

      {/* Fix list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {selected.map((change) => {
          const v = verdicts[change.id]
          const cfg = v ? VERDICT_CONFIG[v.verdict] || VERDICT_CONFIG.pending : VERDICT_CONFIG.pending
          const isApproved = approved.has(change.id)
          const isPending = !v

          return (
            <div
              key={change.id}
              className={`border rounded-xl p-3 flex gap-3 items-start transition-all ${cfg.row} ${isPending ? 'opacity-60' : ''}`}
            >
              {/* Checkbox — only interactive when validation done */}
              <input
                type="checkbox"
                checked={isApproved}
                disabled={isPending}
                onChange={() => toggleApproved(change.id)}
                className="mt-1 flex-shrink-0 accent-blue-600"
              />

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="font-mono text-xs text-gray-500 truncate">{change.file_path.split('/').pop()}:{change.line_number}</span>
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">{change.issue}</p>
                {v?.reason && (
                  <p className={`text-xs ${cfg.text} leading-snug`}>{v.reason}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      {status === 'done' && rejectCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-xs text-red-700">
          <span className="font-semibold">{rejectCount} fix{rejectCount !== 1 ? 'es' : ''} auto-deselected</span> — the AI flagged these as incorrect or potentially harmful. You can re-enable them manually if you disagree.
        </div>
      )}

      <div className="flex gap-3 mt-auto">
        <button onClick={onBack} className="btn btn-back">← Back</button>
        {status === 'done' && (
          <button
            onClick={() => onProceed(Array.from(approved))}
            disabled={approved.size === 0}
            className="btn btn-primary flex-1 py-3 disabled:opacity-40"
          >
            Apply {approved.size} fix{approved.size !== 1 ? 'es' : ''} →
          </button>
        )}
      </div>
    </div>
  )
}
