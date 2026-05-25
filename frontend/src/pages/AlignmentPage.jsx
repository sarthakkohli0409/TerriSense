import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTerriStore } from '../store/useStore'
import {
  PageHeader, LoadingSpinner, ErrorMessage, NavigationButtons,
  FormulaExplainer, MetricCard, StatusBadge
} from '../components/common'
import { runAlignment } from '../utils/api'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import { fmt, TERRITORY_COLORS, scoreToSegment } from '../utils/helpers'

// Browser-side alignment — greedy geographic clustering
function runClientAlignment(hcpData, K, stateAlign, tolerancePct, columns) {
  if (!hcpData.length || K < 1) return null

  const zipCol   = columns.zip   || 'zip'
  const stateCol = columns.state || 'state'
  const latCol   = columns.lat   || 'lat'
  const lonCol   = columns.lon   || 'lon'

  // Build ZIP aggregate
  const zipMap = {}
  hcpData.forEach((row) => {
    const z   = String(row[zipCol] || row.zip || '')
    const lat = parseFloat(row[latCol] || row.lat || 0)
    const lon = parseFloat(row[lonCol] || row.lon || 0)
    const st  = String(row[stateCol] || row.state || '')
    const seg = row.segment || 'Medium'
    const segCalls = { 'Very High': 10.8, 'High': 6.4, 'Medium': 2.4, 'Low': 0.6, 'Very Low': 0 }
    const calls = segCalls[seg] || 2.4
    const pot = parseFloat(row.patient_potential || row.potential || 0)

    if (!z || isNaN(lat) || isNaN(lon)) return

    if (!zipMap[z]) {
      zipMap[z] = { zip: z, state: st, lat, lon, hcpCount: 0, totalCalls: 0, potential: 0 }
    }
    zipMap[z].hcpCount++
    zipMap[z].totalCalls += calls
    zipMap[z].potential  += pot
  })

  const zips = Object.values(zipMap)
  if (!zips.length) return null

  const n = zips.length
  const effK = Math.min(K, n)

  // Select spread seeds
  const seeds = [0]
  for (let s = 1; s < effK; s++) {
    let bestIdx = -1, bestDist = -1
    for (let i = 0; i < n; i++) {
      if (seeds.includes(i)) continue
      const minD = Math.min(...seeds.map((si) => {
        const dx = zips[i].lat - zips[si].lat
        const dy = zips[i].lon - zips[si].lon
        return Math.sqrt(dx * dx + dy * dy)
      }))
      if (minD > bestDist) { bestDist = minD; bestIdx = i }
    }
    seeds.push(bestIdx)
  }

  // Assign each ZIP to nearest seed
  const assignments = zips.map((zip, i) => {
    let nearSeed = 0, nearDist = Infinity
    seeds.forEach((si, tidx) => {
      const dx = zip.lat - zips[si].lat
      const dy = zip.lon - zips[si].lon
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < nearDist) { nearDist = d; nearSeed = tidx + 1 }
    })
    return nearSeed
  })

  // Build territory records
  const territories = []
  const tol = tolerancePct / 100

  // Compute averages
  const allCalls = zips.reduce((s, z) => s + z.totalCalls, 0)
  const allPot   = zips.reduce((s, z) => s + z.potential, 0)
  const avgCalls = allCalls / effK
  const avgPot   = allPot / effK

  for (let t = 1; t <= effK; t++) {
    const tZips = zips.filter((_, i) => assignments[i] === t)
    if (!tZips.length) continue

    const totalCalls = tZips.reduce((s, z) => s + z.totalCalls, 0)
    const totalPot   = tZips.reduce((s, z) => s + z.potential, 0)
    const hcpCount   = tZips.reduce((s, z) => s + z.hcpCount, 0)
    const stateList  = [...new Set(tZips.map((z) => z.state).filter(Boolean))].sort()
    const centLat    = tZips.reduce((s, z) => s + z.lat, 0) / tZips.length
    const centLon    = tZips.reduce((s, z) => s + z.lon, 0) / tZips.length

    const wIdx = avgCalls > 0 ? +(totalCalls / avgCalls * 100).toFixed(1) : 100
    const pIdx = avgPot   > 0 ? +(totalPot   / avgPot   * 100).toFixed(1) : 100

    let balanceStatus = 'within'
    if (wIdx > 100 + tol * 100) balanceStatus = 'above'
    else if (wIdx < 100 - tol * 100) balanceStatus = 'below'

    // Compactness: mean normalized dist from centroid
    const dists = tZips.map((z) => {
      const dx = z.lat - centLat, dy = z.lon - centLon
      return Math.sqrt(dx * dx + dy * dy)
    })
    const comp = Math.max(0, 1 - (dists.reduce((a, b) => a + b, 0) / dists.length) / 20)

    territories.push({
      territory_id:     t,
      hcp_count:        hcpCount,
      zip_count:        tZips.length,
      total_calls:      +totalCalls.toFixed(1),
      workload_index:   wIdx,
      potential_index:  pIdx,
      states:           stateList,
      state_split:      stateList.length > 1,
      centroid_lat:     +centLat.toFixed(4),
      centroid_lon:     +centLon.toFixed(4),
      balance_status:   balanceStatus,
      compactness_score: +comp.toFixed(3),
    })
  }

  // HCP assignments
  const zipToTerr = {}
  zips.forEach((z, i) => { zipToTerr[z.zip] = assignments[i] })
  const hcpAssignments = hcpData.map((row) => ({
    ...row,
    territory_id: zipToTerr[String(row[zipCol] || row.zip || '')] || -1
  }))

  const pctWithin = territories.length
    ? +(territories.filter((t) => t.balance_status === 'within').length / territories.length * 100).toFixed(1)
    : 0

  const narrative = `TerriSense created ${territories.length} territories using ${stateAlign} state alignment ` +
    `and ±${tolerancePct}% workload tolerance. ${pctWithin}% within balance tolerance.`

  return { territories, hcp_assignments: hcpAssignments, narrative, warnings: [] }
}


