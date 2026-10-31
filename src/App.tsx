import { lazy, Suspense, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/useAuth'
import { supabase } from './lib/supabase'

const AuthPage = lazy(() => import('./features/auth/AuthPage').then((module) => ({ default: module.AuthPage })))
const AccountApprovalPage = lazy(() => import('./features/auth/AccountApprovalPage').then((module) => ({ default: module.AccountApprovalPage })))
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })))
const SignupApplicationPage = lazy(() => import('./features/auth/SignupApplicationPage').then((module) => ({ default: module.SignupApplicationPage })))
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const FeedPage = lazy(() => import('./features/feed/FeedPage').then((module) => ({ default: module.FeedPage })))
const DiscoverPage = lazy(() => import('./features/discover/DiscoverPage').then((module) => ({ default: module.DiscoverPage })))
const MessagesPage = lazy(() => import('./features/messages/MessagesPage').then((module) => ({ default: module.MessagesPage })))
const PublicProfilePage = lazy(() => import('./features/profile/PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })))
const AdminConsolePage = lazy(() => import('./features/admin/AdminConsolePage').then((module) => ({ default: module.AdminConsolePage })))
const RequestsPage = lazy(() => import('./features/admin/RequestsPage').then((module) => ({ default: module.RequestsPage })))
const GroupsPage = lazy(() => import('./features/groups/GroupsPage').then((module) => ({ default: module.GroupsPage })))
const GroupDetailPage = lazy(() => import('./features/groups/GroupDetailPage').then((module) => ({ default: module.GroupDetailPage })))

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

      const [{ data: approvalData, error: approvalError }, { data: applicationReady, error: applicationError }] = await Promise.all([
        supabase
          .from('account_approvals')
          .select('status')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.rpc('is_profile_application_complete', { target_user: user.id }),
      ])

      if (!active) return

      const nextApproval = (!approvalError && approvalData?.status
        ? approvalData.status
        : 'pending') as ApprovalStatus
      const nextProfileReady = !applicationError && Boolean(applicationReady)

      setApprovalStatus(nextApproval)
      setProfileReady(nextProfileReady)

      if (nextApproval === 'pending' || !nextProfileReady) {
        timer = window.setTimeout(() => void checkAccess(), 2000)
      }
    }

    setApprovalStatus(null)
    setProfileReady(user ? null : false)
    void checkAccess()

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [user])

  const pageMode = new URLSearchParams(window.location.search).get('mode')
  const recoveryMode = pageMode === 'recovery'
  const signupApplicationMode = pageMode === 'application'

  if (recoveryMode) {
    return <ResetPasswordPage />
  }

  if (signupApplicationMode) {
    return <SignupApplicationPage />
  }

  if (loading || (user && (approvalStatus === null || profileReady === null))) {
    return <div className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] text-sm font-semibold text-[var(--nexus-muted)]">Cargando Nexus...</div>
  }

  if (user && approvalStatus === 'rejected') {
    return <AccountApprovalPage status="rejected" />
  }

  if (user && approvalStatus === 'pending' && !profileReady) {
    return <ProfilePage applicationMode />
  }

  if (user && approvalStatus === 'pending' && profileReady) {
    return <AccountApprovalPage status="pending" />
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
          <Route path="requests" element={!user ? <AuthPage /> : needsProfile ? <ProfilePage /> : <RequestsPage />} />
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
        <Suspense fallback={<LoadingScreen />}>
          <App />
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  )
}


function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] text-sm font-semibold text-[var(--nexus-muted)]">
      Cargando Nexus...
    </div>
  )
}
