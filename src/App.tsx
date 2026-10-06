import { useEffect, useState } from 'react'
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
import { supabase } from './lib/supabase'

const queryClient = new QueryClient()

export function App() {
  const { loading, user } = useAuth()
  const [profileReady, setProfileReady] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    let timer: number | undefined

    async function checkProfile() {
      if (!user) {
        if (active) setProfileReady(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return
      const ready = !error && Boolean(data)
      setProfileReady(ready)

      if (!ready) {
        timer = window.setTimeout(() => void checkProfile(), 1500)
      }
    }

    setProfileReady(user ? null : false)
    void checkProfile()

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [user])

  if (loading || (user && profileReady === null)) {
    return <div className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] text-sm font-semibold text-[var(--nexus-muted)]">Cargando Nexus...</div>
  }

  const needsProfile = Boolean(user && !profileReady)

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={!user ? <HomePage /> : needsProfile ? <ProfilePage /> : <FeedPage />} />
          <Route path="discover" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <DiscoverPage />} />
          <Route path="messages" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <PlaceholderPage title="Mensajes" description="Las conversaciones de Nexus llegarán en la Fase 5." />} />
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
