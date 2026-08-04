import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { SkeletonList } from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'

const STATUS_LABEL = { trial: 'تجربة مجانية', active: 'مشترك فعّال', expired: 'منتهي', cancelled: 'ملغي' }
const ACTION_LABEL = { extend: 'تفعيل/تمديد', cancel: 'إلغاء اشتراك' }

export default function AdminDashboard({ onBack }) {
  const { user, signOut } = useAuth()
  const { showToast } = useToast()
  const [cancelTarget, setCancelTarget] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [statsByTeacher, setStatsByTeacher] = useState({})
  const [gamesUnlockByTeacher, setGamesUnlockByTeacher] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [extendDays, setExtendDays] = useState(30)
  const [tab, setTab] = useState('teachers') // teachers | log | broadcast
  const [activityLog, setActivityLog] = useState([])
  const [broadcasts, setBroadcasts] = useState([])
  const [broadcastText, setBroadcastText] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data, error }, { data: stats }, { data: unlocks }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_teacher_stats'),
      supabase.from('feature_unlocks').select('teacher_id, unlocked').eq('feature_key', 'games'),
    ])
    if (!error) setTeachers(data ?? [])
    const map = {}
    ;(stats ?? []).forEach((r) => { map[r.teacher_id] = r })
    setStatsByTeacher(map)
    const gmap = {}
    ;(unlocks ?? []).forEach((r) => { gmap[r.teacher_id] = r.unlocked })
    setGamesUnlockByTeacher(gmap)
    setLoading(false)
  }

  const toggleGames = async (teacherId) => {
    try {
      const current = gamesUnlockByTeacher[teacherId] || false
      const { error } = await supabase.from('feature_unlocks').upsert(
        { teacher_id: teacherId, feature_key: 'games', unlocked: !current, unlocked_at: !current ? new Date().toISOString() : null },
        { onConflict: 'teacher_id,feature_key' }
      )
      if (error) throw error
      setGamesUnlockByTeacher((prev) => ({ ...prev, [teacherId]: !current }))
      showToast(!current ? 'تم تفعيل الألعاب' : 'تم تعطيل الألعاب', 'success')
    } catch (err) {
      console.error('[v0] toggleGames error:', err)
      showToast('حصل خطأ في تعديل الألعاب', 'error')
    }
  }

  const loadLog = async () => {
    const { data } = await supabase
      .from('admin_activity_log')
      .select('*, admin:profiles!admin_activity_log_admin_id_fkey(full_name), target:profiles!admin_activity_log_target_teacher_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setActivityLog(data ?? [])
  }

  const loadBroadcasts = async () => {
    const { data } = await supabase.from('broadcast_messages').select('*').order('created_at', { ascending: false }).limit(20)
    setBroadcasts(data ?? [])
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'log') loadLog(); if (tab === 'broadcast') loadBroadcasts() }, [tab])

  const logActivity = async (targetId, action, details) => {
    await supabase.from('admin_activity_log').insert({ admin_id: user.id, target_teacher_id: targetId, action, details })
  }

  const setStatus = async (id, status) => {
    try {
      const { error } = await supabase.from('profiles').update({ subscription_status: status }).eq('id', id)
      if (error) throw error
      await logActivity(id, 'cancel', 'إلغاء الاشتراك')
      await load()
      showToast('تم إلغاء الاشتراك بنجاح', 'success')
    } catch (err) {
      console.error('[v0] setStatus error:', err)
      showToast('حصل خطأ في إلغاء الاشتراك', 'error')
    }
  }

  const toggleVerify = async (id, current) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_verified: !current }).eq('id', id)
      if (error) throw error
      await logActivity(id, !current ? 'verify' : 'unverify', !current ? 'تفعيل الحساب' : 'إلغاء تفعيل الحساب')
      showToast(!current ? 'تم تفعيل الحساب' : 'تم إلغاء التفعيل', 'success')
      await load()
    } catch (err) {
      console.error('[v0] toggleVerify error:', err)
      showToast('حصل خطأ في تفعيل الحساب', 'error')
    }
  }

  const sendPasswordReset = async (email) => {
    try {
      // آمن تمامًا: بيستخدم نفس آلية Supabase العامة لإرسال رابط استرجاع، من غير أي مفتاح
      // إداري حساس. الأدمن مش بيشوف ولا بيحدد كلمة المرور، بس بيطلب من Supabase تبعت
      // رابط تغيير كلمة المرور لإيميل المدرّس.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) throw error
      showToast(`تم إرسال رابط إعادة التعيين لـ ${email}`, 'success')
    } catch (err) {
      console.error('[v0] sendPasswordReset error:', err)
      showToast('حصل خطأ أثناء إرسال الرابط', 'error')
    }
  }

  const extend = async (id, currentExpiry) => {
    try {
      if (!extendDays || Number(extendDays) <= 0) {
        showToast('أدخل عدد أيام صحيح', 'error')
        return
      }
      const base = currentExpiry && new Date(currentExpiry) > new Date() ? new Date(currentExpiry) : new Date()
      base.setDate(base.getDate() + Number(extendDays))
      const { error } = await supabase.from('profiles').update({
        subscription_status: 'active',
        subscription_expires_at: base.toISOString(),
      }).eq('id', id)
      if (error) throw error
      await logActivity(id, 'extend', `تمديد ${extendDays} يوم`)
      setEditingId(null)
      showToast(`تم تمديد الاشتراك ${extendDays} يوم`, 'success')
      await load()
    } catch (err) {
      console.error('[v0] extend error:', err)
      showToast('حصل خطأ في تمديد الاشتراك', 'error')
    }
  }

  const sendBroadcast = async (e) => {
    try {
      e.preventDefault()
      if (!broadcastText.trim()) {
        showToast('أدخل نص الرسالة', 'error')
        return
      }
      const { error } = await supabase.from('broadcast_messages').insert({ admin_id: user.id, message: broadcastText.trim() })
      if (error) throw error
      setBroadcastText('')
      showToast('تم إرسال الرسالة لكل المدرّسين', 'success')
      await loadBroadcasts()
    } catch (err) {
      console.error('[v0] sendBroadcast error:', err)
      showToast('حصل خطأ في إرسال الرسالة', 'error')
    }
  }

  const deleteBroadcast = async (id) => {
    try {
      const { error } = await supabase.from('broadcast_messages').delete().eq('id', id)
      if (error) throw error
      showToast('تم حذف الرسالة', 'success')
      await loadBroadcasts()
    } catch (err) {
      console.error('[v0] deleteBroadcast error:', err)
      showToast('حصل خطأ في حذف الرسالة', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-navy" dir="rtl">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="النخبة" className="w-9 h-9" />
            <div>
              <h1 className="font-black text-lg text-brand-navy font-black">لوحة الأدمن</h1>
              <p className="text-slate-500 text-xs">إدارة حسابات المدرّسين والاشتراكات</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-brand-gold-hover hover:text-brand-gold-hover text-sm font-bold">لوحتي كمعلم</button>
            <button onClick={signOut} className="text-slate-500 hover:text-rose-600 text-sm">تسجيل الخروج</button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-4 text-sm border-t border-slate-200">
          {[['teachers', 'المدرّسون'], ['log', '📜 سجل النشاط'], ['broadcast', '📢 رسالة بث']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`py-2 border-b-2 font-bold ${tab === key ? 'border-brand-gold text-brand-gold-hover' : 'border-transparent text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'teachers' && (loading ? (
          <SkeletonList rows={4} />
        ) : (
          <div className="space-y-3">
            {teachers.map((t) => {
              const expired = t.subscription_expires_at && new Date(t.subscription_expires_at) < new Date()
              const effectiveStatus = expired && t.subscription_status !== 'cancelled' ? 'expired' : t.subscription_status
              const stats = statsByTeacher[t.id]
              return (
                <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Teacher Info Section */}
                    <div className="lg:col-span-1">
                      <p className="font-bold text-brand-navy flex items-center gap-2">
                        {t.full_name || '—'}
                        {t.is_admin && <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">أدمن</span>}
                      </p>
                      <p className="text-slate-500 text-xs" dir="ltr">{t.email} {t.phone && `· ${t.phone}`}</p>
                      <p className="text-slate-500 text-xs mt-1">
                        <StatusBadge status={effectiveStatus} /> 
                        {t.is_verified ? (
                          <span className="text-emerald-600 mr-2">· ✅ مفعّل</span>
                        ) : (
                          <span className="text-rose-600 mr-2">· ⏳ بانتظار التفعيل</span>
                        )}
                        · ينتهي {t.subscription_expires_at ? new Date(t.subscription_expires_at).toLocaleDateString('ar-EG') : '—'}
                      </p>
                      <p className="text-slate-500 text-xs mt-1">
                        👥 {stats?.student_count ?? 0} طالب · آخر نشاط: {stats?.last_activity ? new Date(stats.last_activity).toLocaleDateString('ar-EG') : 'مفيش نشاط بعد'}
                      </p>
                    </div>

                    {/* Action Buttons Section */}
                    <div className="lg:col-span-2">
                      {editingId === t.id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)}
                            className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-center" dir="ltr" />
                          <span className="text-xs text-slate-500">يوم</span>
                          <button onClick={() => extend(t.id, t.subscription_expires_at)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg">تأكيد التمديد</button>
                          <button onClick={() => setEditingId(null)} className="text-slate-500 text-xs">إلغاء</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <button onClick={() => toggleGames(t.id)}
                            className={`text-xs font-bold px-2 py-1.5 rounded-lg border whitespace-nowrap ${
                              gamesUnlockByTeacher[t.id]
                                ? 'bg-brand-gold/10 text-brand-gold-hover border-brand-gold/40'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                            🎮 {gamesUnlockByTeacher[t.id] ? 'مفعّلة' : 'مقفولة'}
                          </button>
                          {!t.is_verified && (
                            <button onClick={() => toggleVerify(t.id, false)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2 py-1.5 rounded-lg shadow-sm whitespace-nowrap">تفعيل الحساب</button>
                          )}
                          {t.is_verified && (
                            <button onClick={() => toggleVerify(t.id, true)} className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1.5 rounded-lg whitespace-nowrap">إلغاء التفعيل</button>
                          )}
                          <button onClick={() => setEditingId(t.id)} className="bg-brand-gold/15 text-brand-gold-hover border border-brand-gold/40 text-xs font-bold px-2 py-1.5 rounded-lg whitespace-nowrap">التمديد</button>
                          <button onClick={() => sendPasswordReset(t.email)} className="bg-violet-50 text-violet-600 border border-violet-200 text-xs font-bold px-2 py-1.5 rounded-lg whitespace-nowrap">🔑 إعادة التعيين</button>
                          <button onClick={() => setCancelTarget(t)} className="bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold px-2 py-1.5 rounded-lg whitespace-nowrap">إلغاء</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {teachers.length === 0 && <p className="text-slate-500 text-sm text-center py-8">لا يوجد مدرّسون مسجّلون بعد.</p>}
          </div>
        ))}

        {tab === 'log' && (
          <div className="space-y-2">
            {activityLog.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">لا يوجد نشاط مسجّل بعد.</p>
            ) : activityLog.map((r) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm">
                <span className="text-brand-gold-hover font-bold">{r.admin?.full_name || 'أدمن'}</span>
                {' '}<span className="text-slate-500">{ACTION_LABEL[r.action] || r.action} لـ</span>{' '}
                <span className="text-slate-800 font-bold">{r.target?.full_name || '—'}</span>
                {r.details && <span className="text-slate-500"> ({r.details})</span>}
                <p className="text-slate-400 text-xs mt-1">{new Date(r.created_at).toLocaleString('ar-EG')}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'broadcast' && (
          <div className="space-y-4">
            <form onSubmit={sendBroadcast} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-slate-400">رسالة جديدة لكل المدرّسين</p>
              <textarea rows={3} value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="مثال: هيحصل تحديث للنظام يوم الجمعة الساعة 2 فجرًا، الخدمة هتتوقف لمدة نص ساعة تقريبًا."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold" />
              <button className="bg-brand-gold hover:bg-brand-gold-hover text-brand-navy  font-bold px-4 py-2 rounded-lg text-sm">إرسال للكل</button>
            </form>
            <div className="space-y-2">
              {broadcasts.map((b) => (
                <div key={b.id} className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm text-slate-800">{b.message}</p>
                    <p className="text-slate-400 text-xs mt-1">{new Date(b.created_at).toLocaleString('ar-EG')}</p>
                  </div>
                  <button onClick={() => deleteBroadcast(b.id)} className="text-rose-600 hover:text-rose-700 text-xs shrink-0">حذف</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!cancelTarget} title="إلغاء الاشتراك" danger confirmLabel="إلغاء الاشتراك"
        message={`هيتم إلغاء اشتراك "${cancelTarget?.full_name}" وهيفقد الوصول للنظام فورًا.`}
        onConfirm={() => { setStatus(cancelTarget.id, 'cancelled'); setCancelTarget(null) }}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = {
    trial: 'text-brand-gold-hover', active: 'text-emerald-600', expired: 'text-brand-gold-hover', cancelled: 'text-rose-600',
  }
  return <span className={`font-bold ${colors[status] || 'text-slate-500'}`}>{STATUS_LABEL[status] || status}</span>
}