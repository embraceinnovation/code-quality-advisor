const STEPS = [
  { n: 1, label: 'Authorize' },
  { n: 2, label: 'Select Repo' },
  { n: 3, label: 'Detect Stack' },
  { n: 4, label: 'Analyze' },
  { n: 5, label: 'Review' },
  { n: 6, label: 'Push Branch' },
  { n: 7, label: 'Report' },
]

export default function WizardProgress({ currentStep, onStepClick }) {
  return (
    <div className="flex items-center justify-between gap-1">
      {STEPS.map((s, i) => {
        const done = s.n < currentStep
        const active = s.n === currentStep
        const clickable = done && onStepClick

        return (
          <div key={s.n} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                onClick={() => clickable && onStepClick(s.n)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-150
                  ${done
                    ? 'bg-brand-600 text-white shadow-blue'
                    : active
                    ? 'bg-white border-2 border-brand-600 text-brand-600 shadow-blue ring-4 ring-brand-100'
                    : 'bg-white border-2 border-gray-200 text-gray-400'}
                  ${clickable ? 'cursor-pointer hover:brightness-110' : ''}`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.n}
              </div>
              <span
                onClick={() => clickable && onStepClick(s.n)}
                className={`mt-1.5 text-xs hidden sm:block text-center font-medium whitespace-nowrap
                  ${active ? 'text-brand-600' : done ? 'text-brand-600' : 'text-gray-400'}
                  ${clickable ? 'cursor-pointer hover:underline' : ''}`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors duration-300
                ${done ? 'bg-brand-600' : 'bg-gray-200'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
