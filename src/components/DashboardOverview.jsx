import { useMemo } from 'react'
import { checkAcademicWarning, getStudentRank } from '../lib/helpers'

export default function DashboardOverview({ students, examScoresByStudent, absenceStreaks, ranks, onOpenStudent }) {
  const data = useMemo(() => {
    const total = students.length
    const present = students.filter((s) => s.attendance_status === 'حاضر').length
    const absent = students.filter((s) => s.attendance_status === 'غائب').length
    const recorded = present + absent
    const attendanceRate = recorded > 0 ? Math.round((present / recorded) * 100) : null

    let earned = 0, max = 0
    students.forEach((s) => {
      ;(examScoresByStudent[s.id] || []).forEach((ex) => {
        const m = ex.max_score_per_section * Object.keys(ex.section_scores || {}).length
        earned += ex.total_score; max += m
      })
    })
    const avgPerformance = max > 0 ? Math.round((earned / max) * 100) : null

    const critical = []
    const warning = []
    students.forEach((s) => {
      const academicWarning = checkAcademicWarning(examScoresByStudent[s.id] || [])
      const isCritical = s.points < 0 || (s.warnings || 0) >= 3 || academicWarning || absenceStreaks[s.id]
      const isWarning = !isCritical && (s.attendance_status === 'غائب' || s.hw_status === 'لم يتم' || s.hw_status === 'ناقص' || (s.warnings || 0) >= 1)
      if (isCritical) critical.push(s)
      else if (isWarning) warning.push(s)
    })
    const good = total - critical.length - warning.length

    const top = [...students].sort((a, b) => b.points - a.points).slice(0, 3)

    return { total, attendanceRate, avgPerformance, critical, warning, good, top }
  }, [students, examScoresByStudent, absenceStreaks])

  if (data.total === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="text-4xl mb-3">🎓</div>
        <p className="text-fg font-black text-lg">أهلاً بيك في النخبة!</p>
        <p className="text-fg-subtle text-sm mt-1">ابدأ بإضافة أول طالب، وهنا هيظهرلك ملخص شامل عن أداء طلابك أول بأول.</p>
      </div>
    )
  }

  const overallStatus = data.critical.length > 0 ? 'critical' : data.warning.length > 2 ? 'warning' : 'good'
  const statusMeta = {
    critical: { label: 'محتاج تدخل', color: 'text-rose-400', ring: 'ring-rose-500/40' },
    warning: { label: 'محتاج متابعة', color: 'text-brand-gold-hover', ring: 'ring-amber-500/40' },
    good: { label: 'الوضع مطمئن', color: 'text-emerald-400', ring: 'ring-emerald-500/40' },
  }[overallStatus]

  return (
    <div className="space-y-3">
      {/* الملخص العلوي */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="👥 إجمالي الطلاب" value={data.total} />
        <SummaryCard label="🟢 نسبة الحضور" value={data.attendanceRate === null ? '—' : `${data.attendanceRate}%`}
          hint={data.attendanceRate === null ? 'محدش سُجّل النهاردة' : undefined} />
        <SummaryCard label="📊 متوسط الأداء" value={data.avgPerformance === null ? '—' : `${data.avgPerformance}%`}
          hint={data.avgPerformance === null ? 'لا امتحانات مرصودة' : undefined} />
        <div className={`glass-card rounded-xl p-3 text-center ring-1 ${statusMeta.ring}`}>
          <p className={`text-lg font-black ${statusMeta.color}`}>{statusMeta.label}</p>
          <p className="text-fg-subtle text-[11px] mt-1">🔴 {data.critical.length} · 🟡 {data.warning.length} · 🟢 {data.good}</p>
        </div>
      </div>

      {/* اللمحات الذكية */}
      <div className="grid sm:grid-cols-3 gap-3">
        <HighlightCard title="🔴 محتاج متابعة عاجلة" color="rose" students={data.critical} onOpenStudent={onOpenStudent}
          empty="مفيش طلاب في وضع حرج دلوقتي 👍" />
        <HighlightCard title="🟡 محتاج متابعة" color="amber" students={data.warning} onOpenStudent={onOpenStudent}
          empty="مفيش حد محتاج متابعة زيادة" />
        <HighlightCard title="🌟 الأفضل أداءً" color="emerald" students={data.top} onOpenStudent={onOpenStudent}
          empty="لسه مفيش نقاط مسجّلة" subtitle={(s) => `🛡️ ${getStudentRank(s.points, ranks)} · ${s.points} pt`} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, hint }) {
  return (
    <div className="glass-card rounded-xl p-3 text-center">
      <p className="text-2xl font-black text-brand-gold-hover">{value}</p>
      <p className="text-fg-subtle text-[11px] mt-1">{label}</p>
      {hint && <p className="text-fg-subtle text-[10px] mt-0.5">{hint}</p>}
    </div>
  )
}

function HighlightCard({ title, color, students, empty, subtitle, onOpenStudent }) {
  const colors = {
    rose: 'border-rose-500/30 text-rose-300',
    amber: 'border-amber-500/30 text-amber-300',
    emerald: 'border-emerald-500/30 text-emerald-300',
  }[color]
  const shown = students.slice(0, 5)
  return (
    <div className={`glass-card rounded-xl p-3 ${colors}`}>
      <p className="font-bold text-sm mb-2">{title}</p>
      {shown.length === 0 ? (
        <p className="text-fg-subtle text-xs">{empty}</p>
      ) : (
        <div className="space-y-1">
          {shown.map((s) => (
            <button key={s.id} onClick={() => onOpenStudent(s)}
              className="w-full flex justify-between items-center glass-input hover:bg-white/10 rounded-lg px-2 py-1 text-xs text-right">
              <span className="text-fg font-bold">{s.name}</span>
              {subtitle && <span className="text-fg-subtle">{subtitle(s)}</span>}
            </button>
          ))}
          {students.length > shown.length && (
            <p className="text-fg-subtle text-[10px] text-center pt-1">+{students.length - shown.length} أكتر</p>
          )}
        </div>
      )}
    </div>
  )
}
