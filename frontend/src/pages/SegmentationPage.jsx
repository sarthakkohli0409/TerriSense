import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTerriStore } from '../store/useStore'
import {
  PageHeader, LoadingSpinner, ErrorMessage, NavigationButtons,
  FormulaExplainer, MetricCard, ProgressBar, WeightSlider
} from '../components/common'
import { runSegmentation } from '../utils/api'
import { normalize, scoreToSegment, fmt } from '../utils/helpers'

const SEG_COLORS = {
  'Very High': '#0F6E56',
  'High':      '#185FA5',
  'Medium':    '#854F0B',
  'Low':       '#5F5E5A',
  'Very Low':  '#B4B2A9',
}

export default function SegmentationPage() {
  const navigate = useNavigate()
  const {
    upload, segmentation, setSegmentation, setSegDef, setMetricWeight,
    markComplete
  } = useTerriStore()

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [useApi,  setUseApi]  = useState(false)

  const weightSum = segmentation.metricWeights.reduce((s, w) => s + w.weight, 0)
  const weightOk  = Math.abs(weightSum - 100) < 1

  // ── Browser-side segmentation ──────────────────────────────────────────────
  function runClientSegmentation() {
    const data = upload.rawData
    if (!data.length) { setError('No data uploaded.'); return }

    const weights = segmentation.metricWeights
    const defs    = segmentation.segmentDefs

    // Build column stats for normalization
    const colStats = {}
    weights.forEach(({ column }) => {
      const vals = data.map((r) => parseFloat(r[column]) || 0)
      colStats[column] = { min: Math.min(...vals), max: Math.max(...vals) }
    })

    // Score each HCP
    const scored = data.map((row) => {
      let score = 0
      weights.forEach(({ column, weight }) => {
        const v = parseFloat(row[column]) || 0
        const { min, max } = colStats[column]
        const norm = max > min ? (v - min) / (max - min) : 0.5
        score += norm * (weight / 100)
      })
      return { ...row, _score: score }
    })

    // Percentile rank → segment
    scored.sort((a, b) => a._score - b._score)
    const n = scored.length
    const withSegment = scored.map((row, i) => ({
      ...row,
      segment: scoreToSegment(i / n),
    }))

    // Summary
    const summary = defs.map((def) => {
      const count = withSegment.filter((r) => r.segment === def.name).length
      const calls = count * (def.reach_pct / 100) * def.frequency
      const potVals = withSegment
        .filter((r) => r.segment === def.name)
        .map((r) => parseFloat(r.patient_potential || r.potential || 0))
      const avgPot = potVals.length ? potVals.reduce((a, b) => a + b, 0) / potVals.length : 0
      return {
        segment: def.name,
        hcp_count: count,
        pct_of_total: n ? +((count / n) * 100).toFixed(1) : 0,
        reach_pct: def.reach_pct,
        frequency: def.frequency,
        total_calls_required: +calls.toFixed(1),
        avg_potential: +avgPot.toFixed(0),
      }
    })

    const totalCalls = summary.reduce((s, r) => s + r.total_calls_required, 0)

    const parts = summary.filter((s) => s.hcp_count > 0)
      .map((s) => `${s.hcp_count.toLocaleString()} ${s.segment}`)
    const narrative =
      `Segmentation identified ${parts.join(', ')} priority HCPs. ` +
      `Total required call workload: ${Math.round(totalCalls).toLocaleString()} calls per planning period.`

    setSegmentation({
      result: {
        hcp_data: withSegment,
        summary,
        total_calls_required: totalCalls,
        narrative,
        warnings: [],
      }
    })
  }

  // ── API segmentation ───────────────────────────────────────────────────────
  async function runApiSegmentation() {
    setLoading(true)
    setError('')
    try {
      const payload = {
        hcp_data: upload.rawData,
        mode: segmentation.mode,
        uploaded_segment_col: segmentation.uploadedSegCol,
        metric_weights: segmentation.metricWeights,
        segment_definitions: segmentation.segmentDefs,
      }
      const res = await runSegmentation(payload)
      setSegmentation({ result: res })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRun = () => useApi ? runApiSegmentation() : runClientSegmentation()

  const handleNext = () => {
    markComplete('segmentation')
    navigate('/sizing')
  }

  const result = segmentation.result

  return (
    <div>
      <PageHeader
        title="HCP Segmentation"
        subtitle="Calculate composite scores and assign HCPs to segments. Segmentation drives call workload and sizing."
      />

      {/* Mode toggle */}
      <div className="card mb-4">
        <div className="flex gap-1 bg-gray-50 p-1 rounded-lg inline-flex mb-4">
          {[['auto', 'Auto-segmentation'], ['upload', 'Use uploaded segmentation']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSegmentation({ mode: id })}
              className={[
                'px-4 py-1.5 rounded-md text-sm transition-all',
                segmentation.mode === id
                  ? 'bg-white text-gray-800 font-medium shadow-sm'
                  : 'text-gray-400 hover:text-gray-600',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {segmentation.mode === 'upload' ? (
          <div>
            <div className="info-box mb-3">
              Select the column from your uploaded data that contains segment or tier values.
            </div>
            <div>
              <label className="form-label">Segment column</label>
              <select
                className="form-select max-w-xs"
                value={segmentation.uploadedSegCol || ''}
                onChange={(e) => setSegmentation({ uploadedSegCol: e.target.value })}
              >
                <option value="">— select column —</option>
                {upload.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Composite score weights</h3>
            <p className="text-xs text-gray-400 mb-4">
              Each metric is normalized 0–1 before weighting. Weights must sum to 100%.
            </p>

            {segmentation.metricWeights.map((mw, idx) => (
              <div key={idx} className="flex items-center gap-3 mb-3">
                <div className="w-36">
                  <select
                    className="form-select text-xs py-1"
                    value={mw.column}
                    onChange={(e) => setMetricWeight(idx, 'column', e.target.value)}
                  >
                    <option value="">— select column —</option>
                    {upload.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <WeightSlider
                  label=""
                  value={mw.weight}
                  onChange={(v) => setMetricWeight(idx, 'weight', v)}
                />
                <button
                  onClick={() => {
                    const weights = segmentation.metricWeights.filter((_, i) => i !== idx)
                    setSegmentation({ metricWeights: weights })
                  }}
                  className="text-gray-300 hover:text-red-400 text-xs transition-colors"
                >✕</button>
              </div>
            ))}

            <div className="flex items-center gap-4 mt-2">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setSegmentation({
                    metricWeights: [...segmentation.metricWeights, { column: '', weight: 0 }]
                  })
                }}
              >
                + Add metric
              </button>
              <span className={`text-xs font-medium ${weightOk ? 'text-teal-600' : 'text-red-500'}`}>
                Weight sum: {weightSum}% {weightOk ? '✓' : '— must equal 100%'}
              </span>
            </div>

            <FormulaExplainer>
              <p className="font-mono text-2xs mb-1">
                Composite Score = Σ (normalize(metric) × weight)
              </p>
              <p>Each metric is scaled to 0–1 using min-max normalization across the dataset.</p>
              <p className="mt-1">HCPs are then ranked by composite score and assigned to segments by percentile:</p>
              <ul className="mt-1 space-y-0.5">
                <li>Very High: top 15%</li>
                <li>High: 65–85th percentile</li>
                <li>Medium: 35–65th percentile</li>
                <li>Low: 15–35th percentile</li>
                <li>Very Low: bottom 15%</li>
              </ul>
            </FormulaExplainer>
          </div>
        )}
      </div>

      {/* Segment definitions */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-1">Segment call plan parameters</h3>
        <p className="text-xs text-gray-400 mb-4">
          Define reach %, call frequency, and targeting for each segment. These drive total call workload.
        </p>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-32">Segment</th>
                <th>Reach %</th>
                <th>Calls / period</th>
                <th>Target?</th>
                <th>Priority mult.</th>
                {result && <th className="text-right">HCPs</th>}
                {result && <th className="text-right">Calls req.</th>}
              </tr>
            </thead>
            <tbody>
              {segmentation.segmentDefs.map((def, idx) => {
                const sumRow = result?.summary?.find((s) => s.segment === def.name)
                return (
                  <tr key={def.name}>
                    <td>
                      <span className="text-xs font-semibold" style={{ color: SEG_COLORS[def.name] }}>
                        {def.name}
                      </span>
                    </td>
                    <td>
                      <input
                        type="number" min="0" max="100"
                        className="form-input w-20 text-xs py-1"
                        value={def.reach_pct}
                        onChange={(e) => setSegDef(idx, 'reach_pct', Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" max="52"
                        className="form-input w-16 text-xs py-1"
                        value={def.frequency}
                        onChange={(e) => setSegDef(idx, 'frequency', Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={def.target}
                        onChange={(e) => setSegDef(idx, 'target', e.target.checked)}
                        className="accent-teal-500"
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" max="5" step="0.1"
                        className="form-input w-16 text-xs py-1"
                        value={def.priority_multiplier}
                        onChange={(e) => setSegDef(idx, 'priority_multiplier', Number(e.target.value))}
                      />
                    </td>
                    {result && <td className="text-right text-gray-600">{(sumRow?.hcp_count || 0).toLocaleString()}</td>}
                    {result && <td className="text-right text-gray-600">{fmt.int(sumRow?.total_calls_required || 0)}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* API toggle */}
      <div className="flex items-center gap-3 mb-4 text-xs text-gray-400">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={useApi} onChange={(e) => setUseApi(e.target.checked)} />
          Use backend API
        </label>
        <span>(unchecked = browser-side segmentation)</span>
      </div>

      {/* Run button */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={handleRun}
          disabled={loading || (!weightOk && segmentation.mode === 'auto')}
          className={`btn ${loading || (!weightOk && segmentation.mode === 'auto') ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? '⟳ Running...' : '⟳ Run segmentation'}
        </button>
      </div>

      {loading && <LoadingSpinner text="Segmenting HCPs..." />}
      <ErrorMessage message={error} />

      {/* Results */}
      {result && (
        <>
          <div className="narrative-box mb-4">{result.narrative}</div>

          <div className="grid grid-cols-5 gap-3 mb-4">
            {result.summary.map((s) => (
              <div key={s.segment} className="card-sm">
                <div className="text-xs font-semibold mb-1" style={{ color: SEG_COLORS[s.segment] }}>
                  {s.segment}
                </div>
                <div className="text-xl font-semibold text-gray-900">{s.hcp_count.toLocaleString()}</div>
                <div className="text-xs text-gray-400">{s.pct_of_total}% of total</div>
                <div className="text-xs text-gray-400 mt-1">
                  {fmt.int(s.total_calls_required)} calls
                </div>
                <ProgressBar value={s.pct_of_total} max={100} />
              </div>
            ))}
          </div>

          <div className="card-sm mb-4">
            <div className="text-xs text-gray-500">Total required calls</div>
            <div className="text-2xl font-semibold text-teal-600">
              {fmt.int(result.total_calls_required)}
            </div>
            <div className="text-xs text-gray-400">across all target segments per planning period</div>
          </div>
        </>
      )}

      <NavigationButtons
        onBack={() => navigate('/upload')}
        onNext={handleNext}
        nextLabel="Continue to Sizing"
        nextDisabled={!result}
      />
    </div>
  )
}
