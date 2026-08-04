import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import SubscriptionGate from './pages/SubscriptionGate'

function Gate() {
  const { session, profile, loading, isSubscriptionActive, passwordRecovery } = useAuth()
  const [authView, setAuthView] = useState('login')
  const [adminView, setAdminView] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg text-fg-subtle text-sm">
        جاري التحميل...
      </div>
    )
  }

  // رابط استرجاع كلمة المرور بيوصل هنا مهما كانت حالة الدخول الحالية
  if (passwordRecovery) return <ResetPassword />

  if (!session) {
    return authView === 'login'
      ? <Login onSwitchToSignup={() => setAuthView('signup')} />
      : <Signup onSwitchToLogin={() => setAuthView('login')} />
  }

  // الأدمن يقدر يدير الاشتراكات حتى لو انتهت تجربته هو الشخصية
  if (profile?.is_admin && adminView) {
    return <AdminDashboard onBack={() => setAdminView(false)} />
  }

  if (!isSubscriptionActive && !profile?.is_admin) return <SubscriptionGate />

  return (
    <SettingsProvider>
      <Dashboard onOpenAdmin={() => setAdminView(true)} />
    </SettingsProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