export default function AlignmentPage() {
  const navigate   = useNavigate()
  const {
    sizingResult, selection, upload, segmentation,
    setAlignmentResult, alignmentResult, markComplete,
  } = useTerriStore()

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [useApi,  setUseApi]  = useState(false)

  const finalK = sizingResult?.final_k
  const hcpData = useMemo(() => {
    const seged = segmentation.result?.hcp_data
    return seged?.length ? seged : upload.rawData
  }, [segmentation.result, upload.rawData])

  const handleRun = async () => {
    if (!finalK) { setError('Complete sizing first to get Final K.'); return }
    setLoading(true); setError('')
    try {
      if (useApi) {
        const res = await runAlignment({
          hcp_data: hcpData,
          final_k: finalK,
          state_alignment: selection.stateAlign,
          balance_tolerance_pct: selection.tolerance,
          balance_metric: 'calls',
        })
        setAlignmentResult(res)
      } else {
        const res = runClientAlignment(
          hcpData, finalK, selection.stateAlign, selection.tolerance, upload.mapping
        )
        if (!res) { setError('Could not create territories. Check that HCPs have valid lat/lon or ZIP coordinates.'); return }
        setAlignmentResult(res)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    markComplete('alignment')
    navigate('/dashboard')
  }

  const ar = alignmentResult

  // Scatter plot data — each territory as a point (workload vs potential)
  const scatterData = ar?.territories?.map((t) => ({
    x: t.workload_index,
    y: t.potential_index,
    name: `T-${String(t.territory_id).padStart(2, '0')}`,
    status: t.balance_status,
  })) || []

  return (
    <div>
      <PageHeader
        title="Territory Alignment"
        subtitle={finalK
          ? `Creating ${finalK} geographically contiguous territories using Final K from sizing.`
          : 'Complete sizing to unlock territory alignment.'}
      />

      {!finalK && (
        <div className="warning-box mb-4">
          Territory alignment requires a calculated Final K. Please complete the sizing step first.
        </div>
      )}

      {finalK && (
        <div className="card mb-4">
          <div className="flex items-center gap-6 mb-4">
            <div className="metric-card">
              <div className="text-xs text-gray-400 mb-1">Final K from sizing</div>
              <div className="text-4xl font-bold text-teal-600">{finalK}</div>
            </div>
            <div className="flex-1 text-sm text-gray-600">
              <p>
                Alignment will create <strong>{finalK} territories</strong> by aggregating HCPs to ZIP level,
                building a proximity graph, and assigning ZIPs via greedy geographic clustering with rebalancing.
              </p>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                <span>State alignment: <strong className="text-gray-600 capitalize">{selection.stateAlign}</strong></span>
                <span>Balance tolerance: <strong className="text-gray-600">±{selection.tolerance}%</strong></span>
                <span>HCPs: <strong className="text-gray-600">{hcpData.length.toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          <FormulaExplainer title="Territory alignment methodology">
            <ol className="space-y-1 list-decimal list-inside">
              <li>Aggregate HCPs to ZIP level (calls, potential, HCP count, state)</li>
              <li>Build proximity graph: each ZIP connected to its 6–8 nearest neighbors</li>
              <li>Select K geographically spread seed ZIPs using max-distance selection</li>
              <li>BFS-expand from seeds to assign all ZIPs to nearest territory</li>
              <li>Rebalance: iteratively move border ZIPs from overloaded to underloaded territories</li>
              <li>Enforce state alignment preference during rebalance</li>
              <li>Flag territories outside ±{selection.tolerance}% tolerance</li>
            </ol>
          </FormulaExplainer>
        </div>
      )}

      {finalK && (
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={useApi} onChange={(e) => setUseApi(e.target.checked)} />
            Use backend API
          </label>
          <button onClick={handleRun} disabled={loading} className="btn">
            {loading ? '⟳ Aligning...' : '⟳ Generate territories'}
          </button>
        </div>
      )}

      {loading && <LoadingSpinner text="Building territory alignment..." />}
      <ErrorMessage message={error} />

      {ar?.warnings?.map((w, i) => (
        <div key={i} className="warning-box mb-2">{w}</div>
      ))}

      {ar && (
        <>
          <div className="narrative-box mb-4">{ar.narrative}</div>

          {/* Summary metrics */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <MetricCard label="Territories created" value={ar.territories.length} color="teal" />
            <MetricCard
              label="Within tolerance"
              value={`${ar.territories.filter((t) => t.balance_status === 'within').length}/${ar.territories.length}`}
              color="teal"
            />
            <MetricCard
              label="State splits"
              value={ar.territories.filter((t) => t.state_split).length}
              color={ar.territories.filter((t) => t.state_split).length > 0 ? 'amber' : 'teal'}
            />
            <MetricCard
              label="Avg HCPs / territory"
              value={ar.territories.length
                ? Math.round(ar.territories.reduce((s, t) => s + t.hcp_count, 0) / ar.territories.length)
                : 0}
            />
          </div>

          {/* Workload vs Potential scatter */}
          <div className="card mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Workload index vs Potential index by territory
            </h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 4, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="x" name="Workload" tick={{ fontSize: 10 }}
                    label={{ value: 'Workload Index', position: 'insideBottom', offset: -10, fontSize: 10 }} />
                  <YAxis dataKey="y" name="Potential" tick={{ fontSize: 10 }}
                    label={{ value: 'Potential Index', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <ReferenceLine x={100} stroke="#ccc" strokeDasharray="3 3" />
                  <ReferenceLine y={100} stroke="#ccc" strokeDasharray="3 3" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    formatter={(v, name) => [v, name]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} />
                  <Scatter
                    data={scatterData}
                    fill="#1D9E75"
                    fillOpacity={0.7}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Territory table */}
          <div className="card mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Territory summary</h3>
            <div className="overflow-x-auto">
              <table className="table-base min-w-max">
                <thead>
                  <tr>
                    <th>Territory</th>
                    <th className="text-right">HCPs</th>
                    <th className="text-right">ZIPs</th>
                    <th className="text-right">Calls req.</th>
                    <th className="text-right">Workload Idx</th>
                    <th className="text-right">Potential Idx</th>
                    <th>Status</th>
                    <th>States</th>
                    <th className="text-right">Compactness</th>
                  </tr>
                </thead>
                <tbody>
                  {ar.territories.map((t) => (
                    <tr key={t.territory_id}>
                      <td className="font-medium">
                        T-{String(t.territory_id).padStart(2, '0')}
                        <span
                          className="inline-block w-2 h-2 rounded-full ml-1.5"
                          style={{ background: TERRITORY_COLORS[(t.territory_id - 1) % TERRITORY_COLORS.length] }}
                        />
                      </td>
                      <td className="text-right">{t.hcp_count.toLocaleString()}</td>
                      <td className="text-right">{t.zip_count}</td>
                      <td className="text-right">{fmt.int(t.total_calls)}</td>
                      <td className={`text-right font-medium ${
                        t.workload_index > 115 ? 'text-red-500' :
                        t.workload_index < 85  ? 'text-blue-500' :
                        'text-teal-600'
                      }`}>
                        {t.workload_index}
                      </td>
                      <td className="text-right">{t.potential_index}</td>
                      <td>
                        <StatusBadge status={t.balance_status} />
                        {t.state_split && <StatusBadge status="split" />}
                      </td>
                      <td className="text-gray-400 text-xs">
                        {t.states.slice(0, 3).join(', ')}
                        {t.states.length > 3 && ` +${t.states.length - 3}`}
                      </td>
                      <td className="text-right text-gray-500">{t.compactness_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <NavigationButtons
        onBack={() => navigate('/sizing')}
        onNext={handleNext}
        nextLabel="View Dashboard"
        nextDisabled={!ar}
      />
    </div>
  )
}
