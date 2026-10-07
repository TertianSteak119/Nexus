import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AuthPage } from './features/auth/AuthPage'
import { AccountApprovalPage } from './features/auth/AccountApprovalPage'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/useAuth'
import { ProfilePage } from './features/profile/ProfilePage'
import { FeedPage } from './features/feed/FeedPage'
import { DiscoverPage } from './features/discover/DiscoverPage'
import { MessagesPage } from './features/messages/MessagesPage'
import { PublicProfilePage } from './features/profile/PublicProfilePage'
import { AdminConsolePage } from './features/admin/AdminConsolePage'
import { GroupsPage } from './features/groups/GroupsPage'
import { GroupDetailPage } from './features/groups/GroupDetailPage'
import { supabase } from './lib/supabase'

const queryClient = new QueryClient()

type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export function App() {
  const { loading, user } = useAuth()
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null)
  const [profileReady, setProfileReady] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    let timer: number | undefined

    async function checkAccess() {
      if (!user) {
        if (active) {
          setApprovalStatus(null)
          setProfileReady(false)
        }
        return
      }

      const { data: approvalData, error: approvalError } = await supabase
        .from('account_approvals')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!active) return

      const nextApproval = (!approvalError && approvalData?.status
        ? approvalData.status
        : 'pending') as ApprovalStatus

      setApprovalStatus(nextApproval)

      if (nextApproval !== 'approved') {
        setProfileReady(false)
        return
      }

      const [{ data, error }, { data: verificationData, error: verificationError }] = await Promise.all([
        supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
        supabase.from('grade_verifications').select('id').eq('profile_id', user.id).limit(1),
      ])

      if (!active) return
      const ready = !error && !verificationError && Boolean(data) && Boolean(verificationData?.length)
      setProfileReady(ready)

      if (!ready) {
        timer = window.setTimeout(() => void checkAccess(), 1500)
      }
    }

    setApprovalStatus(user ? null : null)
    setProfileReady(user ? null : false)
    void checkAccess()

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [user])

  if (loading || (user && (approvalStatus === null || (approvalStatus === 'approved' && profileReady === null)))) {
    return <div className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] text-sm font-semibold text-[var(--nexus-muted)]">Cargando Nexus...</div>
  }

  if (user && approvalStatus && approvalStatus !== 'approved') {
    return <AccountApprovalPage status={approvalStatus} />
  }

  const needsProfile = Boolean(user && approvalStatus === 'approved' && !profileReady)

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={!user ? <HomePage /> : needsProfile ? <ProfilePage /> : <FeedPage />} />
          <Route path="discover" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <DiscoverPage />} />
          <Route path="messages" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <MessagesPage />} />
          <Route path="groups" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <GroupsPage />} />
          <Route path="groups/:id" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <GroupDetailPage />} />
          <Route path="profile" element={user ? <ProfilePage /> : <AuthPage />} />
          <Route path="profile/:id" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <PublicProfilePage />} />
          <Route path="control" element={!user ? <AuthPage /> : <AdminConsolePage />} />
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
