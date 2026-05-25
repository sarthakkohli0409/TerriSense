import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { useTerriStore } from '../store/useStore'
import {
  PageHeader, LoadingSpinner, ErrorMessage, NavigationButtons, FormulaExplainer
} from '../components/common'
import { uploadFile } from '../utils/api'

const CANONICAL_FIELDS = [
  { key: 'hcp_id',           label: 'HCP / Account ID', required: true },
  { key: 'zip',              label: 'ZIP Code',          required: true },
  { key: 'state',            label: 'State',             required: true },
  { key: 'lat',              label: 'Latitude',          required: false },
  { key: 'lon',              label: 'Longitude',         required: false },
  { key: 'specialty',        label: 'Specialty',         required: false },
  { key: 'trx',              label: 'TRx volume',        required: false },
  { key: 'nrx',              label: 'NRx (new scripts)', required: false },
  { key: 'patient_potential',label: 'Patient potential', required: false },
  { key: 'call_history',     label: 'Call history',      required: false },
  { key: 'sales',            label: 'Sales ($)',         required: false },
  { key: 'market_potential', label: 'Market potential',  required: false },
  { key: 'priority_flag',    label: 'Priority flag',     required: false },
]

// Simple browser-side auto-detect (mirrors backend logic for instant feedback)
function autoDetect(columns) {
  const lc = columns.map((c) => c.toLowerCase().replace(/\s+/g, '_'))
  const HINTS = {
    hcp_id:            ['hcp_id','hcpid','provider_id','npi','account_id','id'],
    zip:               ['zip','zip_code','zipcode','postal_code','zip5'],
    state:             ['state','state_code','st','state_abbr'],
    lat:               ['lat','latitude','lat_dd','y'],
    lon:               ['lon','lng','longitude','lon_dd','x'],
    specialty:         ['specialty','speciality','hcp_specialty','spec'],
    trx:               ['trx','total_rx','total_scripts','rx'],
    nrx:               ['nrx','new_rx','new_scripts'],
    patient_potential: ['patient_potential','pat_potential','patient_pot','potential'],
    call_history:      ['call_history','calls','call_count','historical_calls'],
    sales:             ['sales','revenue','net_sales'],
    market_potential:  ['market_potential','mkt_potential','mkt_pot'],
    priority_flag:     ['priority_flag','priority','flag','tier_flag'],
  }
  const mapping = {}
  for (const [canonical, candidates] of Object.entries(HINTS)) {
    for (const cand of candidates) {
      const idx = lc.indexOf(cand)
      if (idx !== -1) { mapping[canonical] = columns[idx]; break }
    }
  }
  return mapping
}

