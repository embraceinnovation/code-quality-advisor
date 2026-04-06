import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateReport, downloadReport, downloadReportPdf } from '../api.js'

export default function Step7_Report({ repo, pushUrl, onNewRepo }) {
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
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

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setTimeout(onNewRepo, 1500)
  }

  const handleDownload = async () => {
    try {
      const blob = await downloadReport()
      triggerDownload(blob, `cqa-report-${repo?.name || 'project'}.md`)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    setError(null)
    try {
      const blob = await downloadReportPdf()
      triggerDownload(blob, `cqa-report-${repo?.name || 'project'}.pdf`)
    } catch (e) {
      setError(e.message)
    } finally {
      setPdfLoading(false)
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-900">Your Improvement Guide</h3>
            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                className="bg-gray-700 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                ⬇ Markdown
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                {pdfLoading ? '⏳ Generating…' : '⬇ PDF'}
              </button>
            </div>
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
