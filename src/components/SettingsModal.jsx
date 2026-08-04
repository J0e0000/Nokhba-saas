import { useEffect, useState } from 'react'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const REPORT_FIELDS = [
  { key: 'rank', label: '🎖️ الرتبة' },
  { key: 'position', label: '🏆 المركز على الدفعة' },
  { key: 'points', label: '⭐ إجمالي النقاط' },
  { key: 'warnings', label: '🚨 الإنذارات' },
  { key: 'attendance', label: '🟢 الحضور' },
  { key: 'homework', label: '📚 حالة الواجب' },
  { key: 'session', label: '📚 درس ووجب الحصة' },
  { key: 'logs', label: '📝 السجل التفصيلي لأحداث اليوم' },
]

export default function SettingsModal({ open, onClose, settings, onSave, onResetAllData, teacherId, teacherEmail, isAssistant }) {
  const { showToast } = useToast()
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false)
  const [groups, setGroups] = useState('')
  const [points, setPoints] = useState({ interact: 3, interrupt: -3, present: 1, absent: -1 })
  const [ranks, setRanks] = useState([])
  const [reportFields, setReportFields] = useState([])
  const [schedule, setSchedule] = useState({}) // group_name -> Set(weekday)
  const [dangerOpen, setDangerOpen] = useState(false)
  const [otpStage, setOtpStage] = useState('idle') // idle | sending | sent | error
  const [otpCode, setOtpCode] = useState('')
  const [team, setTeam] = useState([])
  const [newAssistantEmail, setNewAssistantEmail] = useState('')
  const [teamError, setTeamError] = useState('')

  const loadTeam = async () => {
    const { data } = await supabase.from('workspace_members').select('id, member_id, created_at, profiles!workspace_members_member_id_fkey(full_name, email)').eq('owner_id', teacherId)
    setTeam(data ?? [])
  }

  useEffect(() => {
    if (open && !isAssistant && teacherId) loadTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teacherId])

  const addAssistant = async (e) => {
    e.preventDefault()
    setTeamError('')
    const { error } = await supabase.rpc('link_assistant_by_email', { assistant_email: newAssistantEmail.trim() })
    if (error) setTeamError(error.message.includes('لا يوجد') ? error.message : 'حصل خطأ، تأكد إن الإيميل ده عنده حساب على المنصة بالفعل.')
    else { setNewAssistantEmail(''); loadTeam(); showToast('اتربط المساعد بنجاح', 'success') }
  }

  const removeAssistant = async (id) => {
    await supabase.from('workspace_members').delete().eq('id', id)
    loadTeam()
  }

  const sendOtp = async () => {
    setOtpStage('sending')
    setOtpCode('')
    const { error } = await supabase.auth.signInWithOtp({ email: teacherEmail, options: { shouldCreateUser: false } })
    setOtpStage(error ? 'error' : 'sent')
  }

  const verifyAndDelete = async () => {
    const { error } = await supabase.auth.verifyOtp({ email: teacherEmail, token: otpCode.trim(), type: 'email' })
    if (error) { setOtpStage('error'); return }
    setFinalConfirmOpen(true)
  }

  useEffect(() => {
    if (settings) {
      setGroups((settings.groups || []).join(', '))
      setPoints({
        interact: settings.points_interact, interrupt: settings.points_interrupt,
        present: settings.points_present, absent: settings.points_absent,
      })
      setRanks(settings.ranks || [])
      setReportFields(settings.report_fields || ['rank', 'position', 'points', 'warnings', 'attendance', 'homework', 'session', 'logs'])
    }
  }, [settings, open])

  useEffect(() => {
    if (!open || !teacherId) return
    supabase.from('group_schedule').select('*').then(({ data }) => {
      const map = {}
      ;(data ?? []).forEach((r) => {
        if (!map[r.group_name]) map[r.group_name] = new Set()
        map[r.group_name].add(r.weekday)
      })
      setSchedule(map)
    })
  }, [open, teacherId])

  const toggleDay = async (groupName, day) => {
    const has = schedule[groupName]?.has(day)
    setSchedule((prev) => {
      const next = { ...prev, [groupName]: new Set(prev[groupName] || []) }
      if (has) next[groupName].delete(day); else next[groupName].add(day)
      return next
    })
    if (has) {
      await supabase.from('group_schedule').delete().match({ teacher_id: teacherId, group_name: groupName, weekday: day })
    } else {
      await supabase.from('group_schedule').insert({ teacher_id: teacherId, group_name: groupName, weekday: day })
    }
  }

  const submit = (e) => {
    e.preventDefault()
    onSave({
      groups: groups.split(',').map((g) => g.trim()).filter(Boolean),
      points_interact: Number(points.interact) || 0,
      points_interrupt: Number(points.interrupt) || 0,
      points_present: Number(points.present) || 0,
      points_absent: Number(points.absent) || 0,
      ranks,
      report_fields: reportFields,
    })
  }

  const groupList = groups.split(',').map((g) => g.trim()).filter(Boolean)

  const toggleReportField = (key) => {
    setReportFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return (
    <Modal open={open} onClose={onClose} title="الإعدادات" wide>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="block text-sm text-slate-400 mb-1">المجموعات (افصل بينهم بفاصلة)</label>
          <input
            value={groups} onChange={(e) => setGroups(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold"
          />
        </div>

        <div>
          <p className="text-sm text-slate-400 mb-2 font-bold">قيم النقاط</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PointField label="تفاعل +" value={points.interact} onChange={(v) => setPoints({ ...points, interact: v })} />
            <PointField label="مشاغبة" value={points.interrupt} onChange={(v) => setPoints({ ...points, interrupt: v })} />
            <PointField label="حضور +" value={points.present} onChange={(v) => setPoints({ ...points, present: v })} />
            <PointField label="غياب" value={points.absent} onChange={(v) => setPoints({ ...points, absent: v })} />
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-400 mb-2 font-bold">الرتب</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {ranks.map((r, idx) => (
              <div key={idx} className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col gap-1">
                <span className="text-slate-500 text-[10px] font-bold">من {r.min} نقطة</span>
                <input
                  value={r.title}
                  onChange={(e) => {
                    const next = [...ranks]; next[idx] = { ...next[idx], title: e.target.value }; setRanks(next)
                  }}
                  className="w-full bg-white text-brand-gold-hover px-2 py-1 rounded border border-slate-600 text-xs text-center font-bold outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-400 mb-2 font-bold">📄 محتوى تقارير واتساب</p>
          <p className="text-slate-500 text-[11px] mb-2">اختار البيانات اللي عايز تظهر في تقرير الطالب (فردي وجماعي)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {REPORT_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={reportFields.includes(f.key)} onChange={() => toggleReportField(f.key)} className="w-3.5 h-3.5 accent-[#D4A373]" />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <button className="w-full bg-brand-gold hover:bg-brand-gold-hover text-brand-navy  font-bold py-2.5 rounded-lg text-sm">
          حفظ الإعدادات
        </button>
      </form>

      {/* الجدول الأسبوعي: حدد أيام حصة كل مجموعة */}
      {groupList.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-400 mb-2 font-bold">📅 جدول حصص المجموعات</p>
          <div className="space-y-2">
            {groupList.map((g) => (
              <div key={g} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <p className="text-xs font-bold text-slate-400 mb-1.5">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d, day) => (
                    <button
                      key={day} type="button" onClick={() => toggleDay(g, day)}
                      className={`text-[11px] px-2 py-1 rounded-full border ${
                        schedule[g]?.has(day)
                          ? 'bg-brand-navy border-brand-gold text-white font-bold'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الفريق: دمج حساب مساعد على نفس البيانات والاشتراك */}
      {!isAssistant && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-sm font-bold text-slate-400 mb-2">👥 الفريق (حسابات مساعدة)</p>
          <p className="text-slate-500 text-[11px] mb-2">
            اربط حساب مساعد بإيميله (لازم يكون عامل حساب على المنصة قبل كده) — هيشتغل على نفس بياناتك وتحت نفس اشتراكك.
          </p>
          <form onSubmit={addAssistant} className="flex gap-2 mb-2">
            <input
              type="email" required value={newAssistantEmail} onChange={(e) => setNewAssistantEmail(e.target.value)} dir="ltr"
              placeholder="إيميل المساعد" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-gold"
            />
            <button className="bg-brand-gold/15 text-brand-gold-hover border border-brand-gold/40 px-3 rounded-lg text-xs font-bold">ربط</button>
          </form>
          {teamError && <p className="text-rose-600 text-[11px] mb-2">{teamError}</p>}
          <div className="space-y-1">
            {team.map((m) => (
              <div key={m.id} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-1.5 text-xs">
                <span>{m.profiles?.full_name || m.profiles?.email}</span>
                <button onClick={() => removeAssistant(m.id)} className="text-rose-600 hover:text-rose-700">إزالة</button>
              </div>
            ))}
            {team.length === 0 && <p className="text-slate-400 text-[11px]">مفيش مساعدين مربوطين حاليًا.</p>}
          </div>
        </div>
      )}

      {/* منطقة خطرة — للمالك بس، مخفية عن قصد، ومطلوب كود تأكيد يتبعت على الإيميل قبل التنفيذ */}
      {!isAssistant && (
      <div className="mt-6 pt-4 border-t border-slate-200">
        {!dangerOpen ? (
          <button
            type="button" onClick={() => setDangerOpen(true)}
            className="text-slate-400 hover:text-slate-500 text-[11px] underline"
          >
            خيارات متقدمة
          </button>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
            <p className="text-rose-600 text-xs font-bold">⚠️ حذف كل البيانات</p>
            <p className="text-slate-500 text-[11px]">
              هيمسح كل الطلاب والامتحانات والسجلات نهائيًا ولا يمكن التراجع عنه. لحمايتك، لازم كود تأكيد يوصلك على إيميلك ({teacherEmail}).
            </p>

            {otpStage === 'idle' && (
              <button type="button" onClick={sendOtp}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold py-2 rounded-lg text-xs">
                ابعتلي كود التأكيد على الإيميل
              </button>
            )}

            {otpStage === 'sending' && <p className="text-slate-500 text-[11px] text-center">جاري إرسال الكود...</p>}

            {(otpStage === 'sent' || otpStage === 'error') && (
              <>
                <p className="text-emerald-600 text-[11px] font-bold">
                  ✅ تم إرسال كود التأكيد إلى بريدك الإلكتروني.
                </p>
                <p className="text-slate-500 text-[10px]">
                  ابحث عن رسالة من Supabase تحتوي على كود مكون من 6 أرقام. أدخله أدناه للمتابعة.
                </p>
                <input
                  value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="اكتب الكود هنا" dir="ltr"
                  className="w-full bg-white border border-rose-200 rounded px-2 py-1.5 text-xs outline-none text-center tracking-widest"
                />
                {otpStage === 'error' && <p className="text-rose-600 text-[11px]">الكود غلط أو منتهي، جرّب تبعت كود جديد.</p>}
                <button
                  type="button"
                  disabled={otpCode.trim().length < 4}
                  onClick={verifyAndDelete}
                  className="w-full bg-rose-600 disabled:bg-slate-50 disabled:text-slate-400 text-white font-bold py-2 rounded-lg text-xs"
                >
                  تأكيد الكود وحذف كل البيانات نهائيًا
                </button>
                <button type="button" onClick={sendOtp} className="w-full text-slate-500 text-[10px] underline">
                  إعادة إرسال الكود
                </button>
              </>
            )}
          </div>
        )}
      </div>
      )}

      <ConfirmDialog
        open={finalConfirmOpen} title="تأكيد نهائي" danger confirmLabel="حذف كل البيانات نهائيًا"
        message="آخر تأكيد قبل الحذف — هيتمسح كل شيء (طلاب، امتحانات، سجلات) نهائيًا ومفيش رجوع فيها."
        onConfirm={() => { setFinalConfirmOpen(false); onResetAllData() }}
        onCancel={() => setFinalConfirmOpen(false)}
      />
    </Modal>
  )
}

function PointField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-500 mb-1">{label}</label>
      <input
        type="number" value={value} onChange={(e) => onChange(e.target.value)} dir="ltr"
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-brand-gold"
      />
    </div>
  )
}
