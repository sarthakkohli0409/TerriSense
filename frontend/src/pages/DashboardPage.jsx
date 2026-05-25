import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTerriStore } from '../store/useStore'
import { PageHeader, MetricCard, StatusBadge, FormulaExplainer } from '../components/common'
import { exportExcel } from '../utils/api'
import { fmt, TERRITORY_COLORS } from '../utils/helpers'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, RadialBarChart, RadialBar,
} from 'recharts'

function QualityCard({ label, value, sub, status }) {
  const statusColor = {
    good:    'text-teal-600  border-teal-200  bg-teal-50',
    warning: 'text-amber-600 border-amber-200 bg-amber-50',
    bad:     'text-red-600   border-red-200   bg-red-50',
  }[status] || 'text-gray-600 border-gray-200 bg-gray-50'

  return (
    <div className={`rounded-lg border px-4 py-3 ${statusColor}`}>
      <div className="text-xs opacity-70 mb-1">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { sizingResult, alignmentResult, segmentation, selection } = useTerriStore()
  const [exporting, setExporting] = useState(false)

  const r  = sizingResult
  const ar = alignmentResult
  const seg = segmentation.result

  if (!r) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Complete the full workflow to view the deployment dashboard." />
        <div className="info-box">
          No sizing result found. Please complete{' '}
          <button onClick={() => navigate('/sizing')} className="underline">sizing</button> first.
        </div>
      </div>
    )
  }

  const sizingChartData = [
    { name: 'Capacity', value: r.capacity_k,  fill: '#1D9E75' },
    { name: 'Potential', value: r.potential_k, fill: '#185FA5' },
    { name: 'ROI',      value: r.roi_k,        fill: '#EF9F27' },
    { name: 'Strategic', value: r.strategic_k, fill: '#888780' },
    { name: 'Final K',  value: r.final_k,      fill: '#0F6E56' },
  ]

  const weightData = [
    { name: 'Capacity',  value: r.method_weights?.capacity  || 40, fill: '#1D9E75' },
    { name: 'Potential', value: r.method_weights?.potential || 40, fill: '#185FA5' },
    { name: 'ROI',       value: r.method_weights?.roi       || 20, fill: '#EF9F27' },
  ]

  const workloadData = ar?.territories?.map((t) => ({
    name: `T-${String(t.territory_id).padStart(2, '0')}`,
    value: t.workload_index,
    fill:  t.workload_index > 115 ? '#F0997B' : t.workload_index < 85 ? '#B5D4F4' : '#9FE1CB',
  })) || []

  const segData = seg?.summary?.map((s, i) => ({
    name: s.segment,
    value: s.hcp_count,
    fill: ['#1D9E75','#185FA5','#EF9F27','#888780','#B4B2A9'][i] || '#ccc',
  })) || []

  // Quality diagnosis
  const pctWithin = ar
    ? +((ar.territories.filter((t) => t.balance_status === 'within').length / ar.territories.length) * 100).toFixed(1)
    : null
  const maxVariance = ar
    ? Math.max(...ar.territories.map((t) => t.workload_index)) - Math.min(...ar.territories.map((t) => t.workload_index))
    : null
  const stateSplits = ar ? ar.territories.filter((t) => t.state_split).length : null

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportExcel({
        hcp_assignments:    ar?.hcp_assignments || [],
        zip_assignments:    [],
        territories:        ar?.territories || [],
        sizing_assumptions: r?.assumptions || {},
        segmentation_summary: seg?.summary || [],
        quality_diagnosis:  ar?.territories || [],
        brand:    selection.brand,
        geography: selection.geo,
      })
    } catch (e) {
      alert(`Export failed: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={`TerriSense Dashboard${selection.brand ? ` — ${selection.brand}` : ''}`}
        subtitle={`Final deployment summary · ${selection.geo} · ${selection.launchType}`}
      />

      {/* Narrative */}
      <div className="narrative-box mb-5">{r.narrative}</div>

      {/* K summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label="Capacity K"  value={r.capacity_k}  color="teal" />
        <MetricCard label="Potential K" value={r.potential_k} color="blue" />
        <MetricCard label="ROI K"       value={r.roi_k}       color="amber" />
        <div className="metric-card border-2 border-teal-400">
          <div className="text-xs text-gray-400 mb-1">Final K</div>
          <div className="text-4xl font-bold text-teal-600">{r.final_k}</div>
          <div className="text-xs text-gray-400">Range: {r.range_low}–{r.range_high}</div>
          {r.budget_capped && <div className="badge badge-amber mt-1 text-2xs">Budget capped</div>}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Sizing comparison */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Sizing estimates comparison</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sizingChartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10 }}>
                  {sizingChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weight pie */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Method weighting</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={weightData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  label={({ name, value }) => `${name} ${value}%`}
                  labelLine={false}
                >
                  {weightData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}%`, 'Weight']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Workload distribution */}
      {workloadData.length > 0 && (
        <div className="card mb-5">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Workload index by territory</h3>
          <p className="text-xs text-gray-400 mb-3">
            100 = average workload. Green = within ±{selection.tolerance}%, orange = above, blue = below.
          </p>
          <div style={{ height: Math.max(180, workloadData.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData} layout="vertical" margin={{ left: 40, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" horizontal={false} />
                <XAxis type="number" domain={[60, 140]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={36} />
                <Tooltip formatter={(v) => [`${v}`, 'Workload Index']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {workloadData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Segment mix */}
      {segData.length > 0 && (
        <div className="card mb-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">HCP segment distribution</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [v.toLocaleString(), 'HCPs']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {segData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Quality diagnosis */}
      {ar && (
        <div className="card mb-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Quality diagnosis</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <QualityCard
              label="Within tolerance"
              value={`${pctWithin}%`}
              sub={`of ${ar.territories.length} territories`}
              status={pctWithin >= 80 ? 'good' : pctWithin >= 60 ? 'warning' : 'bad'}
            />
            <QualityCard
              label="Max workload variance"
              value={`${maxVariance?.toFixed(1)} pts`}
              sub="max − min workload index"
              status={maxVariance < 30 ? 'good' : maxVariance < 50 ? 'warning' : 'bad'}
            />
            <QualityCard
              label="State splits"
              value={stateSplits}
              sub="territories spanning multiple states"
              status={stateSplits === 0 ? 'good' : stateSplits <= 3 ? 'warning' : 'bad'}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {ar.territories.map((t) => (
              <div
                key={t.territory_id}
                className="border border-gray-100 rounded-lg px-3 py-2 text-xs min-w-[90px]"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: TERRITORY_COLORS[(t.territory_id - 1) % TERRITORY_COLORS.length] }}
                  />
                  <span className="font-medium">T-{String(t.territory_id).padStart(2, '0')}</span>
                </div>
                <div className="text-gray-400">{t.hcp_count} HCPs</div>
                <div className="mt-1">
                  <StatusBadge status={t.balance_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assumptions accordion */}
      <div className="card mb-5">
        <FormulaExplainer title="Full sizing assumptions">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            {r.assumptions && Object.entries(r.assumptions).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k.replace(/_/g, ' ')}</span>
                <span className="font-mono font-medium text-gray-700">
                  {typeof v === 'number' ? (v > 1000 ? fmt.money(v) : fmt.dec1(v)) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </FormulaExplainer>
      </div>

      {/* Export */}
      <div className="flex gap-3 mb-4">
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          {exporting ? '⟳ Exporting...' : '↓ Export to Excel'}
        </button>
        <button
          onClick={() => {
            const json = JSON.stringify({ sizingResult: r, alignmentResult: ar, segmentation: seg, selection }, null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'terrisense_session.json'; a.click()
          }}
          className="btn"
        >
          ↓ Export JSON session
        </button>
      </div>

      <div className="text-xs text-gray-300 pb-8">
        TerriSense v1.0 · Generated {new Date().toLocaleDateString()}
      </div>
    </div>
  )
}
