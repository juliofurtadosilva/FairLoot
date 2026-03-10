import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Guild from './pages/Guild'
import Home from './pages/Home'
import Control from './pages/Control'
import Dashboard from './pages/Dashboard'
import Loot from './pages/Loot'
import Members from './pages/Members'
import Wishlist from './pages/Wishlist'
import LootHistory from './pages/LootHistory'
import AdminPanel from './pages/AdminPanel'
import BnetCallback from './pages/BnetCallback'
import ProtectedRoute from './components/ProtectedRoute'
import { AppProvider } from './context/AppContext'
import './index.scss'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/bnet-callback" element={<BnetCallback />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/control" element={<Control />}>
            <Route index element={<Dashboard />} />
            <Route path="loot" element={<Loot />} />
            <Route path="members" element={<Members />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="history" element={<LootHistory />} />
            <Route path="admin" element={<AdminPanel />} />
          </Route>
          <Route path="/guild" element={<Guild />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppProvider>
    <App />
  </AppProvider>
)
