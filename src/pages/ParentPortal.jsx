import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Parent Portal - A read-only view for parents to check their child's progress
 * Access via a unique obfuscated URL: /parent/{encryptedStudentId}
 */
export default function ParentPortal({ studentToken }) {
  const [student, setStudent] = useState(null)
  const [recentAttendance, setRecentAttendance] = useState([])
  const [recentExams, setRecentExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        setLoading(true)
        setError(null)

        // In production, you'd decrypt the studentToken to get the actual student ID
        // For now, we'll assume it's passed directly (should be secured in real app)
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('*')
          .eq('id', studentToken)
          .single()

        if (studentError) throw new Error('Student not found')
        setStudent(studentData)

        // Get recent attendance (last 30 days)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const { data: attendanceData } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('student_id', studentToken)
          .gte('recorded_at', thirtyDaysAgo.toISOString())
          .order('recorded_at', { ascending: false })
          .limit(10)

        setRecentAttendance(attendanceData || [])

        // Get recent exam scores
        const { data: examData } = await supabase
          .from('exam_scores')
          .select('*, exams(title, max_score_per_section)')
          .eq('student_id', studentToken)
          .order('created_at', { ascending: false })
          .limit(5)

        setRecentExams(examData || [])
      } catch (err) {
        setError(err.message || 'Failed to load student data')
      } finally {
        setLoading(false)
      }
    }

    if (studentToken) loadStudentData()
  }, [studentToken])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <div className="text-center">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-slate-500">جاري تحميل البيانات...</p>
        </div>
      </div>
    )
  }

  if (error || !student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-slate-600 font-bold mb-2">عذراً، لم نتمكن من تحميل البيانات</p>
          <p className="text-slate-500 text-sm">{error || 'الرابط قد يكون غير صحيح أو منتهي الصلاحية'}</p>
        </div>
      </div>
    )
  }

  const attendanceRate = recentAttendance.length > 0
    ? Math.round(
      (recentAttendance.filter((a) => a.status === 'حاضر').length / recentAttendance.length) * 100
    )
    : 0

  const avgExamScore = recentExams.length > 0
    ? Math.round(recentExams.reduce((sum, e) => sum + (e.total_score || 0), 0) / recentExams.length)
    : 0

  return (
    <div className="min-h-screen bg-brand-bg p-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-brand-gold/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">👤</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-brand-navy">{student.name}</h1>
              <p className="text-slate-500 text-sm">بوابة أولياء الأمور - النخبة</p>
            </div>
          </div>
          <p className="text-slate-600 text-sm">
            {student.stage && `المرحلة: ${student.stage}`}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">نسبة الحضور</p>
            <p className="text-2xl font-black text-brand-gold">{attendanceRate}%</p>
            <p className="text-slate-400 text-[10px] mt-1">آخر 30 يوم</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">متوسط الامتحانات</p>
            <p className="text-2xl font-black text-brand-gold">{avgExamScore}%</p>
            <p className="text-slate-400 text-[10px] mt-1">آخر 5 امتحانات</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">النقاط الكلية</p>
            <p className="text-2xl font-black text-brand-gold">{student.points || 0}</p>
            <p className="text-slate-400 text-[10px] mt-1">إجمالي النقاط</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">الحالة</p>
            <p className={`text-sm font-bold ${
              student.attendance_status === 'حاضر' ? 'text-emerald-600' : 'text-slate-600'
            }`}>
              {student.attendance_status || 'لم يتم تحديد'}
            </p>
            <p className="text-slate-400 text-[10px] mt-1">آخر تحديث</p>
          </div>
        </div>

        {/* Recent Attendance */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
          <h2 className="font-bold text-brand-navy mb-3">سجل الحضور الأخير</h2>
          {recentAttendance.length === 0 ? (
            <p className="text-slate-400 text-sm">لا توجد بيانات حضور حتى الآن</p>
          ) : (
            <div className="space-y-2">
              {recentAttendance.map((record) => (
                <div key={record.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">
                    {new Date(record.recorded_at).toLocaleDateString('ar-EG')}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    record.status === 'حاضر'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}>
                    {record.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Exams */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
          <h2 className="font-bold text-brand-navy mb-3">الامتحانات الأخيرة</h2>
          {recentExams.length === 0 ? (
            <p className="text-slate-400 text-sm">لا توجد نتائج امتحانات حتى الآن</p>
          ) : (
            <div className="space-y-3">
              {recentExams.map((exam) => (
                <div key={exam.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800">{exam.exams?.title || 'امتحان'}</h3>
                    <span className="text-lg font-black text-brand-gold">
                      {exam.total_score || 0}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {new Date(exam.created_at).toLocaleDateString('ar-EG')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-600">
            📌 هذه البوابة للاطلاع فقط. للتواصل مع المعلم أو الحصول على تفاصيل أكثر، يرجى التواصل مباشرة.
          </p>
        </div>
      </div>
    </div>
  )
}
