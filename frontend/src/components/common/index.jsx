import React, { useState } from 'react'
import { clsx } from 'clsx'

// ── PageHeader ────────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  )
}

// ── FormulaExplainer ──────────────────────────────────────────────────────────
export function FormulaExplainer({ title = 'Assumptions & Methodology', children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span className="text-2xs">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && (
        <div className="mt-2 formula-box text-xs leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

// ── MetricCard ────────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, color = 'gray', size = 'md' }) {
  const colorClass = {
    gray:  'text-gray-900',
    teal:  'text-teal-600',
    amber: 'text-amber-600',
    blue:  'text-blue-600',
    red:   'text-red-600',
  }[color] || 'text-gray-900'

  const sizeClass = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl'

  return (
    <div className="metric-card">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={clsx('font-semibold leading-none', colorClass, sizeClass)}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    within:      { cls: 'badge-green',  label: 'Within tolerance' },
    above:       { cls: 'badge-amber',  label: 'Above range' },
    below:       { cls: 'badge-blue',   label: 'Below range' },
    split:       { cls: 'badge-red',    label: 'State split' },
    capped:      { cls: 'badge-amber',  label: 'Budget capped' },
    warning:     { cls: 'badge-amber',  label: 'Warning' },
    contiguous:  { cls: 'badge-green',  label: 'Contiguous' },
  }
  const { cls, label } = map[status] || { cls: 'badge-gray', label: status }
  return <span className={`badge ${cls}`}>{label}</span>
}

// ── LoadingSpinner ────────────────────────────────────────────────────────────
export function LoadingSpinner({ text = 'Processing...' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
      <svg className="animate-spin w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      {text}
    </div>
  )
}

// ── ErrorMessage ──────────────────────────────────────────────────────────────
export function ErrorMessage({ message }) {
  if (!message) return null
  return (
    <div className="error-box flex items-start gap-2 my-3">
      <span className="text-red-500 text-sm mt-0.5">⚠</span>
      <span>{message}</span>
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, color = 'teal' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const bgClass = { teal: 'bg-teal-400', amber: 'bg-amber-400', red: 'bg-red-400', blue: 'bg-blue-400' }[color] || 'bg-teal-400'
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${bgClass}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── WeightSlider ──────────────────────────────────────────────────────────────
export function WeightSlider({ label, value, onChange, color = '#1D9E75' }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-36 text-xs text-gray-600 shrink-0">{label}</div>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold w-9 text-right" style={{ color }}>{value}%</span>
      <input
        type="range" min="0" max="100" step="5" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 accent-teal-500"
      />
    </div>
  )
}

// ── SectionTitle ──────────────────────────────────────────────────────────────
export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-gray-700">{children}</h3>
      {action && <div className="text-xs text-gray-400">{action}</div>}
    </div>
  )
}

// ── Tag buttons ───────────────────────────────────────────────────────────────
export function TagButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`tag-btn ${selected ? 'tag-btn-active' : ''}`}
    >
      {label}
    </button>
  )
}

// ── NavigationButtons ─────────────────────────────────────────────────────────
export function NavigationButtons({ onBack, onNext, nextLabel = 'Continue', nextDisabled = false, loading = false }) {
  return (
    <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-100">
      {onBack ? (
        <button onClick={onBack} className="btn">← Back</button>
      ) : <div />}
      <button
        onClick={onNext}
        disabled={nextDisabled || loading}
        className={`btn-primary ${nextDisabled || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {loading ? 'Processing...' : `${nextLabel} →`}
      </button>
    </div>
  )
}
