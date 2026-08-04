import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import Modal from './Modal'
import { useToast } from '../context/ToastContext'
import { getStudentRank, getStudentRankPosition, checkAcademicWarning } from '../lib/helpers'

export default function ProfileModal({ open, student, allStudents, exams, dailyLogs, session, ranks, onClose, onEdit, onPlayGame }) {
  const { showToast } = useToast()
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrCardDataUrl, setQrCardDataUrl] = useState('')
  const cardRef = useRef(null)
  const qrCardRef = useRef(null)

  useEffect(() => {
    if (student) {
      QRCode.toDataURL(student.id, { width: 240, margin: 1, color: { dark: '#0E2954', light: '#ffffff' } }).then(setQrDataUrl)
      QRCode.toDataURL(student.id, { width: 200, margin: 1, color: { dark: '#0E2954', light: '#ffffff' } }).then(setQrCardDataUrl)
    }
  }, [student])

  if (!student) return null

  const rank = getStudentRank(student.points, ranks)
  const position = getStudentRankPosition(student.id, allStudents)
  const hasWarning = checkAcademicWarning(exams)
  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })

  const downloadReport = async () => {
    if (!cardRef.current) return
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const margin = 12
      const usableWidth = pageWidth - margin * 2
      const imgHeightMM = (canvas.height * usableWidth) / canvas.width

      pdf.setFillColor(14, 41, 84)
      pdf.rect(0, 0, pageWidth, 22, 'F')
      pdf.setTextColor(245, 158, 11)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.text('Al-Nokhba | Student Report', pageWidth / 2, 14, { align: 'center' })

      pdf.addImage(imgData, 'JPEG', margin, 30, usableWidth, imgHeightMM)
      pdf.save(`تقرير_${student.name}.pdf`)
      showToast('اتحمّل التقرير بنجاح', 'success')
    } catch (err) {
      console.error(err)
      showToast('حصل خطأ أثناء إنشاء ملف PDF. جرّب تاني.', 'error')
    }
  }

  const downloadQR = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `QR_${student.name}.png`
    a.click()
  }

  const downloadQRCard = async () => {
    if (!qrCardRef.current) return
    try {
      const canvas = await html2canvas(qrCardRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png', 1.0)
      a.download = `بطاقة_${student.name}.png`
      a.click()
      showToast('اتحملت بطاقة QR بنجاح', 'success')
    } catch (err) {
      console.error(err)
      showToast('حصل خطأ أثناء إنشاء البطاقة. جرّب تاني.', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ملف الطالب" wide>
      {/* بطاقة التقرير — دايمًا فاتحة عمدًا (مستند يُطبع/يتحمّل كصورة)، مش تابعة لثيم الموقع الغامق */}
      <div ref={cardRef} className="bg-white rounded-xl p-4 space-y-4" style={{ colorScheme: 'light' }}>
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-xl font-black text-[#0E2954] flex items-center gap-2">
              {student.name}
              {hasWarning && <span className="text-rose-600 text-sm" title="تراجع أكاديمي">📉</span>}
            </h4>
            <p className="text-sm text-slate-500">{student.stage} · {student.group_name}</p>
            <p className="text-xs text-slate-500 font-mono mt-1" dir="ltr">{student.code || 'N/A'}</p>
          </div>
          {qrDataUrl && <img src={qrDataUrl} alt="QR" className="w-20 h-20 rounded-lg border border-slate-200 p-1" />}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="النقاط" value={`${student.points} pt`} color="text-[#D97706]" />
          <Stat label="المركز" value={`#${position}`} color="text-violet-600" />
          <Stat label="الرتبة" value={`🛡️ ${rank}`} color="text-[#D97706]" />
          <Stat label="الحضور" value={student.attendance_status} color="text-emerald-600" />
        </div>

        {session && (session.lesson_topic || session.homework_text) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-bold text-[#D97706] mb-1">📚 حصة النهاردة ({student.group_name})</p>
            {session.lesson_topic && <p className="text-xs text-slate-600"><span className="text-slate-400">الدرس:</span> {session.lesson_topic}</p>}
            {session.homework_text && <p className="text-xs text-slate-600 mt-0.5"><span className="text-slate-400">الواجب:</span> {session.homework_text}</p>}
          </div>
        )}

        <div>
          <h5 className="text-sm font-bold text-slate-700 mb-2">سجل أحداث اليوم</h5>
          {dailyLogs.length === 0 ? (
            <p className="text-slate-400 text-xs">لا توجد أحداث مسجلة اليوم.</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {dailyLogs.map((l) => (
                <div key={l.id} className="text-xs text-slate-600 border-b border-slate-100 pb-1">
                  [{new Date(l.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}] {l.note}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h5 className="text-sm font-bold text-slate-700 mb-2">الامتحانات</h5>
          {exams.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-3">لا توجد امتحانات مرصودة لهذا الطالب بعد.</p>
          ) : (
            <div className="space-y-2">
              {exams.map((ex) => {
                const totalMax = ex.max_score_per_section * Object.keys(ex.section_scores || {}).length
                const pct = totalMax > 0 ? Math.round((ex.total_score / totalMax) * 100) : 0
                return (
                  <div key={ex.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-[#D97706]">{ex.exam_title}</span>
                      <span className="text-slate-400 text-xs">{new Date(ex.created_at).toLocaleDateString('ar-EG')}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">المجموع: {ex.total_score}</span>
                      <span className="font-black text-[#D97706]">{pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {onPlayGame && (
          <button onClick={() => onPlayGame(student)} className="bg-brand-gold/10 text-brand-gold-hover border border-brand-gold/40 font-bold py-2 rounded-lg text-sm">
            🎮 امسك الغلط
          </button>
        )}
        <button onClick={() => onEdit(student)} className="glass-input hover:bg-white/10 text-slate-100 font-bold py-2 rounded-lg text-sm border border-white/10">
          تعديل البيانات
        </button>
        <button onClick={downloadQRCard} className="bg-gradient-to-l from-brand-gold to-brand-gold-hover text-brand-bg font-bold py-2 rounded-lg text-sm">
          🪪 بطاقة QR للطباعة
        </button>
        <button onClick={downloadReport} className="bg-brand-navy hover:bg-brand-navy-light text-white font-bold py-2 rounded-lg text-sm">
          📄 تقرير PDF
        </button>
      </div>
      <button onClick={downloadQR} className="w-full text-slate-400 hover:text-slate-300 text-xs mt-2">تحميل صورة QR فقط (بدون تصميم)</button>

      {/* بطاقة QR البراندنج — مخفية، فاتحة عمدًا (بطاقة تُطبع)، تُستخدم فقط لالتقاط الصورة عند التحميل */}
      <div className="fixed pointer-events-none" style={{ left: '-9999px', top: 0 }}>
        <div ref={qrCardRef} className="bg-white p-6" style={{ width: '380px', colorScheme: 'light' }}>
          <div className="border-2 border-[#0E2954] rounded-2xl p-5 relative overflow-hidden" style={{ background: 'linear-gradient(180deg,#ffffff 0%,#F8FAFC 100%)' }}>
            <div className="absolute top-0 right-0 w-16 h-16 border-b-2 border-l-2 border-[#F59E0B] rounded-bl-2xl" />
            <div className="flex flex-col items-center gap-1 pb-3 mb-3 border-b border-slate-200">
              <img src="/logo-icon.png" alt="" className="w-10 h-10" />
              <p className="font-black text-[#0E2954] text-sm">النخبة</p>
            </div>

            <div className="text-center mb-4">
              <p className="text-lg font-black text-[#0E2954] leading-tight">{student.name}</p>
              <span className="inline-block bg-amber-50 text-[#D97706] text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">طالب</span>
              <p className="text-slate-500 text-xs mt-1">{student.group_name} · {student.stage}</p>
              <p className="text-slate-400 text-[10px] mt-0.5">{today}</p>
            </div>

            <div className="flex justify-center">
              <div className="border-2 border-[#F59E0B] rounded-xl p-2 bg-white">
                {qrCardDataUrl && <img src={qrCardDataUrl} alt="QR" className="w-40 h-40" />}
              </div>
            </div>

            <p className="text-center text-[#0E2954] text-[11px] font-bold mt-4 pt-3 border-t border-slate-200">
              📷 امسح لتسجيل الحضور
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <p className={`font-black text-sm ${color}`}>{value}</p>
      <p className="text-slate-400 text-[10px]">{label}</p>
    </div>
  )
}