export default function UploadPage() {
  const navigate = useNavigate()
  const { upload, setUpload, markComplete } = useTerriStore()

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [useBackend, setUseBackend] = useState(false)

  const onDrop = useCallback(async (accepted) => {
    const file = accepted[0]
    if (!file) return
    setError('')
    setLoading(true)

    try {
      if (useBackend) {
        // Backend upload
        const res = await uploadFile(file)
        setUpload({
          rawData: res.preview,
          columns: res.columns,
          mapping: res.detected_mapping,
          warnings: res.warnings,
          fileName: file.name,
          rowCount: res.rows,
        })
      } else {
        // Browser-side CSV parse (for demo / offline mode)
        const text = await file.text()
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            const rows = result.data
            const cols = result.meta.fields || []
            const mapping = autoDetect(cols)
            const warnings = []
            if (!mapping.lat || !mapping.lon) {
              warnings.push('Latitude/longitude not detected — ZIP centroids will be used for alignment.')
            }
            if (!mapping.hcp_id) warnings.push('HCP ID column not detected.')
            setUpload({
              rawData: rows,
              columns: cols,
              mapping,
              warnings,
              fileName: file.name,
              rowCount: rows.length,
            })
            setLoading(false)
          },
          error: (err) => { setError(err.message); setLoading(false) }
        })
        return
      }
    } catch (e) {
      setError(e.message)
    } finally {
      if (useBackend) setLoading(false)
    }
  }, [useBackend, setUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  })

  const handleMappingChange = (canonical, value) => {
    setUpload({ mapping: { ...upload.mapping, [canonical]: value } })
  }

  const handleNext = () => {
    markComplete('upload')
    navigate('/segmentation')
  }

  const hasData = upload.rawData.length > 0

  return (
    <div>
      <PageHeader
        title="Data Upload & Column Mapping"
        subtitle="Upload HCP or account-level data. TerriSense auto-detects columns — override as needed."
      />

      {/* Upload zone */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Upload HCP data</h3>

        <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={useBackend} onChange={(e) => setUseBackend(e.target.checked)} />
            Use backend API (requires server running)
          </label>
          <span className="text-gray-300">|</span>
          <span>Browser-mode parses CSV client-side</span>
        </div>

        <div
          {...getRootProps()}
          className={[
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-teal-400 bg-teal-50'
              : 'border-gray-200 bg-gray-50 hover:border-teal-300 hover:bg-teal-50/50',
          ].join(' ')}
        >
          <input {...getInputProps()} />
          <div className="text-3xl mb-2">📂</div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            {isDragActive ? 'Drop file here' : 'Click to upload or drag & drop'}
          </div>
          <div className="text-xs text-gray-400">CSV or Excel · HCP ID, ZIP, State, Lat/Lon, metrics</div>
        </div>

        {loading && <LoadingSpinner text="Parsing file..." />}
        <ErrorMessage message={error} />

        {upload.warnings.map((w, i) => (
          <div key={i} className="warning-box mt-2">{w}</div>
        ))}

        {hasData && (
          <div className="mt-3 flex items-center gap-3">
            <span className="badge badge-green">✓ {upload.rowCount.toLocaleString()} rows loaded</span>
            <span className="text-xs text-gray-400">{upload.fileName}</span>
          </div>
        )}
      </div>

      {/* Preview */}
      {hasData && (
        <div className="card mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Data preview (first 10 rows)</h3>
          <div className="overflow-x-auto">
            <table className="table-base min-w-max">
              <thead>
                <tr>
                  {upload.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upload.rawData.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {upload.columns.map((c) => (
                      <td key={c} className="whitespace-nowrap text-gray-600">
                        {String(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column mapping */}
      {hasData && (
        <div className="card mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Column mapping</h3>
          <p className="text-xs text-gray-400 mb-4">
            Auto-detected assignments shown. Override by selecting a different column.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {CANONICAL_FIELDS.map(({ key, label, required }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-40 text-xs text-gray-600 shrink-0">
                  {label}
                  {required && <span className="text-red-400 ml-0.5">*</span>}
                </div>
                <span className="text-gray-300 text-xs">→</span>
                <select
                  className="form-select text-xs py-1 flex-1"
                  value={upload.mapping[key] || ''}
                  onChange={(e) => handleMappingChange(key, e.target.value)}
                >
                  <option value="">— not mapped —</option>
                  {upload.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {upload.mapping[key] ? (
                  <span className="text-2xs text-teal-500 shrink-0">✓</span>
                ) : (
                  <span className="text-2xs text-gray-300 shrink-0">{required ? '✗' : '–'}</span>
                )}
              </div>
            ))}
          </div>

          <FormulaExplainer title="Required columns explained">
            <p><strong>HCP ID</strong> — unique identifier per physician or account.</p>
            <p><strong>ZIP Code</strong> — used for geographic aggregation and territory alignment.</p>
            <p><strong>State</strong> — used for state alignment preference enforcement.</p>
            <p><strong>Lat/Lon</strong> — used for proximity graph construction. If missing, ZIP centroid lookup is used.</p>
            <p><strong>Metric columns</strong> (TRx, NRx, Patient Potential, Call History) — used in composite scoring for auto-segmentation.</p>
          </FormulaExplainer>
        </div>
      )}

      <NavigationButtons
        onBack={() => navigate('/selection')}
        onNext={handleNext}
        nextLabel="Continue to Segmentation"
        nextDisabled={!hasData}
      />
    </div>
  )
}
