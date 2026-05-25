import { create } from 'zustand'

const DEFAULT_OBJECTIVE_WEIGHTS = {
  balanced:      { capacity: 40, potential: 40, roi: 20 },
  maxCoverage:   { capacity: 55, potential: 30, roi: 15 },
  maxGrowth:     { capacity: 15, potential: 50, roi: 35 },
  maxEfficiency: { capacity: 20, potential: 35, roi: 45 },
}

export const useTerriStore = create((set, get) => ({

  // ── Completed steps ──────────────────────────────────────────────────────
  completedSteps: new Set(),
  markComplete: (step) =>
    set((s) => ({ completedSteps: new Set([...s.completedSteps, step]) })),

  // ── Selection ────────────────────────────────────────────────────────────
  selection: {
    brand: '',
    therapy: '',
    geo: 'US',
    launchType: 'specialty',
    objective: 'balanced',
    stateAlign: 'soft',
    tolerance: 15,
  },
  setSelection: (updates) =>
    set((s) => {
      const next = { ...s.selection, ...updates }
      // Auto-update method weights when objective changes
      if (updates.objective && updates.objective !== s.selection.objective) {
        const w = DEFAULT_OBJECTIVE_WEIGHTS[updates.objective] || DEFAULT_OBJECTIVE_WEIGHTS.balanced
        return { selection: next, methodWeights: { ...w, locked: null } }
      }
      return { selection: next }
    }),

  // ── Upload ───────────────────────────────────────────────────────────────
  upload: {
    rawData: [],
    columns: [],
    mapping: {},
    warnings: [],
    fileName: '',
    rowCount: 0,
  },
  setUpload: (updates) => set((s) => ({ upload: { ...s.upload, ...updates } })),

  // ── Segmentation ─────────────────────────────────────────────────────────
  segmentation: {
    mode: 'auto',
    uploadedSegCol: null,
    metricWeights: [
      { column: 'trx',              weight: 40 },
      { column: 'patient_potential',weight: 35 },
      { column: 'nrx',              weight: 15 },
      { column: 'call_history',     weight: 10 },
    ],
    segmentDefs: [
      { name: 'Very High', reach_pct: 90, frequency: 12, target: true,  priority_multiplier: 1.0 },
      { name: 'High',      reach_pct: 80, frequency:  8, target: true,  priority_multiplier: 1.0 },
      { name: 'Medium',    reach_pct: 60, frequency:  4, target: true,  priority_multiplier: 1.0 },
      { name: 'Low',       reach_pct: 30, frequency:  2, target: false, priority_multiplier: 1.0 },
      { name: 'Very Low',  reach_pct:  0, frequency:  0, target: false, priority_multiplier: 1.0 },
    ],
    result: null,
  },
  setSegmentation: (updates) =>
    set((s) => ({ segmentation: { ...s.segmentation, ...updates } })),
  setSegDef: (idx, field, value) =>
    set((s) => {
      const defs = [...s.segmentation.segmentDefs]
      defs[idx] = { ...defs[idx], [field]: value }
      return { segmentation: { ...s.segmentation, segmentDefs: defs } }
    }),
  setMetricWeight: (idx, field, value) =>
    set((s) => {
      const weights = [...s.segmentation.metricWeights]
      weights[idx] = { ...weights[idx], [field]: value }
      return { segmentation: { ...s.segmentation, metricWeights: weights } }
    }),

  // ── Sizing ───────────────────────────────────────────────────────────────
  sizingInputs: {
    // Capacity
    callsPerDay:       8,
    workingDays:       220,
    nonSellingPct:     25,
    accessFactor:      1.0,
    // Potential
    coveredPotential:  50_000_000,
    desiredPerRep:     1_400_000,
    // ROI
    revenue:           80_000_000,
    revenuePerRep:     2_200_000,
    dimReturn:         0.85,
    costPerRep:        200_000,
    minROI:            2.5,
    // Budget
    totalBudget:       10_000_000,
    loadedCostPerRep:  250_000,
  },
  setSizingInput: (field, value) =>
    set((s) => ({ sizingInputs: { ...s.sizingInputs, [field]: value } })),

  methodWeights: { capacity: 40, potential: 40, roi: 20, locked: null },
  setMethodWeights: (updates) =>
    set((s) => ({ methodWeights: { ...s.methodWeights, ...updates } })),

  sizingResult: null,
  setSizingResult: (r) => set({ sizingResult: r }),

  // ── Alignment ────────────────────────────────────────────────────────────
  alignmentResult: null,
  setAlignmentResult: (r) => set({ alignmentResult: r }),

  // ── Diagnosis ────────────────────────────────────────────────────────────
  diagnosisResult: null,
  setDiagnosisResult: (r) => set({ diagnosisResult: r }),

  // ── Helpers ──────────────────────────────────────────────────────────────
  getDefaultWeights: () => {
    const obj = get().selection.objective
    return DEFAULT_OBJECTIVE_WEIGHTS[obj] || DEFAULT_OBJECTIVE_WEIGHTS.balanced
  },

  getFinalK: () => get().sizingResult?.final_k ?? null,

  getMappedData: () => {
    // Returns upload.rawData with canonical column names
    const { rawData, mapping } = get().upload
    if (!rawData.length) return []
    return rawData.map((row) => {
      const out = { ...row }
      Object.entries(mapping).forEach(([canonical, original]) => {
        if (original && original !== canonical && original in row) {
          out[canonical] = row[original]
        }
      })
      return out
    })
  },
}))
