import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './components/auth/LoginPage'
import VaultDashboard from './pages/VaultDashboard'
import { isAuthenticated } from './services/api'

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  return children
}

function PublicRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/vault" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/vault"
          element={
            <ProtectedRoute>
              <VaultDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
