import { useState, useEffect } from 'react'
import { validateFixes } from '../api.js'

const VERDICT_CONFIG = {
  safe:   { icon: '✓', label: 'Approved',      dot: 'bg-green-500',  row: 'border-green-200 bg-green-50',  text: 'text-green-700', badge: 'bg-green-100 text-green-700' },
  risky:  { icon: '⚠', label: 'Needs Review',  dot: 'bg-amber-400',  row: 'border-amber-200 bg-amber-50',  text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  reject: { icon: '✗', label: 'Not Recommended', dot: 'bg-red-500',  row: 'border-red-200 bg-red-50',      text: 'text-red-700',   badge: 'bg-red-100 text-red-700' },
  pending:{ icon: '·', label: 'Validating…',   dot: 'bg-gray-300',   row: 'border-gray-200 bg-white',      text: 'text-gray-400',  badge: 'bg-gray-100 text-gray-500' },
}

const VERDICT_EXPLAINER = {
  safe: 'The agent reviewed this fix and found it to be correct, safe to apply, and consistent with the recommendation.',
  risky: 'The agent found potential concerns with this fix — it may be correct but warrants a manual review before including it in the branch. You can keep it selected or uncheck it.',
  reject: 'The agent determined this fix is likely incorrect, incomplete, or could introduce a regression. It has been automatically deselected. You can re-enable it if you disagree.',
}

export default function Step5b_ValidateFixes({ changes, selectedIds, onBack, onProceed }) {
  const selected = changes.filter((c) => selectedIds.includes(c.id))
  const [verdicts, setVerdicts] = useState({}) // id -> { verdict, reason }
  const [approved, setApproved] = useState(new Set(selectedIds))
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    setStatus('running')
    validateFixes(selectedIds, (event) => {
      if (event.event === 'start') {
        setTotal(event.total)
      } else if (event.event === 'result') {
        setVerdicts((prev) => ({ ...prev, [event.id]: { verdict: event.verdict, reason: event.reason } }))
        setDone((d) => d + 1)
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

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Agent Fix Validation</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          Before creating your branch, the agent reviews each proposed fix for correctness and safety.
        </p>
      </div>

      {/* What this step does */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-2 leading-relaxed">
        <p><strong>How this works:</strong> Each selected fix is individually reviewed by the agent against the actual file content. The agent checks whether the proposed change is technically correct and safe to apply.</p>
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span><strong className="text-green-700">Approved</strong> — fix looks correct and safe</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span><strong className="text-amber-700">Needs Review</strong> — agent has concerns; review before including</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span><strong className="text-red-700">Not Recommended</strong> — agent flagged as incorrect; auto-deselected</span>
          </div>
        </div>
        <p className="pt-0.5 text-blue-700">You remain in full control — you can override any verdict by checking or unchecking fixes below.</p>
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
            <span className="text-green-600 font-semibold">✓ {safeCount} approved</span>
            <span className="text-amber-600 font-semibold">⚠ {riskyCount} needs review</span>
            <span className="text-red-600 font-semibold">✗ {rejectCount} not recommended</span>
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
          const isExpanded = expandedId === change.id

          return (
            <div
              key={change.id}
              className={`border rounded-xl p-3 flex gap-3 items-start transition-all ${cfg.row} ${isPending ? 'opacity-60' : ''}`}
            >
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
                <p className="text-sm font-medium text-gray-800">{change.issue}</p>

                {/* Verdict rationale */}
                {v && (
                  <div className="space-y-1">
                    {v.reason && (
                      <p className={`text-xs ${cfg.text} leading-snug`}>
                        <strong>Agent note:</strong> {v.reason}
                      </p>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : change.id)}
                      className={`text-xs underline ${cfg.text} opacity-70 hover:opacity-100`}
                    >
                      {isExpanded ? 'Hide explanation ▲' : 'What does this mean? ▼'}
                    </button>
                    {isExpanded && (
                      <p className={`text-xs ${cfg.text} bg-white/60 rounded-lg p-2 leading-relaxed`}>
                        {VERDICT_EXPLAINER[v.verdict]}
                        {v.verdict === 'reject' && !isApproved && (
                          <span className="block mt-1 font-semibold">This fix is currently deselected and will not be included in your branch.</span>
                        )}
                        {v.verdict === 'risky' && (
                          <span className="block mt-1 font-semibold">This fix is currently {isApproved ? 'included — uncheck it if you want to exclude it' : 'excluded — check it to include it anyway'}.</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note for rejects */}
      {status === 'done' && rejectCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-xs text-red-700">
          <span className="font-semibold">{rejectCount} fix{rejectCount !== 1 ? 'es were' : ' was'} automatically deselected</span> because the agent determined {rejectCount !== 1 ? 'they were' : 'it was'} likely incorrect or could introduce a regression. You can re-enable {rejectCount !== 1 ? 'them' : 'it'} by checking the box above if you disagree with the agent's assessment.
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
            Create branch with {approved.size} fix{approved.size !== 1 ? 'es' : ''} →
          </button>
        )}
      </div>
    </div>
  )
}
