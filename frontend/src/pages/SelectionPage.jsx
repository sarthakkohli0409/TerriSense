import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTerriStore } from '../store/useStore'
import {
  PageHeader, TagButton, FormulaExplainer, NavigationButtons
} from '../components/common'

const LAUNCH_TYPES = [
  ['primaryCare',  'Primary Care'],
  ['specialty',    'Specialty'],
  ['oncology',     'Oncology'],
  ['rareDisease',  'Rare Disease'],
  ['matureBrand',  'Mature Brand'],
  ['newLaunch',    'New Launch'],
]

const OBJECTIVES = [
  {
    id: 'balanced',
    label: 'Balanced approach',
    desc: 'Balance coverage, growth, and efficiency equally',
    weights: '40% Capacity · 40% Potential · 20% ROI',
  },
  {
    id: 'maxCoverage',
    label: 'Maximize coverage',
    desc: 'Reach the broadest possible audience',
    weights: '55% Capacity · 30% Potential · 15% ROI',
  },
  {
    id: 'maxGrowth',
    label: 'Maximize growth opportunity',
    desc: 'Focus investment on highest-potential accounts',
    weights: '15% Capacity · 50% Potential · 35% ROI',
  },
  {
    id: 'maxEfficiency',
    label: 'Maximize efficiency',
    desc: 'Minimize cost per call and maximize ROI',
    weights: '20% Capacity · 35% Potential · 45% ROI',
  },
]

const STATE_ALIGN_OPTIONS = [
  {
    id: 'off',
    label: 'Off',
    desc: 'Territories may cross state boundaries. Optimize for geography and compactness.',
  },
  {
    id: 'soft',
    label: 'Soft preference',
    desc: 'Prefer keeping states intact. Allow crossing if needed to meet balance tolerance. (Recommended)',
  },
  {
    id: 'strict',
    label: 'Strict alignment',
    desc: 'Preserve state boundaries. Flag territories that exceed tolerance due to state constraints.',
  },
]

export default function SelectionPage() {
  const navigate = useNavigate()
  const { selection, setSelection, markComplete } = useTerriStore()

  const handleNext = () => {
    markComplete('selection')
    navigate('/upload')
  }

  return (
    <div>
      <PageHeader
        title="Brand & Strategic Context"
        subtitle="Define the commercial deployment scenario. These inputs guide defaults throughout TerriSense."
      />

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Asset Details */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Asset details</h3>
          <div className="mb-3">
            <label className="form-label">Brand / asset name</label>
            <input
              className="form-input"
              placeholder="e.g. Novacept"
              value={selection.brand}
              onChange={(e) => setSelection({ brand: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Therapy area</label>
              <input
                className="form-input"
                placeholder="e.g. Oncology"
                value={selection.therapy}
                onChange={(e) => setSelection({ therapy: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Geography</label>
              <select
                className="form-select"
                value={selection.geo}
                onChange={(e) => setSelection({ geo: e.target.value })}
              >
                {['US', 'Canada', 'EU', 'UK', 'Australia', 'Global'].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Launch Type */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Launch type</h3>
          <div className="flex flex-wrap gap-2">
            {LAUNCH_TYPES.map(([id, label]) => (
              <TagButton
                key={id}
                label={label}
                selected={selection.launchType === id}
                onClick={() => setSelection({ launchType: id })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Planning Objective */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Planning objective</h3>
        <p className="text-xs text-gray-400 mb-3">
          The objective sets default sizing method weights. You can override them in the sizing step.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {OBJECTIVES.map((obj) => (
            <button
              key={obj.id}
              onClick={() => setSelection({ objective: obj.id })}
              className={[
                'text-left p-3 rounded-lg border transition-all',
                selection.objective === obj.id
                  ? 'border-teal-400 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              ].join(' ')}
            >
              <div className={`text-sm font-medium mb-0.5 ${selection.objective === obj.id ? 'text-teal-700' : 'text-gray-800'}`}>
                {obj.label}
              </div>
              <div className="text-xs text-gray-400 mb-1">{obj.desc}</div>
              <div className={`text-2xs font-mono ${selection.objective === obj.id ? 'text-teal-500' : 'text-gray-300'}`}>
                {obj.weights}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Alignment Preferences */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">State alignment preference</h3>
          <div className="space-y-2">
            {STATE_ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelection({ stateAlign: opt.id })}
                className={[
                  'w-full text-left p-3 rounded-lg border transition-all',
                  selection.stateAlign === opt.id
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300',
                ].join(' ')}
              >
                <div className={`text-sm font-medium mb-0.5 ${selection.stateAlign === opt.id ? 'text-teal-700' : 'text-gray-700'}`}>
                  {opt.label}
                </div>
                <div className="text-xs text-gray-400">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Balance tolerance</h3>
          <p className="text-xs text-gray-400 mb-3">
            Maximum allowed workload deviation from average territory workload.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {[10, 15, 20].map((t) => (
              <TagButton
                key={t}
                label={`±${t}%`}
                selected={selection.tolerance === t}
                onClick={() => setSelection({ tolerance: t })}
              />
            ))}
          </div>
          <div>
            <label className="form-label">Custom tolerance (%)</label>
            <input
              type="number"
              className="form-input"
              min="5"
              max="50"
              value={selection.tolerance}
              onChange={(e) => setSelection({ tolerance: Number(e.target.value) })}
            />
          </div>

          <FormulaExplainer>
            <p>Balance tolerance defines how much each territory's workload can deviate from the average.</p>
            <p className="mt-1">
              A ±15% tolerance means territories with workload index between 85 and 115 are considered balanced.
            </p>
            <p className="mt-1 font-mono text-2xs">
              Workload Index = Territory Calls / Avg Territory Calls × 100
            </p>
          </FormulaExplainer>
        </div>
      </div>

      <NavigationButtons
        onNext={handleNext}
        nextLabel="Continue to Data Upload"
      />
    </div>
  )
}
