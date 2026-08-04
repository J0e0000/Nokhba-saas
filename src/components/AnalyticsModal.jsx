import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'
import { EmptyChart } from './Charts'
import { checkAcademicWarning } from '../lib/helpers'

export default function AnalyticsModal({ open, onClose, students, examScoresByStudent }) {
  const [attendanceTrend, setAttendanceTrend] = useState({ labels: [], present: [], absent: [] })
  const [loading, setLoading] = useState(true)
  const attCanvasRef = useRef(null)
  const attChartRef = useRef(null)
  const pointsCanvasRef = useRef(null)
  const pointsChartRef = useRef(null)
  const groupCanvasRef = useRef(null)
  const groupChartRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const since = new Date(); since.setDate(since.getDate() - 30)
    supabase.from('attendance_records').select('status, recorded_at').gte('recorded_at', since.toISOString())
      .then(({ data }) => {
        const byDate = {}
        ;(data ?? []).forEach((r) => {
          const d = new Date(r.recorded_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
          if (!byDate[d]) byDate[d] = { present: 0, absent: 0 }
          if (r.status === 'حاضر') byDate[d].present++
          else if (r.status === 'غائب') byDate[d].absent++
        })
        const labels = Object.keys(byDate)
        setAttendanceTrend({
          labels,
          present: labels.map((l) => byDate[l].present),
          absent: labels.map((l) => byDate[l].absent),
        })
        setLoading(false)
      })
  }, [open])

  // متوسط النقاط لكل مجموعة
  const groupAverages = {}
  students.forEach((s) => {
    const g = s.group_name || 'بدون مجموعة'
    if (!groupAverages[g]) groupAverages[g] = { sum: 0, count: 0 }
    groupAverages[g].sum += s.points; groupAverages[g].count++
  })

  // الطلاب في خطر: نقاط سالبة، إنذارات كتير، أو تراجع أكاديمي في الامتحانات
  const atRisk = students.filter((s) => {
    const warning = checkAcademicWarning(examScoresByStudent[s.id] || [])
    return s.points < 0 || (s.warnings || 0) >= 3 || warning
  })

  const topStudents = [...students].sort((a, b) => b.points - a.points).slice(0, 5)
  const bottomStudents = [...students].sort((a, b) => a.points - b.points).slice(0, 5)

  useEffect(() => {
    if (!open || loading) return

    if (attChartRef.current) attChartRef.current.destroy()
    attChartRef.current = new Chart(attCanvasRef.current, {
      type: 'line',
      data: {
        labels: attendanceTrend.labels.length ? attendanceTrend.labels : ['لا بيانات'],
        datasets: [
          { label: 'حاضر', data: attendanceTrend.present.length ? attendanceTrend.present : [0], borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.12)', tension: 0.35, fill: true, pointRadius: 3, borderWidth: 2.5 },
          { label: 'غائب', data: attendanceTrend.absent.length ? attendanceTrend.absent : [0], borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.35, fill: true, pointRadius: 3, borderWidth: 2.5 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { grid: { color: 'rgba(255,255,255,0.08)' }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } } } },
    })

    const sortedByPoints = [...students].sort((a, b) => b.points - a.points)
    if (pointsChartRef.current) pointsChartRef.current.destroy()
    pointsChartRef.current = new Chart(pointsCanvasRef.current, {
      type: 'bar',
      data: {
        labels: sortedByPoints.map((s) => s.name),
        datasets: [{ label: 'النقاط', data: sortedByPoints.map((s) => s.points), backgroundColor: sortedByPoints.map((s) => (s.points < 0 ? '#EF4444' : '#D4A373')), borderRadius: 6, maxBarThickness: 28 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.08)' } }, x: { grid: { display: false }, ticks: { display: sortedByPoints.length <= 15 } } } },
    })

    if (groupChartRef.current) groupChartRef.current.destroy()
    const groupNames = Object.keys(groupAverages)
    groupChartRef.current = new Chart(groupCanvasRef.current, {
      type: 'bar',
      data: {
        labels: groupNames,
        datasets: [{ label: 'متوسط النقاط', data: groupNames.map((g) => Math.round(groupAverages[g].sum / groupAverages[g].count)), backgroundColor: '#0E2954', borderRadius: 6, maxBarThickness: 28 }],
      },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.08)' } }, y: { grid: { display: false } } } },
    })

    return () => { attChartRef.current?.destroy(); pointsChartRef.current?.destroy(); groupChartRef.current?.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, attendanceTrend, students])

  return (
    <Modal open={open} onClose={onClose} title="📊 لوحة التحليل الكاملة" wide>
      {loading ? (
        <p className="text-fg-subtle text-sm text-center py-6">جاري تحليل البيانات...</p>
      ) : students.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <div className="text-4xl">📊</div>
          <p className="text-fg-muted font-bold">مفيش بيانات كفاية لسه</p>
          <p className="text-fg-subtle text-sm">ضيف طلاب وسجّل حضور وامتحانات، وهنا هتلاقي التحليل الكامل.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-bold text-fg-muted mb-2">اتجاه الحضور آخر 30 يوم</p>
            <div className="glass-card rounded-xl p-3 shadow-lg shadow-black/20 h-56">
              {attendanceTrend.labels.length > 0 ? <canvas ref={attCanvasRef} /> : <EmptyChart text="لسه مفيش سجل حضور في آخر 30 يوم" />}
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-fg-muted mb-2">توزيع النقاط بين كل الطلاب</p>
            <div className="glass-card rounded-xl p-3 shadow-lg shadow-black/20 h-56"><canvas ref={pointsCanvasRef} /></div>
          </div>

          {Object.keys(groupAverages).length > 1 && (
            <div>
              <p className="text-sm font-bold text-fg-muted mb-2">متوسط النقاط لكل مجموعة</p>
              <div className="glass-card rounded-xl p-3 shadow-lg shadow-black/20 h-48"><canvas ref={groupCanvasRef} /></div>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-bold text-emerald-400 mb-2">🏆 الأعلى نقاطًا</p>
              <div className="space-y-1">
                {topStudents.map((s) => (
                  <div key={s.id} className="flex justify-between glass-input rounded px-3 py-1.5 text-xs">
                    <span>{s.name}</span><span className="text-brand-gold-hover font-bold">{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-brand-gold-hover mb-2">📉 الأقل نقاطًا</p>
              <div className="space-y-1">
                {bottomStudents.map((s) => (
                  <div key={s.id} className="flex justify-between glass-input rounded px-3 py-1.5 text-xs">
                    <span>{s.name}</span><span className={s.points < 0 ? 'text-rose-400 font-bold' : 'text-fg-subtle'}>{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-rose-400 mb-2">⚠️ طلاب في خطر ({atRisk.length})</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {atRisk.length === 0 ? (
                  <p className="text-fg-subtle text-xs">مفيش طلاب في خطر حاليًا 👍</p>
                ) : atRisk.map((s) => (
                  <div key={s.id} className="flex justify-between bg-rose-500/10 border border-rose-500/30 rounded px-3 py-1.5 text-xs">
                    <span>{s.name}</span>
                    <span className="text-rose-400">{s.points} pt · {s.warnings || 0} إنذار</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
