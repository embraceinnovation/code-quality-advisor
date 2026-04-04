import { useState } from 'react'
import { login } from '../api'

const PROVIDERS = [
  {
    id: 'github',
    name: 'GitHub',
    bg: 'bg-gray-900 hover:bg-gray-700',
    tokenUrl: 'https://github.com/settings/tokens/new',
    tokenLabel: 'Generate a GitHub Personal Access Token',
    tokenScopes: 'Required scopes: repo (full), workflow (if using Actions)',
    patPlaceholder: 'ghp_...',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    bg: 'bg-orange-600 hover:bg-orange-500',
    tokenUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    tokenLabel: 'Generate a GitLab Personal Access Token',
    tokenScopes: 'Required scopes: read_api, read_repository, write_repository',
    patPlaceholder: 'glpat-...',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
      </svg>
    ),
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    bg: 'bg-blue-700 hover:bg-blue-600',
    tokenUrl: 'https://bitbucket.org/account/settings/api-tokens',
    tokenLabel: 'Create a Bitbucket API Token ↗',
    tokenScopes: 'Required scopes: Account (Read) · Repositories (Read + Write)',
    patPlaceholder: 'API token...',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z" />
      </svg>
    ),
  },
]

export default function Step1_Auth({ onAuth }) {
  const [provider, setProvider] = useState('github')
  const [pat, setPat] = useState('')
  const [username, setUsername] = useState('')
  const [showPat, setShowPat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = PROVIDERS.find((p) => p.id === provider)

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    if (!pat.trim()) return
    if (provider === 'bitbucket' && !username.trim()) {
      setError('Bitbucket requires your Atlassian email address.')
      return
    }
    setLoading(true)
    try {
      const me = await login(provider, pat.trim(), username.trim())
      onAuth(me)
    } catch (err) {
      setError(err.message || 'Authentication failed. Check your token and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-header text-3xl mb-4 shadow-blue">🔍</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Code Quality Advisor</h2>
          <p className="text-gray-500 text-sm">
            Connect your repository using a Personal Access Token. Your token is encrypted at rest and never shared.
          </p>
        </div>

        {/* Provider selector */}
        <div className="flex gap-2 mb-5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); setError('') }}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 text-xs font-semibold transition-all
                ${provider === p.id
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              <span className={provider === p.id ? 'text-indigo-600' : 'text-gray-500'}>{p.icon}</span>
              {p.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          {/* Bitbucket email */}
          {provider === 'bitbucket' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Atlassian Email Address
              </label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="email"
              />
            </div>
          )}

          {/* PAT input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {provider === 'bitbucket' ? 'Bitbucket API Token' : 'Personal Access Token'}
            </label>
            <div className="relative">
              <input
                type={showPat ? 'text' : 'password'}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder={selected.patPlaceholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPat((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                {showPat ? 'Hide' : 'Show'}
              </button>
            </div>
            {provider === 'bitbucket' ? (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-blue-800">Required token scopes:</p>
                <div className="flex flex-col gap-1">
                  {[
                    { label: 'Account — Read', scope: 'read:user:bitbucket' },
                    { label: 'Workspaces — Read', scope: 'read:workspace:bitbucket' },
                    { label: 'Repositories — Read', scope: 'read:repository:bitbucket' },
                    { label: 'Repositories — Write', scope: 'write:repository:bitbucket' },
                  ].map(({ label, scope }) => (
                    <div key={scope} className="flex items-center justify-between bg-blue-100 border border-blue-300 rounded px-2 py-1">
                      <span className="text-xs font-semibold text-blue-900">{label}</span>
                      <span className="text-xs font-mono text-blue-600 ml-3">{scope}</span>
                    </div>
                  ))}
                </div>
                <a href={selected.tokenUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline font-medium block pt-0.5">
                  {selected.tokenLabel}
                </a>
              </div>
            ) : (
              <>
                <p className="mt-1.5 text-xs text-gray-400">{selected.tokenScopes}</p>
                <a href={selected.tokenUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">
                  {selected.tokenLabel} ↗
                </a>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pat.trim()}
            className="btn btn-primary w-full py-3 text-base"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Verifying…
              </>
            ) : (
              <>
                {selected.icon}
                Sign in with {selected.name}
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-gray-400">
          Your token is encrypted server-side and stored for 30 days. Your code is never stored
          permanently.
        </p>
      </div>
    </div>
  )
}
