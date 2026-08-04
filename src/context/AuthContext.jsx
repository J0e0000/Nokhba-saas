import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000 // 30 دقيقة

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ownerProfile, setOwnerProfile] = useState(null) // لو الحساب الحالي مساعد، ده بروفايل صاحب البيانات
  const [unlockedFeatures, setUnlockedFeatures] = useState(new Set())
  const [loading, setLoading] = useState(true)

  // تسجيل خروج تلقائي بعد فترة عدم نشاط طويلة، لحماية الحساب لو الجهاز اتسيب مفتوح
  useEffect(() => {
    if (!session) return
    let timer
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => supabase.auth.signOut(), INACTIVITY_LIMIT_MS)
    }
    const events = ['mousemove', 'keydown', 'touchstart', 'click']
    events.forEach((e) => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, resetTimer)) }
  }, [session])
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  const loadAll = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) {
      console.error('Failed to load profile:', error.message)
      setProfile(null)
      setOwnerProfile(null)
      return
    }
    setProfile(data)

    // هل الحساب ده مساعد مربوط بمساحة عمل حد تاني؟
    const { data: ownerId } = await supabase.rpc('my_workspace_owner')
    let effectiveId = userId
    if (ownerId) {
      const { data: owner } = await supabase.from('profiles').select('*').eq('id', ownerId).single()
      setOwnerProfile(owner ?? null)
      effectiveId = ownerId
    } else {
      setOwnerProfile(null)
    }

    const { data: unlocks } = await supabase.from('feature_unlocks').select('feature_key, unlocked').eq('teacher_id', effectiveId)
    setUnlockedFeatures(new Set((unlocks ?? []).filter((u) => u.unlocked).map((u) => u.feature_key)))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) loadAll(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (session?.user) {
        loadAll(session.user.id)
      } else {
        setProfile(null)
        setOwnerProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signUp = async ({ email, password, fullName, phone }) => {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone: phone } },
    })
  }

  const signIn = async ({ email, password }) => {
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signOut = async () => {
    return supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    if (session?.user) await loadAll(session.user.id)
  }

  const setNewPassword = async (password) => {
    const res = await supabase.auth.updateUser({ password })
    if (!res.error) setPasswordRecovery(false)
    return res
  }

  // لو الحساب ده مساعد عند حد، الاشتراك بتاعه بيتحدد باشتراك صاحب البيانات مش اشتراكه هو،
  // وكل الكتابة/القراءة في البيانات بتتم باسم صاحب البيانات (effectiveTeacherId)
  const isAssistant = Boolean(ownerProfile)
  const effectiveTeacherId = ownerProfile?.id || profile?.id || null
  const subscriptionSourceProfile = ownerProfile || profile

  const isSubscriptionActive = Boolean(
    subscriptionSourceProfile &&
    subscriptionSourceProfile.is_verified && // الحساب لازم يكون متفعل من الأدمن
    ['trial', 'active'].includes(subscriptionSourceProfile.subscription_status) &&
    new Date(subscriptionSourceProfile.subscription_expires_at) > new Date()
  )

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    ownerProfile,
    isAssistant,
    effectiveTeacherId,
    loading,
    isSubscriptionActive,
    unlockedFeatures,
    passwordRecovery,
    setNewPassword,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
