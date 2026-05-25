import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTerriStore } from '../../store/useStore'
import { fmt } from '../../utils/helpers'

const STEPS = [
  { path: '/selection',    label: 'Selection',         icon: '⊙', key: 'selection' },
  { path: '/upload',       label: 'Data Upload',       icon: '⊕', key: 'upload' },
  { path: '/segmentation', label: 'Segmentation',      icon: '◈', key: 'segmentation' },
  { path: '/sizing',       label: 'SF Sizing',         icon: '◎', key: 'sizing' },
  { path: '/alignment',    label: 'Territory Alignment',icon: '⊞', key: 'alignment' },
  { path: '/dashboard',    label: 'Dashboard',         icon: '▦', key: 'dashboard' },
]

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { completedSteps, selection, sizingResult, segmentation } = useTerriStore()

  const currentIdx = STEPS.findIndex((s) => s.path === location.pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center"
                 style={{ background: '#1D9E75' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 11L5 7L8 10L12 4" stroke="white" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="2.5" r="1.5" fill="white"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">TerriSense</div>
              <div className="text-2xs text-gray-400 uppercase tracking-wide leading-none mt-0.5">
                Commercial Planning
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          <div className="text-2xs font-medium text-gray-400 uppercase tracking-widest px-2 mb-2">
            Workflow
          </div>
          {STEPS.map((step, idx) => {
            const isDone   = completedSteps.has(step.key)
            const isActive = location.pathname === step.path
            const isLocked = idx > 0 && !completedSteps.has(STEPS[idx - 1].key) && !isActive && !isDone

            return (
              <button
                key={step.path}
                onClick={() => !isLocked && navigate(step.path)}
                disabled={isLocked}
                className={[
                  'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm mb-0.5 transition-colors text-left',
                  isActive ? 'bg-teal-50 text-teal-700 font-medium' : '',
                  isDone && !isActive ? 'text-gray-500 hover:bg-gray-50' : '',
                  !isActive && !isDone && !isLocked ? 'text-gray-400 hover:bg-gray-50 hover:text-gray-600' : '',
                  isLocked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <span className={[
                  'w-5 h-5 rounded-full text-xs flex items-center justify-center flex-shrink-0 border',
                  isActive ? 'bg-teal-500 text-white border-teal-500' : '',
                  isDone && !isActive ? 'bg-teal-100 text-teal-600 border-teal-200' : '',
                  !isActive && !isDone ? 'bg-white text-gray-400 border-gray-200' : '',
                ].join(' ')}>
                  {isDone && !isActive ? '✓' : idx + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Context panel */}
        <div className="px-3 py-3 border-t border-gray-100 space-y-1">
          {selection.brand && (
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Brand</span>
              <span className="font-medium text-gray-700 truncate ml-2">{selection.brand}</span>
            </div>
          )}
          {sizingResult && (
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Final K</span>
              <span className="font-semibold text-teal-600">{sizingResult.final_k}</span>
            </div>
          )}
          {segmentation.result && (
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Total calls</span>
              <span className="font-medium text-gray-700">
                {fmt.k(segmentation.result.total_calls_required)}
              </span>
            </div>
          )}
          <div className="text-2xs text-gray-300 pt-1">TerriSense v1.0</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
