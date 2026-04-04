import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateReport, downloadReport } from '../api.js'

export default function Step7_Report({ repo, pushUrl, onNewRepo }) {
  const [loading, setLoading] = useState(false)
  const [markdown, setMarkdown] = useState(null)
  const [error, setError] = useState(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateReport()
      setMarkdown(result.markdown)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    try {
      const blob = await downloadReport()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cqa-report-${repo?.name || 'project'}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">All Done!</h2>
        <p className="text-gray-500 text-sm mt-1">
          Your improvement branch is ready. Generate a personalized guide to write better code next time.
        </p>
      </div>

      {pushUrl && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-green-600 text-xl">✓</span>
          <div className="flex-1">
            <div className="text-green-800 font-medium text-sm">Branch pushed successfully</div>
            <a
              href={pushUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 text-xs underline break-all"
            >
              {pushUrl}
            </a>
          </div>
        </div>
      )}

      {!markdown && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
          <div className="text-4xl">📄</div>
          <h3 className="font-semibold text-gray-900">Improvement Guide</h3>
          <p className="text-gray-500 text-sm">
            Get a friendly, personalized document with tips on how to write better code next time
            — tailored to the specific issues found in this repo.
          </p>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? 'Generating report...' : 'Generate Improvement Guide'}
          </button>
        </div>
      )}

      {markdown && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Your Improvement Guide</h3>
            <button
              onClick={handleDownload}
              className="bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              ⬇ Download .md
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 prose prose-sm max-w-none">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-4 flex justify-center">
        <button
          onClick={onNewRepo}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Analyze another repository
        </button>
      </div>
    </div>
  )
}
