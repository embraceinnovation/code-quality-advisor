import { useState, useEffect } from 'react'
import { detectFrameworks, validateLlmKey } from '../api.js'

const LLM_PROVIDERS = [
  // ── Free tier ────────────────────────────────────────────────────────────────
  {
    id: 'groq',
    name: 'Groq',
    badge: 'Free tier',
    badgeStyle: 'bg-green-100 text-green-700',
    keyRequired: true,
    keyLabel: 'Groq API Key',
    keyPlaceholder: 'gsk_...',
    keyHref: 'https://console.groq.com/',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (recommended)' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    badge: 'Free tier',
    badgeStyle: 'bg-green-100 text-green-700',
    keyRequired: true,
    keyLabel: 'Google AI API Key',
    keyPlaceholder: 'AIza...',
    keyHref: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (recommended)' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (fastest)' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    badge: 'Free tier',
    badgeStyle: 'bg-green-100 text-green-700',
    keyRequired: true,
    keyLabel: 'Mistral API Key',
    keyPlaceholder: '...',
    keyHref: 'https://console.mistral.ai/',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small (recommended)' },
      { id: 'open-mistral-7b', label: 'Mistral 7B (free tier)' },
      { id: 'mistral-large-latest', label: 'Mistral Large' },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    badge: 'Free tier',
    badgeStyle: 'bg-green-100 text-green-700',
    keyRequired: true,
    keyLabel: 'Cerebras API Key',
    keyPlaceholder: 'csk-...',
    keyHref: 'https://cloud.cerebras.ai/',
    models: [
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B (ultra-fast)' },
      { id: 'llama3.1-8b', label: 'Llama 3.1 8B (fastest)' },
    ],
  },
  // ── Local ─────────────────────────────────────────────────────────────────────
  {
    id: 'ollama',
    name: 'Ollama',
    badge: 'Local',
    badgeStyle: 'bg-purple-100 text-purple-700',
    keyRequired: false,
    keyLabel: 'No API key needed — runs on your machine',
    keyPlaceholder: '',
    keyHref: 'https://ollama.com/download',
    models: [
      { id: 'llama3.3', label: 'Llama 3.3 (recommended)' },
      { id: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B' },
      { id: 'qwen2.5-coder:32b', label: 'Qwen 2.5 Coder 32B' },
      { id: 'codellama', label: 'Code Llama' },
      { id: 'deepseek-coder-v2', label: 'DeepSeek Coder V2' },
    ],
  },
  // ── Paid ────────────────────────────────────────────────────────────────────
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    badge: 'Paid',
    badgeStyle: 'bg-gray-100 text-gray-500',
    keyRequired: true,
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    keyHref: 'https://console.anthropic.com/',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (most capable)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    badge: 'Paid',
    badgeStyle: 'bg-gray-100 text-gray-500',
    keyRequired: true,
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    keyHref: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o (recommended)' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (fastest)' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    badge: 'Paid',
    badgeStyle: 'bg-gray-100 text-gray-500',
    keyRequired: true,
    keyLabel: 'DeepSeek API Key',
    keyPlaceholder: 'sk-...',
    keyHref: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek V3 (recommended)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoning)' },
    ],
  },
]

const CATEGORY_LABELS = {
  salesforce: 'Salesforce',
  frontend: 'Frontend',
  backend: 'Backend',
  mobile: 'Mobile',
}

const COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  sky: 'bg-sky-100 text-sky-800 border-sky-200',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  zinc: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  lime: 'bg-lime-100 text-lime-800 border-lime-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export default function Step3_Scan({ repo, onBack, onContinue }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [detected, setDetected] = useState([])
  const [fileCount, setFileCount] = useState(0)
  const [selected, setSelected] = useState(new Set())
  const [recommendations, setRecommendations] = useState([])

  // LLM selection — provider + model persisted globally; keys stored per-provider
  const [llmProvider, setLlmProvider] = useState(() => localStorage.getItem('cqa_llm_provider') || 'groq')
  const [llmModel, setLlmModel] = useState(() => localStorage.getItem('cqa_llm_model') || 'llama-3.3-70b-versatile')
  const [llmApiKey, setLlmApiKey] = useState(() => {
    const provider = localStorage.getItem('cqa_llm_provider') || 'groq'
    const perProviderKey = localStorage.getItem(`cqa_llm_key_${provider}`)
    const legacyKey = localStorage.getItem('cqa_llm_key')
    const key = perProviderKey || legacyKey || ''
    // Migrate legacy key to per-provider format
    if (!perProviderKey && legacyKey) {
      localStorage.setItem(`cqa_llm_key_${provider}`, legacyKey)
    }
    return key
  })
  const [showKey, setShowKey] = useState(false)
  const [keyValidation, setKeyValidation] = useState(null) // null | 'testing' | {valid, reason}

  const providerConfig = LLM_PROVIDERS.find((p) => p.id === llmProvider)

  const handleProviderChange = (id) => {
    const cfg = LLM_PROVIDERS.find((p) => p.id === id)
    setLlmProvider(id)
    setLlmModel(cfg.models[0].id)
    setKeyValidation(null)
    // Restore saved key for this provider, fall back to legacy single key
    const savedKey = localStorage.getItem(`cqa_llm_key_${id}`)
      || localStorage.getItem('cqa_llm_key')
      || ''
    setLlmApiKey(savedKey)
    localStorage.setItem('cqa_llm_provider', id)
    localStorage.setItem('cqa_llm_model', cfg.models[0].id)
  }

  const handleModelChange = (model) => {
    setLlmModel(model)
    localStorage.setItem('cqa_llm_model', model)
  }

  const handleKeyChange = (key) => {
    setLlmApiKey(key)
    setKeyValidation(null)
    localStorage.setItem(`cqa_llm_key_${llmProvider}`, key)
  }

  const handleTestKey = async () => {
    setKeyValidation('testing')
    try {
      const result = await validateLlmKey(llmProvider, llmModel, llmApiKey.trim())
      setKeyValidation(result)
    } catch (e) {
      setKeyValidation({ valid: false, reason: 'Could not reach the server — check your connection.' })
    }
  }

  const canStart = !providerConfig?.keyRequired || llmApiKey.trim().length > 0

  useEffect(() => {
    detectFrameworks(repo.owner, repo.name, repo.branch)
      .then((d) => {
        setDetected(d.detected_frameworks)
        setFileCount(d.file_count)
        setSelected(new Set(d.detected_frameworks.map((f) => f.id)))
        setRecommendations(d.llm_recommendations || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-3xl mb-3 animate-spin inline-block">🔎</div>
        <p>Scanning {repo.owner}/{repo.name} for frameworks...</p>
      </div>
    )
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">Error: {error}</div>
  }

  // Group by category
  const grouped = detected.reduce((acc, f) => {
    acc[f.category] = acc[f.category] || []
    acc[f.category].push(f)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-2 gap-5 h-full">

      {/* ── Left: detected frameworks ────────────────────────────────────── */}
      <div className="flex flex-col min-h-0">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-gray-900">Detected Technology Stack</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Found <strong>{fileCount}</strong> files in <strong>{repo.owner}/{repo.name}</strong> ({repo.branch}).
            Click a framework to exclude it from analysis.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {detected.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800 text-sm">
              No specific frameworks detected. The analysis will use general best practices.
            </div>
          ) : (
            Object.entries(grouped).map(([category, frameworks]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {CATEGORY_LABELS[category] || category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {frameworks.map((f) => {
                    const isSelected = selected.has(f.id)
                    const colorClass = COLOR_MAP[f.color] || 'bg-gray-100 text-gray-800 border-gray-200'
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggle(f.id)}
                        title={f.description}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
                          ${isSelected ? colorClass : 'bg-gray-50 text-gray-400 border-gray-200 line-through opacity-50'}`}
                      >
                        {isSelected ? '✓ ' : ''}{f.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-4">
          <button onClick={onBack} className="btn btn-back">← Back</button>
        </div>
      </div>

      {/* ── Right: LLM picker + start button ────────────────────────────── */}
      <div className="flex flex-col min-h-0 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Agent Model</h2>
          <p className="text-gray-500 text-sm mt-0.5">Choose what analyzes your code.</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="card p-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">Recommended for your stack</p>
              {recommendations.map((rec, i) => (
                <button
                  key={rec.provider}
                  onClick={() => handleProviderChange(rec.provider)}
                  className={`w-full text-left rounded-lg border px-2.5 py-1.5 transition-all space-y-0.5
                    ${llmProvider === rec.provider
                      ? 'bg-brand-50 border-brand-400'
                      : 'bg-gray-50 border-gray-200 hover:border-brand-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                      ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-400 text-white' : 'bg-orange-300 text-white'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{rec.display}</span>
                    <span className="ml-auto text-xs font-bold text-brand-600">{rec.score.toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-snug pl-7">{rec.reason}</p>
                </button>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Free Tier</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {LLM_PROVIDERS.filter((p) => p.badge === 'Free tier').map((p) => (
                <ProviderButton key={p.id} p={p} selected={llmProvider === p.id} onClick={() => handleProviderChange(p.id)} />
              ))}
            </div>
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Local (no key needed)</p>
            <div className="grid grid-cols-1 gap-2 mb-3">
              {LLM_PROVIDERS.filter((p) => p.badge === 'Local').map((p) => (
                <ProviderButton key={p.id} p={p} selected={llmProvider === p.id} onClick={() => handleProviderChange(p.id)} />
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Paid</p>
            <div className="grid grid-cols-3 gap-2 mb-0">
              {LLM_PROVIDERS.filter((p) => p.badge === 'Paid').map((p) => (
                <ProviderButton key={p.id} p={p} selected={llmProvider === p.id} onClick={() => handleProviderChange(p.id)} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
            <select value={llmModel} onChange={(e) => handleModelChange(e.target.value)} className="input">
              {providerConfig.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {providerConfig.keyRequired ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-500">
                {providerConfig.keyLabel}{' '}
                <a href={providerConfig.keyHref} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">(get key ↗)</a>
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={llmApiKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder={providerConfig.keyPlaceholder}
                  className={`input font-mono flex-1 ${keyValidation && keyValidation !== 'testing' ? keyValidation.valid ? 'border-green-400' : 'border-red-400' : ''}`}
                />
                <button onClick={() => setShowKey((v) => !v)} className="btn btn-ghost px-3 py-2 text-xs">
                  {showKey ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={handleTestKey}
                  disabled={!llmApiKey.trim() || keyValidation === 'testing'}
                  className="btn btn-ghost px-3 py-2 text-xs disabled:opacity-40 whitespace-nowrap"
                >
                  {keyValidation === 'testing' ? '⏳ Testing…' : 'Test Key'}
                </button>
              </div>
              {keyValidation && keyValidation !== 'testing' && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${keyValidation.valid ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  <span className="shrink-0">{keyValidation.valid ? '✓' : '✗'}</span>
                  <span>{keyValidation.valid ? (keyValidation.reason || 'API key is valid.') : keyValidation.reason}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-800 space-y-1">
              <p className="font-semibold">Ollama must be running locally</p>
              <p>Install from <a href={providerConfig.keyHref} target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a>, then run <code className="bg-purple-100 px-1 rounded">ollama pull {llmModel}</code> to download the model.</p>
            </div>
          )}
        </div>

        <button
          disabled={!canStart}
          onClick={() => onContinue(detected, Array.from(selected), { provider: llmProvider, model: llmModel, apiKey: llmApiKey.trim() })}
          className="btn btn-primary w-full py-3"
        >
          Start Analysis →
        </button>
      </div>
    </div>
  )
}

function ProviderButton({ p, selected, onClick, showBadge = false }) {
  return (
    <button
      onClick={onClick}
      className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all text-center space-y-0.5
        ${selected ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}
    >
      <div>{p.name}</div>
      {showBadge && <div className={`text-xs px-1.5 py-0.5 rounded-full inline-block ${p.badgeStyle}`}>{p.badge}</div>}
    </button>
  )
}
