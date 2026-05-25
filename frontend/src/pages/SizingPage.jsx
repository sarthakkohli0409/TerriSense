import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTerriStore } from '../store/useStore'
import {
  PageHeader, LoadingSpinner, ErrorMessage, NavigationButtons,
  FormulaExplainer, MetricCard, WeightSlider
} from '../components/common'
import { runSizing } from '../utils/api'
import { OBJECTIVE_WEIGHTS, fmt } from '../utils/helpers'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

export default function SizingPage() {
  const navigate  = useNavigate()
  const {
    sizingInputs, setSizingInput,
    methodWeights, setMethodWeights,
    segmentation, selection,
    setSizingResult, sizingResult,
    markComplete,
  } = useTerriStore()

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [useApi,  setUseApi]  = useState(false)

  const obj     = selection.objective || 'balanced'
  const wDef    = OBJECTIVE_WEIGHTS[obj] || OBJECTIVE_WEIGHTS.balanced
  const w       = { ...wDef, ...methodWeights }
  const wSum    = w.capacity + w.potential + w.roi
  const wOk     = Math.abs(wSum - 100) < 1

  const totalCalls = segmentation.result?.total_calls_required || 0

  // ── Client-side sizing ─────────────────────────────────────────────────────
  function runClientSizing() {
    const si = sizingInputs

    // A: Capacity
    const effCap = si.callsPerDay * si.workingDays * (1 - si.nonSellingPct / 100)
    const adjCalls = totalCalls / (si.accessFactor || 1)
    const capacityK = Math.max(1, Math.ceil(adjCalls / effCap))

    // B: Potential
    const potentialK = Math.max(1, Math.ceil(si.coveredPotential / si.desiredPerRep))

    // C: ROI
    const base = si.revenue / si.revenuePerRep
    const roiK = Math.max(1, Math.ceil(base * si.dimReturn))
    const cost = roiK * si.costPerRep
    const roiRatio = si.revenue / Math.max(cost, 1)
    const roiWarning = roiRatio < si.minROI

    // Strategic K
    const strategicK = Math.max(1, Math.ceil(
      capacityK  * w.capacity  / 100 +
      potentialK * w.potential / 100 +
      roiK       * w.roi       / 100
    ))

    // Budget K
    const budgetK = Math.max(1, Math.floor(si.totalBudget / si.loadedCostPerRep))
    const finalK  = Math.max(1, Math.min(strategicK, budgetK))
    const budgetCapped = budgetK < strategicK

    const narrative =
      `Total required call workload: ${Math.round(totalCalls).toLocaleString()} calls. ` +
      `Capacity sizing → ${capacityK}, potential sizing → ${potentialK}, ROI sizing → ${roiK}. ` +
      `Strategic K = ${strategicK}.` +
      (budgetCapped ? ` Budget supports ${budgetK} reps — Final K capped at ${budgetK}.` : '') +
      ` Final deployment K = ${finalK} (range ${Math.round(finalK * 0.9)}–${Math.round(finalK * 1.1)}).`

    setSizingResult({
      capacity_k: capacityK, potential_k: potentialK, roi_k: roiK,
      strategic_k: strategicK, budget_k: budgetK, final_k: finalK,
      range_low: Math.max(1, Math.round(finalK * 0.9)),
      range_high: Math.round(finalK * 1.1),
      budget_capped: budgetCapped, roi_warning: roiWarning,
      roi_ratio: +roiRatio.toFixed(2),
      effective_rep_capacity: +effCap.toFixed(1),
      total_calls_required: totalCalls,
      method_weights: w,
      narrative,
      assumptions: { ...sizingInputs }
    })
  }

  async function runApiSizing() {
    setLoading(true)
    setError('')
    try {
      const si = sizingInputs
      const payload = {
        planning_objective: obj,
        capacity_inputs: {
          calls_per_day: si.callsPerDay, working_days: si.workingDays,
          non_selling_pct: si.nonSellingPct / 100, accessibility_factor: si.accessFactor,
          total_calls_required: totalCalls,
        },
        potential_inputs: {
          covered_market_potential: si.coveredPotential,
          desired_potential_per_rep: si.desiredPerRep,
        },
        roi_inputs: {
          expected_revenue: si.revenue, revenue_per_rep: si.revenuePerRep,
          diminishing_return_factor: si.dimReturn, cost_per_rep: si.costPerRep,
          min_roi_ratio: si.minROI,
        },
        budget_inputs: {
          total_budget: si.totalBudget, fully_loaded_cost_per_rep: si.loadedCostPerRep,
        },
        method_weights: { capacity: w.capacity, potential: w.potential, roi: w.roi }
      }
      const res = await runSizing(payload)
      setSizingResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRun = () => useApi ? runApiSizing() : runClientSizing()

  const handleNext = () => {
    markComplete('sizing')
    navigate('/alignment')
  }

  const r = sizingResult
  const chartData = r ? [
    { name: 'Capacity', value: r.capacity_k, fill: '#1D9E75' },
    { name: 'Potential', value: r.potential_k, fill: '#185FA5' },
    { name: 'ROI',      value: r.roi_k,       fill: '#EF9F27' },
    { name: 'Strategic',value: r.strategic_k, fill: '#888780' },
    { name: 'Final K',  value: r.final_k,     fill: '#0F6E56' },
  ] : []

  const si = sizingInputs

  return (
    <div>
      <PageHeader
        title="Sales Force Sizing"
        subtitle="Three independent methods triangulate the number of territories (K). Budget acts as a hard cap."
      />

      {!totalCalls && (
        <div className="warning-box mb-4">
          No segmentation result found. Complete segmentation first to use actual call workload in capacity sizing.
        </div>
      )}

      {/* Three methods */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Method A */}
        <div className="card">
          <div className="text-xs font-semibold text-teal-600 mb-3">A · Capacity-based sizing</div>
          <div className="space-y-3">
            <div>
              <label className="form-label">Calls per rep per day</label>
              <input type="number" className="form-input" value={si.callsPerDay}
                onChange={(e) => setSizingInput('callsPerDay', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Working days / period</label>
              <input type="number" className="form-input" value={si.workingDays}
                onChange={(e) => setSizingInput('workingDays', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Non-selling time (%)</label>
              <input type="number" className="form-input" value={si.nonSellingPct} min="0" max="60"
                onChange={(e) => setSizingInput('nonSellingPct', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Accessibility factor (0–1)</label>
              <input type="number" className="form-input" value={si.accessFactor} min="0.1" max="1" step="0.05"
                onChange={(e) => setSizingInput('accessFactor', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Total calls required</label>
              <input type="number" className="form-input"
                value={totalCalls || si.callsOverride || 86400}
                onChange={(e) => setSizingInput('callsOverride', +e.target.value)}
                disabled={!!totalCalls}
              />
              {totalCalls > 0 && <div className="text-2xs text-teal-500 mt-0.5">From segmentation</div>}
            </div>
          </div>
          {r && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400">Estimate</div>
              <div className="text-2xl font-semibold text-teal-600">{r.capacity_k}</div>
              <div className="text-xs text-gray-400">
                Rep capacity: {fmt.int(r.effective_rep_capacity)} calls/period
              </div>
            </div>
          )}
          <FormulaExplainer>
            <p className="font-mono text-2xs">
              Effective Capacity = Calls/Day × Working Days × (1 − Non-Selling%)<br/>
              Capacity K = Total Calls / Effective Capacity
            </p>
          </FormulaExplainer>
        </div>

        {/* Method B */}
        <div className="card">
          <div className="text-xs font-semibold text-blue-600 mb-3">B · Potential-based sizing</div>
          <div className="space-y-3">
            <div>
              <label className="form-label">Covered market potential ($)</label>
              <input type="number" className="form-input" value={si.coveredPotential}
                onChange={(e) => setSizingInput('coveredPotential', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Desired potential per rep ($)</label>
              <input type="number" className="form-input" value={si.desiredPerRep}
                onChange={(e) => setSizingInput('desiredPerRep', +e.target.value)} />
            </div>
          </div>
          {r && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400">Estimate</div>
              <div className="text-2xl font-semibold text-blue-600">{r.potential_k}</div>
            </div>
          )}
          <FormulaExplainer>
            <p className="font-mono text-2xs">
              Potential K = Covered Market Potential / Desired Potential per Rep
            </p>
          </FormulaExplainer>
        </div>

        {/* Method C */}
        <div className="card">
          <div className="text-xs font-semibold text-amber-600 mb-3">C · ROI-optimal sizing</div>
          <div className="space-y-3">
            <div>
              <label className="form-label">Revenue opportunity ($)</label>
              <input type="number" className="form-input" value={si.revenue}
                onChange={(e) => setSizingInput('revenue', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Revenue per rep ($)</label>
              <input type="number" className="form-input" value={si.revenuePerRep}
                onChange={(e) => setSizingInput('revenuePerRep', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Diminishing return factor (0–1)</label>
              <input type="number" className="form-input" value={si.dimReturn} min="0.5" max="1" step="0.05"
                onChange={(e) => setSizingInput('dimReturn', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Cost per rep ($)</label>
              <input type="number" className="form-input" value={si.costPerRep}
                onChange={(e) => setSizingInput('costPerRep', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">Min acceptable ROI ratio</label>
              <input type="number" className="form-input" value={si.minROI} min="1" max="10" step="0.5"
                onChange={(e) => setSizingInput('minROI', +e.target.value)} />
            </div>
          </div>
          {r && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400">Estimate</div>
              <div className="text-2xl font-semibold text-amber-600">{r.roi_k}</div>
              <div className="text-xs text-gray-400">ROI ratio: {r.roi_ratio}×</div>
              {r.roi_warning && (
                <div className="badge badge-amber mt-1">ROI below threshold</div>
              )}
            </div>
          )}
          <FormulaExplainer>
            <p className="font-mono text-2xs">
              ROI K = (Revenue / Revenue per Rep) × Diminishing Return<br/>
              ROI Ratio = Revenue / (ROI K × Cost per Rep)
            </p>
          </FormulaExplainer>
        </div>
      </div>

      {/* Weighting */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">Method weighting</h3>
          <button
            onClick={() => setMethodWeights(OBJECTIVE_WEIGHTS[obj] || OBJECTIVE_WEIGHTS.balanced)}
            className="btn btn-sm text-xs"
          >
            Reset to {obj} defaults
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Default weights auto-applied from your <strong>{obj}</strong> objective. Override with sliders.
        </p>

        <WeightSlider label="Capacity-based" value={w.capacity} color="#1D9E75"
          onChange={(v) => setMethodWeights({ capacity: v })} />
        <WeightSlider label="Potential-based" value={w.potential} color="#185FA5"
          onChange={(v) => setMethodWeights({ potential: v })} />
        <WeightSlider label="ROI-optimal" value={w.roi} color="#EF9F27"
          onChange={(v) => setMethodWeights({ roi: v })} />

        <div className={`text-xs font-medium mt-2 ${wOk ? 'text-teal-600' : 'text-red-500'}`}>
          Weight sum: {wSum}% {wOk ? '✓' : '— must equal 100%'}
        </div>

        <FormulaExplainer>
          <p className="font-mono text-2xs">
            Strategic K = Capacity K × W_cap + Potential K × W_pot + ROI K × W_roi
          </p>
          <p className="mt-1">Budget is NOT included in weighted average. It acts as a hard cap on Final K.</p>
          <p className="font-mono text-2xs mt-1">Final K = min(Strategic K, Budget K)</p>
        </FormulaExplainer>
      </div>

      {/* Budget */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Budget constraint</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Total sales force budget ($)</label>
            <input type="number" className="form-input" value={si.totalBudget}
              onChange={(e) => setSizingInput('totalBudget', +e.target.value)} />
          </div>
          <div>
            <label className="form-label">Fully loaded cost per rep ($)</label>
            <input type="number" className="form-input" value={si.loadedCostPerRep}
              onChange={(e) => setSizingInput('loadedCostPerRep', +e.target.value)} />
          </div>
        </div>
      </div>

      {/* API toggle + run */}
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={useApi} onChange={(e) => setUseApi(e.target.checked)} />
          Use backend API
        </label>
        <button
          onClick={handleRun}
          disabled={loading || !wOk}
          className={`btn ${!wOk ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? '⟳ Calculating...' : '⟳ Calculate K'}
        </button>
      </div>

      {loading && <LoadingSpinner text="Running sizing models..." />}
      <ErrorMessage message={error} />

      {/* Results */}
      {r && (
        <>
          <div className="narrative-box mb-4">{r.narrative}</div>

          {r.budget_capped && (
            <div className="warning-box mb-4">
              ⚠ Budget caps strategic recommendation ({r.strategic_k}) → Final K set to {r.budget_k}.
              Consider requesting additional budget or reducing territory count.
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 mb-4">
            <MetricCard label="Capacity K"  value={r.capacity_k}  color="teal" />
            <MetricCard label="Potential K" value={r.potential_k} color="blue" />
            <MetricCard label="ROI K"       value={r.roi_k}       color="amber" />
            <MetricCard label="Strategic K" value={r.strategic_k} />
          </div>

          <div className="card mb-4">
            <div className="flex items-start gap-8">
              <div>
                <div className="text-xs text-gray-400 mb-1">Final K</div>
                <div className="text-5xl font-bold text-teal-600">{r.final_k}</div>
                <div className="text-sm text-gray-400 mt-1">
                  Range: {r.range_low} – {r.range_high}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Budget K: {r.budget_k}
                  {r.budget_capped && <span className="badge badge-amber ml-2">Budget capped</span>}
                </div>
              </div>
              <div className="flex-1" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      <NavigationButtons
        onBack={() => navigate('/segmentation')}
        onNext={handleNext}
        nextLabel="Continue to Territory Alignment"
        nextDisabled={!r}
      />
    </div>
  )
}
