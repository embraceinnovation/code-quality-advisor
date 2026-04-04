import { useState, useEffect } from 'react'
import { getMe } from './api.js'
import WizardProgress from './components/WizardProgress.jsx'
import Step1_Auth from './components/Step1_Auth.jsx'
import Step2_RepoSelect from './components/Step2_RepoSelect.jsx'
import Step3_Scan from './components/Step3_Scan.jsx'
import Step4_Analyze from './components/Step4_Analyze.jsx'
import Step5_Changes from './components/Step5_Changes.jsx'
import Step6_Review from './components/Step6_Review.jsx'
import Step7_Report from './components/Step7_Report.jsx'

const INITIAL_STATE = {
  session: null,
  repo: null,
  detectedFrameworks: [],
  selectedFrameworks: [],
  llm: null,
  changes: [],
  selectedChangeIds: [],
  pendingBranch: null,
  pushUrl: null,
  report: null,
}

export default function App() {
  const [step, setStep] = useState(1)
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    getMe().then((me) => {
      if (me.authenticated) {
        setState((s) => ({ ...s, session: me }))
        setStep(2)
      }
      window.history.replaceState({}, '', '/')
    })
  }, [])

  const update = (patch) => setState((s) => ({ ...s, ...patch }))
  const next = () => setStep((s) => s + 1)
  const back = () => setStep((s) => Math.max(1, s - 1))
  const goTo = (n) => setStep(n)

  // Go back to repo selection, clearing all analysis state but keeping auth
  const newRepo = () => {
    setState((s) => ({
      ...INITIAL_STATE,
      session: s.session,
    }))
    setStep(2)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="gradient-header px-6 py-4 flex items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Code Quality Advisor</h1>
            <p className="text-xs text-blue-200">AI-powered code analysis & improvement</p>
          </div>
        </div>
        {state.session && (
          <div className="ml-auto flex items-center gap-3 text-sm text-blue-100">
            {state.session.avatar_url && (
              <img src={state.session.avatar_url} alt="" className="w-7 h-7 rounded-full ring-2 ring-white/30" />
            )}
            <span className="font-medium text-white">{state.session.display_name}</span>
            <span className="capitalize text-blue-200 text-xs">via {state.session.provider}</span>
            {step > 2 && (
              <button
                onClick={newRepo}
                className="ml-1 text-xs bg-white/15 hover:bg-white/25 text-white px-3 py-1 rounded-full transition-colors"
              >
                ← New Repo
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex flex-col px-6 py-5" style={{ height: 'calc(100vh - 64px)' }}>
        <WizardProgress currentStep={step} onStepClick={goTo} />

        <div className="flex-1 min-h-0 mt-6">
          {step === 1 && (
            <div className="flex items-start justify-center pt-4">
              <div className="w-full max-w-md">
                <Step1_Auth onAuth={(session) => { update({ session }); next() }} />
              </div>
            </div>
          )}
          {step === 2 && (
            <Step2_RepoSelect
              session={state.session}
              onSelect={(repo) => { update({ repo }); next() }}
            />
          )}
          {step === 3 && (
            <Step3_Scan
              repo={state.repo}
              onBack={back}
              onContinue={(detected, selected, llm) => {
                update({ detectedFrameworks: detected, selectedFrameworks: selected, llm })
                next()
              }}
            />
          )}
          {step === 4 && (
            <Step4_Analyze
              repo={state.repo}
              frameworks={state.selectedFrameworks}
              detectedFrameworks={state.detectedFrameworks}
              llm={state.llm}
              onBack={back}
              onComplete={(changes) => { update({ changes }); next() }}
            />
          )}
          {step === 5 && (
            <Step5_Changes
              changes={state.changes}
              selectedIds={state.selectedChangeIds}
              onSelectionChange={(ids) => update({ selectedChangeIds: ids })}
              onBack={back}
              onNewRepo={newRepo}
              onPackage={(ids, branchResult) => {
                update({ selectedChangeIds: ids, pendingBranch: branchResult })
                next()
              }}
            />
          )}
          {step === 6 && (
            <Step6_Review
              pendingBranch={state.pendingBranch}
              onBack={back}
              onPushed={(url) => { update({ pushUrl: url }); next() }}
            />
          )}
          {step === 7 && (
            <Step7_Report
              repo={state.repo}
              pushUrl={state.pushUrl}
              onNewRepo={newRepo}
            />
          )}
        </div>
      </main>
    </div>
  )
}
