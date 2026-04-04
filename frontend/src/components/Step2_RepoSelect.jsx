import { useState, useEffect } from 'react'
import { listRepos, listBranches } from '../api.js'

export default function Step2_RepoSelect({ session, onSelect }) {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(false)

  useEffect(() => {
    listRepos()
      .then((d) => setRepos(d.repos))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleRepoClick = async (repo) => {
    setSelectedRepo(repo)
    setSelectedBranch('')
    setBranches([])
    setLoadingBranches(true)
    try {
      const d = await listBranches(repo.owner, repo.name)
      setBranches(d.branches)
      setSelectedBranch(repo.default_branch || d.branches[0]?.name || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingBranches(false)
    }
  }

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center space-y-2">
        <div className="text-3xl animate-spin inline-block">⚙️</div>
        <p className="text-sm">Loading your repositories...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">Error: {error}</div>
  )

  return (
    <div className="grid grid-cols-[1fr_340px] gap-5 h-full">

      {/* ── Left: repo list ─────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-gray-900">Select a Repository</h2>
          <p className="text-gray-500 text-sm mt-0.5">Choose the repo you want to analyze.</p>
        </div>
        <input
          type="text"
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input mb-3"
        />
        <div className="flex-1 min-h-0 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 overflow-y-auto">
          {filtered.map((repo) => (
            <button
              key={repo.id}
              onClick={() => handleRepoClick(repo)}
              className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3
                ${selectedRepo?.id === repo.id ? 'bg-blue-50 border-l-4 border-brand-600' : ''}`}
            >
              <span className="text-base flex-shrink-0">{repo.private ? '🔒' : '📂'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900 truncate">{repo.full_name}</div>
                {repo.description && (
                  <div className="text-xs text-gray-400 truncate">{repo.description}</div>
                )}
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0 text-right space-y-0.5">
                {repo.language && <div>{repo.language}</div>}
                {repo.stars > 0 && <div>★ {repo.stars}</div>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No repositories found.</div>
          )}
        </div>
      </div>

      {/* ── Right: repo detail + branch selector ────────────────────────── */}
      <div className="flex flex-col min-h-0">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-gray-900">Branch</h2>
          <p className="text-gray-500 text-sm mt-0.5">Select the branch to analyze.</p>
        </div>

        {!selectedRepo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-6 space-y-2">
            <span className="text-4xl">👈</span>
            <p className="text-sm">Select a repository to continue</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="card p-4 space-y-1">
              <div className="font-semibold text-gray-900">{selectedRepo.full_name}</div>
              {selectedRepo.description && (
                <div className="text-xs text-gray-500">{selectedRepo.description}</div>
              )}
              <div className="flex gap-3 pt-1 text-xs text-gray-400">
                {selectedRepo.language && <span>{selectedRepo.language}</span>}
                {selectedRepo.stars > 0 && <span>★ {selectedRepo.stars}</span>}
                <span>{selectedRepo.private ? '🔒 Private' : '📂 Public'}</span>
              </div>
            </div>

            {loadingBranches ? (
              <div className="text-sm text-gray-400 px-1">Loading branches...</div>
            ) : (
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="input"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            )}

            <button
              disabled={!selectedBranch || loadingBranches}
              onClick={() => onSelect({ owner: selectedRepo.owner, name: selectedRepo.name, branch: selectedBranch })}
              className="btn btn-primary w-full py-3"
            >
              Continue with {selectedRepo.name} / {selectedBranch} →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
