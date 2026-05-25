import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE,
  timeout: 60_000,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err.response?.data?.detail || err.message || 'Unknown error'
    return Promise.reject(new Error(detail))
  }
)

// ── Upload ───────────────────────────────────────────────────────────────────
export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

// ── Segment ───────────────────────────────────────────────────────────────────
export async function runSegmentation(payload) {
  const { data } = await api.post('/segment', payload)
  return data
}

// ── Size ──────────────────────────────────────────────────────────────────────
export async function runSizing(payload) {
  const { data } = await api.post('/size', payload)
  return data
}

// ── Align ─────────────────────────────────────────────────────────────────────
export async function runAlignment(payload) {
  const { data } = await api.post('/align', payload)
  return data
}

// ── Diagnose ──────────────────────────────────────────────────────────────────
export async function runDiagnosis(payload) {
  const { data } = await api.post('/diagnose', payload)
  return data
}

// ── Export ────────────────────────────────────────────────────────────────────
export async function exportExcel(payload) {
  const res = await api.post('/export', payload, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `terrisense_export_${Date.now()}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export default api
