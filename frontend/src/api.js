const BASE = '/api'
const OPTS = { credentials: 'include' }

async function _json(url, options = {}) {
  const res = await fetch(BASE + url, { ...OPTS, ...options })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (provider, pat, username = '') =>
  _json('/oauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, pat, username }),
  })

export const getMe = () => _json('/oauth/me')
export const logout = () => fetch(BASE + '/oauth/logout', { ...OPTS, method: 'POST' })

// ── Repos ─────────────────────────────────────────────────────────────────────
export const listRepos = () => _json('/repos')
export const listBranches = (owner, repo) => _json(`/repos/${owner}/${repo}/branches`)

// ── Scan ──────────────────────────────────────────────────────────────────────
export const detectFrameworks = (owner, repo, branch) =>
  _json('/scan/detect-frameworks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, branch }),
  })

export function analyzeRepo(owner, repo, branch, frameworks, fileLimit, llm, onEvent, signal) {
  return fetch(BASE + '/scan/analyze', {
    ...OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      owner, repo, branch, frameworks, file_limit: fileLimit,
      llm_provider: llm?.provider || 'groq',
      llm_model: llm?.model || 'llama-3.3-70b-versatile',
      llm_api_key: llm?.apiKey || '',
    }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() // keep incomplete chunk
      for (const chunk of lines) {
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '))
        if (dataLine) {
          try {
            const event = JSON.parse(dataLine.slice(6))
            onEvent(event)
          } catch (_) {}
        }
      }
    }
  })
}

// ── Changes ───────────────────────────────────────────────────────────────────
export const getChanges = () => _json('/changes')
export const saveSelection = (changeIds) =>
  _json('/changes/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change_ids: changeIds }),
  })

// ── Git ───────────────────────────────────────────────────────────────────────
export function createBranch(changeIds, branchName, onEvent) {
  return fetch(BASE + '/git/branch', {
    ...OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change_ids: changeIds, branch_name: branchName || null }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop()
      for (const chunk of lines) {
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '))
        if (dataLine) {
          try { onEvent(JSON.parse(dataLine.slice(6))) } catch (_) {}
        }
      }
    }
  })
}

export const getDiff = () => _json('/git/diff')

export const pushBranch = () =>
  _json('/git/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

// ── Report ────────────────────────────────────────────────────────────────────
export const generateReport = () =>
  _json('/report/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

export const downloadReport = () =>
  fetch(BASE + '/report/download', OPTS).then((res) => res.blob())
