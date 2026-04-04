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
  // Only show frameworks that were selected for scanning
  const activeFrameworks = detectedFrameworks.filter((f) => frameworks.includes(f.id))
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [currentFile, setCurrentFile] = useState('')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [issuesFound, setIssuesFound] = useState(0)
  const [error, setError] = useState(null)
  const allChanges = useRef([])
  const abortRef = useRef(null)

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
        if (event.event === 'progress') {
          setCurrentFile(event.file)
          setDone(event.done)
          setTotal(event.total)
          const newChanges = event.new_changes || []
          allChanges.current = [...allChanges.current, ...newChanges]
          setIssuesFound(allChanges.current.length)
        } else if (event.event === 'complete') {
          setStatus('done')
        } else if (event.event === 'error') {
          console.warn('Analysis error on', event.file, event.message)
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
              <span>{status === 'done' ? 'Analysis complete!' : `Analyzing file ${done} of ${total}`}</span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="progress-track">
              <div className={`progress-fill ${status === 'done' ? '!bg-green-500' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            {currentFile && status !== 'done' && (
              <div className="text-xs text-gray-400 font-mono truncate">{currentFile}</div>
            )}
            <div className="flex gap-6 pt-1">
              <Stat label="Files scanned" value={done} />
              <Stat label="Issues found" value={issuesFound} highlight={issuesFound > 0} />
              {status === 'done' && <Stat label="Status" value="Done ✓" green />}
            </div>
          </>
        )}
      </div>

      {status === 'running' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm font-semibold">
          ⏳ Large repositories may take several minutes. Keep this tab open.
        </div>
      )}

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
