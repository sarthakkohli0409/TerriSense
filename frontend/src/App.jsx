import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/common/Layout'
import SelectionPage   from './pages/SelectionPage'
import UploadPage      from './pages/UploadPage'
import SegmentationPage from './pages/SegmentationPage'
import SizingPage      from './pages/SizingPage'
import AlignmentPage   from './pages/AlignmentPage'
import DashboardPage   from './pages/DashboardPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"             element={<Navigate to="/selection" replace />} />
        <Route path="/selection"    element={<SelectionPage />} />
        <Route path="/upload"       element={<UploadPage />} />
        <Route path="/segmentation" element={<SegmentationPage />} />
        <Route path="/sizing"       element={<SizingPage />} />
        <Route path="/alignment"    element={<AlignmentPage />} />
        <Route path="/dashboard"    element={<DashboardPage />} />
        <Route path="*"             element={<Navigate to="/selection" replace />} />
      </Routes>
    </Layout>
  )
}
