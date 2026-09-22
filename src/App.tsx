import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AuthPage } from './features/auth/AuthPage'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/useAuth'
import { ProfilePage } from './features/profile/ProfilePage'
import { FeedPage } from './features/feed/FeedPage'
import { DiscoverPage } from './features/discover/DiscoverPage'

const queryClient = new QueryClient()

export function App() {
  const { loading, user } = useAuth()

  if (loading) return <div className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] text-sm font-semibold text-[var(--nexus-muted)]">Cargando Nexus...</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={user ? <FeedPage /> : <HomePage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="messages" element={<PlaceholderPage title="Mensajes" description="Las conversaciones de Nexus llegarán en la Fase 5." />} />
          <Route path="profile" element={user ? <ProfilePage /> : <AuthPage />} />
          <Route path="*" element={<PlaceholderPage title="Página no encontrada" description="Esta ruta no existe en Nexus." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export function NexusApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  )
}