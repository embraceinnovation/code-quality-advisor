import { useState, useEffect, useRef } from 'react'
import { analyzeRepo } from '../api.js'

const COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-800', sky: 'bg-sky-100 text-sky-800',
  indigo: 'bg-indigo-100 text-indigo-800', purple: 'bg-purple-100 text-purple-800',
  cyan: 'bg-cyan-100 text-cyan-800', emerald: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-800', zinc: 'bg-zinc-100 text-zinc-800',
  green: 'bg-green-100 text-green-800', teal: 'bg-teal-100 text-teal-800',
  amber: 'bg-amber-100 text-amber-800', orange: 'bg-orange-100 text-orange-800',
  violet: 'bg-violet-100 text-violet-800', rose: 'bg-rose-100 text-rose-800',
}

export default function Step4_Analyze({ repo, frameworks, detectedFrameworks = [], llm, onBack, onComplete }) {
  const activeFrameworks = detectedFrameworks.filter((f) => frameworks.includes(f.id))
  const [status, setStatus] = useState('idle')
  const [currentFile, setCurrentFile] = useState('')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [issuesFound, setIssuesFound] = useState(0)
  const [error, setError] = useState(null)
  const [rateLimitWait, setRateLimitWait] = useState(null) // { wait, file, countdown }
  const [activityLog, setActivityLog] = useState([])
  const allChanges = useRef([])
  const abortRef = useRef(null)
  const logRef = useRef(null)
  const countdownRef = useRef(null)

  const addLog = (entry) => {
    setActivityLog((prev) => [...prev.slice(-49), { ...entry, ts: Date.now() }])
  }

  // Auto-scroll activity log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [activityLog])

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimitWait?.countdown > 0) {
      countdownRef.current = setTimeout(() => {
        setRateLimitWait((prev) => prev ? { ...prev, countdown: prev.countdown - 1 } : null)
      }, 1000)
    }
    return () => clearTimeout(countdownRef.current)
  }, [rateLimitWait?.countdown])

  useEffect(() => {
    abortRef.current = new AbortController()
    setStatus('running')

    analyzeRepo(
      repo.owner,
      repo.name,
      repo.branch,
      frameworks,
      100,
      llm,
      (event) => {
        if (event.event === 'start') {
          setTotal(event.total)
          setStatus('running')
          addLog({ type: 'info', message: `Starting analysis of ${event.total} files using ${event.model || llm?.model || 'AI'}` })
        } else if (event.event === 'progress') {
          setCurrentFile(event.file)
          setDone(event.done)
          setTotal(event.total)
          setRateLimitWait(null)
          const newChanges = event.new_changes || []
          allChanges.current = [...allChanges.current, ...newChanges]
          setIssuesFound(allChanges.current.length)
          const filename = event.file.split('/').pop()
          if (newChanges.length > 0) {
            addLog({ type: 'issues', message: `${filename}`, count: newChanges.length })
          } else {
            addLog({ type: 'ok', message: `${filename}` })
          }
        } else if (event.event === 'rate_limit') {
          setRateLimitWait({ wait: event.wait, file: event.file, countdown: event.wait })
          addLog({ type: 'ratelimit', message: `Rate limit hit — pausing ${event.wait}s before retrying ${event.file.split('/').pop()}` })
        } else if (event.event === 'scope_info') {
          addLog({
            type: event.html_css_included ? 'scope_included' : 'scope_excluded',
            message: event.message,
          })
        } else if (event.event === 'rate_limit_clear') {
          setRateLimitWait(null)
          addLog({ type: 'info', message: 'Rate limit cleared — resuming analysis' })
        } else if (event.event === 'complete') {
          setRateLimitWait(null)
          setStatus('done')
          addLog({ type: 'done', message: `Analysis complete — ${allChanges.current.length} issue${allChanges.current.length !== 1 ? 's' : ''} found across ${event.total_changes !== undefined ? event.total_changes : ''} files` })
        } else if (event.event === 'error') {
          addLog({ type: 'error', message: `Error on ${event.file.split('/').pop()}: ${event.message}` })
        }
      },
      abortRef.current.signal,
    ).catch((e) => {
      if (e.name === 'AbortError') return
      setError(e.message)
      setStatus('error')
    })

    return () => abortRef.current?.abort()
  }, [])

  const handleBack = () => {
    abortRef.current?.abort()
    onBack()
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex flex-col h-full gap-4">

      <div>
        <h2 className="text-xl font-bold text-gray-900">Analyzing Your Code</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          {llm?.model || 'AI'} is reviewing each file for quality, documentation, and engineering completeness.
        </p>
      </div>

      {/* Frameworks being scanned */}
      {activeFrameworks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Scanning for</p>
          <div className="flex flex-wrap gap-2">
            {activeFrameworks.map((f) => (
              <span
                key={f.id}
                className={`px-3 py-1 rounded-lg text-sm font-medium ${COLOR_MAP[f.color] || 'bg-gray-100 text-gray-700'}`}
              >
                {f.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Progress card */}
      <div className="card p-5 space-y-4">
        {status === 'error' ? (
          <div className="text-red-600 text-sm">Error: {error}</div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{status === 'done' ? 'Analysis complete!' : rateLimitWait ? 'Waiting for rate limit to clear…' : `Analyzing file ${done} of ${total}`}</span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill ${status === 'done' ? '!bg-green-500' : rateLimitWait ? '!bg-orange-400' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {currentFile && status !== 'done' && (
              <div className="text-xs text-gray-400 font-mono truncate">{currentFile}</div>
            )}
            <div className="flex gap-6 pt-1">
              <Stat label="Files scanned" value={done} />
              <Stat label="Total files" value={total || '—'} />
              <Stat label="Issues found" value={issuesFound} highlight={issuesFound > 0} />
              {status === 'done' && <Stat label="Status" value="Done ✓" green />}
            </div>
          </>
        )}
      </div>

      {/* Rate limit banner */}
      {status === 'running' && rateLimitWait && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 text-orange-800 text-sm space-y-1">
          <p className="font-bold">⏸ Rate limit reached — resuming in {rateLimitWait.countdown}s</p>
          <p className="text-xs opacity-80">
            Your provider is asking us to slow down. Analysis will resume automatically — no action needed.
            To avoid this, consider adding API credits or switching to a provider with a higher free tier (e.g. Groq).
          </p>
        </div>
      )}

      {/* Activity log */}
      <div className="flex-1 min-h-0 flex flex-col">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Activity</p>
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1 font-mono text-xs min-h-[120px] max-h-[220px]"
        >
          {activityLog.length === 0 && (
            <span className="text-gray-400">Waiting to start…</span>
          )}
          {activityLog.map((entry, i) => (
            <LogLine key={i} entry={entry} />
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-auto">
        <button onClick={handleBack} className="btn btn-back">← Back</button>
        {status === 'done' && (
          <button onClick={() => onComplete(allChanges.current)} className="btn btn-primary flex-1 py-3">
            Review {issuesFound} issue{issuesFound !== 1 ? 's' : ''} →
          </button>
        )}
        {status === 'error' && (
          <button onClick={handleBack} className="btn btn-ghost flex-1">← Change settings and retry</button>
        )}
      </div>
    </div>
  )
}

function LogLine({ entry }) {
  const styles = {
    ok:              'text-gray-500',
    issues:          'text-blue-700 font-semibold',
    ratelimit:       'text-orange-600 font-semibold',
    info:            'text-gray-400',
    done:            'text-green-600 font-semibold',
    error:           'text-red-500',
    scope_excluded:  'text-amber-700',
    scope_included:  'text-teal-700',
  }
  const icons = {
    ok:              '✓',
    issues:          '⚠',
    ratelimit:       '⏸',
    info:            '·',
    done:            '✓',
    error:           '✗',
    scope_excluded:  'ℹ',
    scope_included:  'ℹ',
  }
  const wrap = entry.type === 'scope_excluded' || entry.type === 'scope_included'
  return (
    <div className={`flex gap-2 leading-5 ${styles[entry.type] || 'text-gray-400'}`}>
      <span className="w-3 shrink-0 text-center">{icons[entry.type] || '·'}</span>
      <span className={wrap ? 'whitespace-normal' : 'truncate'}>
        {entry.message}
        {entry.count != null && (
          <span className="ml-1 text-blue-500">({entry.count} issue{entry.count !== 1 ? 's' : ''})</span>
        )}
      </span>
    </div>
  )
}

function Stat({ label, value, highlight, green }) {
  return (
    <div>
      <div className={`text-xl font-bold ${green ? 'text-green-600' : highlight ? 'text-blue-600' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
