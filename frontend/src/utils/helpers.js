// Number formatting
export const fmt = {
  int:   (n) => Math.round(n).toLocaleString(),
  dec1:  (n) => (+n).toFixed(1),
  pct:   (n) => `${(+n).toFixed(1)}%`,
  money: (n) => `$${Math.round(n).toLocaleString()}`,
  k:     (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)),
}

// Clamp a value
export const clamp = (val, min, max) => Math.min(Math.max(val, min), max)

// Normalize array 0-1
export const normalize = (arr) => {
  const mn = Math.min(...arr)
  const mx = Math.max(...arr)
  if (mx === mn) return arr.map(() => 0.5)
  return arr.map((v) => (v - mn) / (mx - mn))
}

// Compute percentile rank
export const percentileRank = (arr, val) => {
  const below = arr.filter((v) => v < val).length
  return below / arr.length
}

// Assign segment from score percentile
export const scoreToSegment = (pct) => {
  if (pct >= 0.85) return 'Very High'
  if (pct >= 0.65) return 'High'
  if (pct >= 0.35) return 'Medium'
  if (pct >= 0.15) return 'Low'
  return 'Very Low'
}

// Compute composite score from row
export const compositeScore = (row, weights) => {
  // weights: [{column, weight}]
  // Caller must normalize first
  return weights.reduce((sum, { column, weight, maxVal, minVal }) => {
    const v = parseFloat(row[column]) || 0
    const norm = maxVal !== minVal ? (v - minVal) / (maxVal - minVal) : 0.5
    return sum + norm * (weight / 100)
  }, 0)
}

// Parse CSV text → array of objects (browser-side, no backend needed for preview)
export const parseCSVPreview = (text, maxRows = 10) => {
  const lines = text.split('\n').filter(Boolean)
  if (!lines.length) return { columns: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1, maxRows + 1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
  return { columns: headers, rows }
}

// Status badge class
export const statusClass = (status) => ({
  within: 'badge-green',
  above:  'badge-amber',
  below:  'badge-blue',
  split:  'badge-red',
})[status] ?? 'badge-gray'

export const statusLabel = (status) => ({
  within: 'Within tolerance',
  above:  'Above range',
  below:  'Below range',
  split:  'State split',
})[status] ?? status

// Default objective weights
export const OBJECTIVE_WEIGHTS = {
  balanced:      { capacity: 40, potential: 40, roi: 20 },
  maxCoverage:   { capacity: 55, potential: 30, roi: 15 },
  maxGrowth:     { capacity: 15, potential: 50, roi: 35 },
  maxEfficiency: { capacity: 20, potential: 35, roi: 45 },
}

// Territory color palette
export const TERRITORY_COLORS = [
  '#1D9E75','#185FA5','#854F0B','#A32D2D','#533AB7',
  '#0F6E56','#B85A30','#3B6D11','#993556','#5F5E5A',
  '#5DCAA5','#378ADD','#EF9F27','#E24B4A','#7F77DD',
  '#9FE1CB','#F0997B','#97C459','#ED93B1','#B4B2A9',
]
