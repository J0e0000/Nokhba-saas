import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import {
  generateStudentCode, getStudentRank, getStudentRankPosition,
  checkAcademicWarning, parseTemplate, sendWhatsApp, STAGE_CATEGORIES,
} from '../lib/helpers'
import * as XLSX from 'xlsx'

import StudentModal from '../components/StudentModal'
import ProfileModal from '../components/ProfileModal'
import QRScannerModal from '../components/QRScannerModal'
import LeaderboardModal from '../components/LeaderboardModal'
import SettingsModal from '../components/SettingsModal'
import TemplatesModal from '../components/TemplatesModal'
import ExamModal from '../components/ExamModal'
import ExamsListModal from '../components/ExamsListModal'
import AnalyticsModal from '../components/AnalyticsModal'
import GamesHubModal from '../components/GamesHubModal'
import DashboardOverview from '../components/DashboardOverview'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonTableRows } from '../components/Skeleton'
import NotificationBell from '../components/NotificationBell'
import { useToast } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import MessageQueueModal from '../components/MessageQueueModal'
import SessionHistoryModal from '../components/SessionHistoryModal'
import Charts from '../components/Charts'

const STAGES = ['الكل', ...STAGE_CATEGORIES]

export default function Dashboard({ onOpenAdmin }) {
  const { profile, ownerProfile, isAssistant, effectiveTeacherId, unlockedFeatures, user, signOut } = useAuth()
  const { showToast } = useToast()
  const { isLight, toggleTheme } = useTheme()
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, danger, confirmLabel, resolve }
  const [fabOpen, setFabOpen] = useState(false)
  const askConfirm = (message, opts = {}) => new Promise((resolve) => setConfirmDialog({ message, ...opts, resolve }))
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])
  const { settings, updateSettings } = useSettings()

  const [students, setStudents] = useState([])
  const [examScoresByStudent, setExamScoresByStudent] = useState({})
  const [todayLogsByStudent, setTodayLogsByStudent] = useState({})
  const [sessionLogsByGroup, setSessionLogsByGroup] = useState({}) // group_name -> today's row
  const [absenceStreaks, setAbsenceStreaks] = useState({}) // student_id -> consecutive absences (>=3)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('الكل')
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [studentModal, setStudentModal] = useState({ open: false, student: null })
  const [profileModal, setProfileModal] = useState({ open: false, student: null })
  const [qrOpen, setQrOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [examOpen, setExamOpen] = useState(false)
  const [examsListOpen, setExamsListOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [gameModal, setGameModal] = useState({ open: false, studentId: null })
  const [broadcasts, setBroadcasts] = useState([])
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissedBroadcasts') || '[]') } catch { return [] }
  })
  const [queue, setQueue] = useState({ open: false, items: [], index: 0 })
  const [sessionGroup, setSessionGroup] = useState('')
  const [sessionDraft, setSessionDraft] = useState({ lesson_topic: '', homework_text: '' })
  const [historyModal, setHistoryModal] = useState({ open: false, group: null })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [todayGroups, setTodayGroups] = useState([])
  const [activeSection, setActiveSection] = useState('dashboard') // dashboard | students | sessions | exams | reports

  // -------------------- Data loading --------------------
  const loadAll = useCallback(async () => {
    setLoading(true)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayDateStr = new Date().toISOString().slice(0, 10)

    const [{ data: st }, { data: scores }, { data: logs }, { data: sessions }, { data: attendance }] = await Promise.all([
      supabase.from('students').select('*').order('created_at'),
      supabase.from('exam_scores').select('*, exams(title, max_score_per_section)').order('created_at'),
      supabase.from('behavior_logs').select('*').gte('created_at', todayStart.toISOString()).order('created_at'),
      supabase.from('session_logs').select('*').eq('session_date', todayDateStr),
      supabase.from('attendance_records').select('student_id, status, recorded_at').order('recorded_at', { ascending: false }).limit(1000),
    ])

    setStudents(st ?? [])

    // غياب متكرر: نعد أكبر عدد غيابات متتالية (من الأحدث للأقدم) لكل طالب
    const byStudent = {}
    ;(attendance ?? []).forEach((r) => { (byStudent[r.student_id] ||= []).push(r) })
    const streaks = {}
    Object.entries(byStudent).forEach(([sid, records]) => {
      let streak = 0
      for (const r of records) {
        if (r.status === 'غائب') streak++
        else break
      }
      if (streak >= 3) streaks[sid] = streak
    })
    setAbsenceStreaks(streaks)

    const scoresMap = {}
    ;(scores ?? []).forEach((row) => {
      if (!scoresMap[row.student_id]) scoresMap[row.student_id] = []
      scoresMap[row.student_id].push({
        id: row.id, exam_title: row.exams?.title, max_score_per_section: row.exams?.max_score_per_section,
        section_scores: row.section_scores, total_score: row.total_score, created_at: row.created_at,
      })
    })
    setExamScoresByStudent(scoresMap)

    const logsMap = {}
    ;(logs ?? []).forEach((row) => {
      if (!logsMap[row.student_id]) logsMap[row.student_id] = []
      logsMap[row.student_id].push(row)
    })
    setTodayLogsByStudent(logsMap)

    const sessionMap = {}
    ;(sessions ?? []).forEach((row) => { sessionMap[row.group_name] = row })
    setSessionLogsByGroup(sessionMap)

    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    supabase.from('broadcast_messages').select('*').order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setBroadcasts(data ?? []))
  }, [])

  const dismissBroadcast = (id) => {
    const next = [...dismissedBroadcasts, id]
    setDismissedBroadcasts(next)
    localStorage.setItem('dismissedBroadcasts', JSON.stringify(next))
  }

  // تحديث لحظي: أي تغيير (زي تسجيل حضور بالـ QR من جهاز تاني على نفس الحساب) يوصل هنا فورًا
  useEffect(() => {
    if (!effectiveTeacherId) return
    const channel = supabase.channel(`realtime-${effectiveTeacherId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `teacher_id=eq.${effectiveTeacherId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setStudents((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [...prev, payload.new]))
        } else if (payload.eventType === 'UPDATE') {
          setStudents((prev) => prev.map((s) => (s.id === payload.new.id ? payload.new : s)))
        } else if (payload.eventType === 'DELETE') {
          setStudents((prev) => prev.filter((s) => s.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'behavior_logs', filter: `teacher_id=eq.${effectiveTeacherId}` }, (payload) => {
        const row = payload.new
        const rowDate = new Date(row.created_at)
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        if (rowDate < todayStart) return
        setTodayLogsByStudent((prev) => {
          const list = prev[row.student_id] || []
          if (list.some((l) => l.id === row.id)) return prev
          return { ...prev, [row.student_id]: [...list, row] }
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_logs', filter: `teacher_id=eq.${effectiveTeacherId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return
        setSessionLogsByGroup((prev) => ({ ...prev, [payload.new.group_name]: payload.new }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [effectiveTeacherId])

  const groups = settings?.groups || []
  const ranks = settings?.ranks || []

  // مجموعات النهاردة حسب الجدول الأسبوعي (لو المدرّس حدده في الإعدادات)
  useEffect(() => {
    if (!effectiveTeacherId) return
    const todayWeekday = new Date().getDay()
    supabase.from('group_schedule').select('group_name').eq('weekday', todayWeekday).then(({ data }) => {
      const list = (data ?? []).map((r) => r.group_name)
      setTodayGroups(list)
      if (list.length === 1) setSessionGroup((prev) => prev || list[0])
    })
  }, [effectiveTeacherId])

  // لما تختار مجموعة في شريط الحصة، حمّل بياناتها المحفوظة اليوم (لو موجودة) في حقول الكتابة
  useEffect(() => {
    if (!sessionGroup) { setSessionDraft({ lesson_topic: '', homework_text: '' }); return }
    const existing = sessionLogsByGroup[sessionGroup]
    setSessionDraft({ lesson_topic: existing?.lesson_topic || '', homework_text: existing?.homework_text || '' })
  }, [sessionGroup, sessionLogsByGroup])

  const saveSessionLog = async () => {
    if (!sessionGroup) return
    const todayDateStr = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('session_logs')
      .upsert(
        { teacher_id: effectiveTeacherId, group_name: sessionGroup, session_date: todayDateStr, ...sessionDraft, updated_at: new Date().toISOString() },
        { onConflict: 'teacher_id,group_name,session_date' }
      )
      .select().single()
    if (data) setSessionLogsByGroup((prev) => ({ ...prev, [sessionGroup]: data }))
  }

  // -------------------- Derived / filtered --------------------
  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase()
    return students.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)) || (s.code && s.code.toLowerCase().includes(q))
      const matchStage = stageFilter === 'الكل' || (s.stage || '').includes(stageFilter)
      const matchGroup = groupFilter === 'all' || s.group_name === groupFilter
      let matchStatus = true
      if (statusFilter === 'absent') matchStatus = s.attendance_status === 'غائب'
      else if (statusFilter === 'present') matchStatus = s.attendance_status === 'حاضر'
      else if (statusFilter === 'warning') matchStatus = checkAcademicWarning(examScoresByStudent[s.id] || [])
      else if (statusFilter === 'hw_missing') matchStatus = s.hw_status === 'لم يتم' || s.hw_status === 'ناقص'
      return matchSearch && matchStage && matchGroup && matchStatus
    })
  }, [students, search, stageFilter, groupFilter, statusFilter, examScoresByStudent])

  const stats = useMemo(() => {
    let present = 0, absent = 0, unrecorded = 0
    filteredStudents.forEach((s) => {
      if (s.attendance_status === 'حاضر') present++
      else if (s.attendance_status === 'غائب') absent++
      else unrecorded++
    })
    let totalEarned = 0, totalMax = 0
    const examDatesMap = {}
    filteredStudents.forEach((s) => {
      ;(examScoresByStudent[s.id] || []).forEach((ex) => {
        const mMax = ex.max_score_per_section * Object.keys(ex.section_scores || {}).length
        totalEarned += ex.total_score; totalMax += mMax
        const d = new Date(ex.created_at).toLocaleDateString('ar-EG')
        if (!examDatesMap[d]) examDatesMap[d] = { earned: 0, max: 0 }
        examDatesMap[d].earned += ex.total_score; examDatesMap[d].max += mMax
      })
    })
    const avg = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0
    return { present, absent, unrecorded, avg, examDatesMap }
  }, [filteredStudents, examScoresByStudent])

  // -------------------- Actions --------------------
  // ملاحظة أداء: بدل ما نعيد تحميل كل البيانات من السيرفر بعد كل دوسة (كان ده اللي بيخلي
  // كل حاجة حاسة بطيئة)، بنحدّث الحالة محليًا فورًا، والسيرفر بيتحدث في الخلفية.
  const patchStudent = (id, patch) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const logAction = async (studentId, note, pointsDelta = 0) => {
    const { data } = await supabase.from('behavior_logs')
      .insert({ teacher_id: effectiveTeacherId, student_id: studentId, note, points_delta: pointsDelta })
      .select().single()
    if (data) {
      setTodayLogsByStudent((prev) => ({ ...prev, [studentId]: [...(prev[studentId] || []), data] }))
    }
  }

  const adjustPoints = async (id, amount, reason = 'تعديل يدوي') => {
    const s = students.find((x) => x.id === id); if (!s) return
    const newPoints = s.points + amount
    patchStudent(id, { points: newPoints })
    supabase.from('students').update({ points: newPoints }).eq('id', id)
    logAction(id, `${reason} (${amount > 0 ? '+' + amount : amount} نقطة)`, amount)
  }

  const setAttendance = async (id, status) => {
    const s = students.find((x) => x.id === id); if (!s) return
    let pointsDiff = 0
    if (s.attendance_status === 'حاضر') pointsDiff -= settings.points_present
    if (s.attendance_status === 'غائب') pointsDiff -= settings.points_absent
    if (status === 'حاضر') pointsDiff += settings.points_present
    else if (status === 'غائب') pointsDiff += settings.points_absent
    const newPoints = s.points + pointsDiff

    patchStudent(id, { attendance_status: status, points: newPoints })
    supabase.from('students').update({ attendance_status: status, points: newPoints }).eq('id', id)
    supabase.from('attendance_records').insert({ teacher_id: effectiveTeacherId, student_id: id, status })
    logAction(id, `تسجيل الحضور: ${status}`, pointsDiff)
  }

  const updateHW = async (id, status) => {
    patchStudent(id, { hw_status: status })
    supabase.from('students').update({ hw_status: status }).eq('id', id)
    logAction(id, `تقييم الواجب: ${status}`)
  }

  const addWarning = async (id) => {
    const s = students.find((x) => x.id === id); if (!s) return
    const nextWarnings = (s.warnings || 0) + 1
    const newPoints = s.points - 5
    patchStudent(id, { warnings: nextWarnings, points: newPoints })
    supabase.from('students').update({ warnings: nextWarnings, points: newPoints }).eq('id', id)
    logAction(id, `تم تسجيل إنذار سلوكي (رقم ${nextWarnings}) (-5 نقطة)`, -5)
  }

  const markAllPresent = async () => {
    for (const s of filteredStudents) { if (s.attendance_status !== 'حاضر') setAttendance(s.id, 'حاضر') }
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const allSelected = filteredStudents.every((s) => prev.has(s.id))
      if (allSelected) return new Set()
      return new Set(filteredStudents.map((s) => s.id))
    })
  }

  const selectedStudents = students.filter((s) => selectedIds.has(s.id))

  const bulkSetAttendance = (status) => { selectedStudents.forEach((s) => setAttendance(s.id, status)) }
  const bulkAdjustPoints = (amount, reason) => { selectedStudents.forEach((s) => adjustPoints(s.id, amount, reason)) }
  const bulkMessage = () => {
    if (selectedStudents.length === 0) return
    const text = prompt('نص الرسالة للمحددين:', settings.msg_welcome)
    if (!text || !text.trim()) return
    const items = selectedStudents.map((s) => ({ student: s, phone: s.phone, message: parseTemplate(text.trim(), s, ranks) }))
    setQueue({ open: true, items, index: 0 })
  }

  const startNewDay = async () => {
    const ok = await askConfirm('هيتصفّر الحضور والواجب لكل الطلاب (النقاط والامتحانات هتفضل زي ما هي، والسجل التاريخي محفوظ).', { title: 'بدء يوم جديد؟', confirmLabel: 'ابدأ يوم جديد' })
    if (!ok) return
    setStudents((prev) => prev.map((s) => ({ ...s, attendance_status: 'لم يرصد', hw_status: 'لم يرصد' })))
    await supabase.from('students').update({ attendance_status: 'لم يرصد', hw_status: 'لم يرصد' }).eq('teacher_id', effectiveTeacherId)
    loadAll()
    showToast('بدأ يوم جديد بنجاح', 'success')
  }

  const saveStudent = async (form) => {
    if (studentModal.student) {
      const id = studentModal.student.id
      patchStudent(id, { name: form.name, phone: form.phone, stage: form.stage, group_name: form.group })
      await supabase.from('students').update({ name: form.name, phone: form.phone, stage: form.stage, group_name: form.group }).eq('id', id)
      showToast('اتحدّثت بيانات الطالب', 'success')
    } else {
      const normalizedName = form.name.trim().toLowerCase()
      const possibleDupe = students.find((s) => {
        const sameName = s.name.trim().toLowerCase() === normalizedName
        const samePhone = form.phone && s.phone && s.phone === form.phone
        return sameName || samePhone
      })
      if (possibleDupe) {
        const reason = possibleDupe.name.trim().toLowerCase() === normalizedName ? 'نفس الاسم' : 'نفس رقم الهاتف'
        const proceed = await askConfirm(`فيه طالب مسجّل قبل كده بـ${reason} (${possibleDupe.name}). عايز تضيف طالب جديد تاني؟`, { title: 'طالب مشابه موجود بالفعل', confirmLabel: 'أضف برضه' })
        if (!proceed) return
      }
      const { data } = await supabase.from('students').insert({
        teacher_id: effectiveTeacherId, code: generateStudentCode(), name: form.name, phone: form.phone,
        stage: form.stage, group_name: form.group, points: 0, warnings: 0,
        attendance_status: 'لم يرصد', hw_status: 'لم يرصد',
      }).select().single()
      if (data) { setStudents((prev) => [...prev, data]); showToast(`تمت إضافة ${data.name}`, 'success') }
    }
    setStudentModal({ open: false, student: null })
  }

  const deleteStudent = async (id) => {
    const student = students.find((s) => s.id === id)
    const ok = await askConfirm(`هيتحذف "${student?.name}" وكل سجلاته (حضور، نقاط، درجات) نهائيًا.`, { title: 'تأكيد حذف الطالب', danger: true, confirmLabel: 'حذف نهائي' })
    if (!ok) return
    setStudents((prev) => prev.filter((s) => s.id !== id))
    await supabase.from('students').delete().eq('id', id)
    showToast('اتحذف الطالب', 'success')
  }

  const saveSettings = async (patch) => { await updateSettings(patch); setSettingsOpen(false) }
  const saveTemplates = async (patch) => { await updateSettings(patch); setTemplatesOpen(false) }

  const resetAllData = async () => {
    await supabase.from('exams').delete().eq('teacher_id', effectiveTeacherId)
    await supabase.from('students').delete().eq('teacher_id', effectiveTeacherId)
    setSettingsOpen(false)
    loadAll()
  }

  const saveExam = async ({ title, sections, maxScorePerSection, records }) => {
    const { data: exam } = await supabase.from('exams').insert({
      teacher_id: effectiveTeacherId, title, sections, max_score_per_section: maxScorePerSection,
    }).select().single()

    if (!exam) return

    const passingMark = (maxScorePerSection * sections.length) / 2
    for (const r of records) {
      await supabase.from('exam_scores').insert({
        teacher_id: effectiveTeacherId, exam_id: exam.id, student_id: r.studentId,
        section_scores: r.sectionScores, total_score: r.total,
      })
      const s = students.find((x) => x.id === r.studentId)
      const pointDiff = Math.round(r.total - passingMark)
      if (s) {
        await supabase.from('students').update({ points: s.points + pointDiff }).eq('id', r.studentId)
        await logAction(r.studentId, `امتحان (${title}): الدرجة ${r.total} | تأثير النقاط: ${pointDiff > 0 ? '+' + pointDiff : pointDiff}`, pointDiff)
      }
    }
    setExamOpen(false)
    loadAll()
  }

  // -------------------- WhatsApp --------------------
  const sessionTextFor = (student) => {
    const sess = sessionLogsByGroup[student.group_name]
    if (!sess || (!sess.lesson_topic && !sess.homework_text)) return ''
    let t = '\n\n'
    if (sess.lesson_topic) t += `📚 *درس اليوم:* ${sess.lesson_topic}\n`
    if (sess.homework_text) t += `📝 *الواجب المطلوب:* ${sess.homework_text}`
    return t
  }

  const buildReport = (s, title) => {
    const fields = settings.report_fields || ['rank', 'position', 'points', 'warnings', 'attendance', 'homework', 'session', 'logs']
    const rankPos = getStudentRankPosition(s.id, students)
    const logs = todayLogsByStudent[s.id] || []
    const lines = [`🛡️ *${title}* 🛡️`, '', `👤 *الاسم:* ${s.name}`]
    if (fields.includes('rank')) lines.push(`🎖️ *الرتبة:* ${getStudentRank(s.points, ranks)}`)
    if (fields.includes('position')) lines.push(`🏆 *المركز على الدفعة:* #${rankPos}`)
    if (fields.includes('points')) lines.push(`⭐ *إجمالي النقاط:* ${s.points}`)
    if (fields.includes('warnings')) lines.push(`🚨 *الإنذارات:* ${s.warnings || 0}`)
    if (fields.includes('attendance')) lines.push(`🟢 *الحضور:* ${s.attendance_status}`)
    if (fields.includes('homework')) lines.push(`📚 *الواجب:* ${s.hw_status}`)
    let msg = lines.join('\n')
    if (fields.includes('session')) msg += sessionTextFor(s)
    if (fields.includes('logs') && logs.length) msg += `\n\n📝 *السجل التفصيلي لليوم:*\n- ${logs.map((l) => l.note).join('\n- ')}`
    return msg
  }

  const sendIndividualReport = (s) => {
    sendWhatsApp(s.phone, buildReport(s, 'تقرير متابعة الطالب'))
  }

  const sendTemplateMessage = (s, type) => {
    const tpl = type === 'warning' ? settings.msg_warning : settings.msg_promotion
    sendWhatsApp(s.phone, parseTemplate(tpl, s, ranks))
  }

  const startDailyReportsQueue = () => {
    if (filteredStudents.length === 0) return
    const items = filteredStudents.map((s) => ({ student: s, phone: s.phone, message: `${buildReport(s, 'تقرير اليوم')}\n\n💡 نشكر متابعتكم.` }))
    setQueue({ open: true, items, index: 0 })
  }

  const startBulkMessageQueue = () => {
    const text = prompt('نص الرسالة الجماعية:', settings.msg_welcome)
    if (!text || !text.trim() || filteredStudents.length === 0) return
    const items = filteredStudents.map((s) => ({ student: s, phone: s.phone, message: parseTemplate(text.trim(), s, ranks) }))
    setQueue({ open: true, items, index: 0 })
  }

  // -------------------- Excel --------------------
  const exportExcel = async () => {
    const flat = students.map((s) => ({
      'كود الطالب': s.code, 'الاسم': s.name, 'الهاتف': s.phone, 'المرحلة': s.stage,
      'المجموعة': s.group_name, 'النقاط': s.points, 'الإنذارات': s.warnings || 0,
      'الحضور': s.attendance_status, 'الواجب': s.hw_status,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), 'Students')

    const { data: sessions } = await supabase.from('session_logs').select('*').order('session_date', { ascending: false })
    const sessionsFlat = (sessions ?? []).map((r) => ({
      'التاريخ': r.session_date, 'المجموعة': r.group_name, 'الدرس': r.lesson_topic || '', 'الواجب': r.homework_text || '',
    }))
    if (sessionsFlat.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessionsFlat), 'Sessions')
    }

    XLSX.writeFile(wb, `AlNokhba_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const importExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws)

      // منع التكرار: نطابق حسب الكود لو موجود، وإلا حسب (الاسم + الهاتف) معًا
      const existingByCode = new Map(students.filter((s) => s.code).map((s) => [s.code, s]))
      const existingByNamePhone = new Map(students.map((s) => [`${s.name}|${s.phone || ''}`, s]))

      let updated = 0, inserted = 0
      for (const r of rows) {
        const name = String(r['الاسم'] || '').trim()
        if (!name) continue
        const code = String(r['كود الطالب'] || '').trim()
        const phone = String(r['الهاتف'] || '').trim()
        const match = (code && existingByCode.get(code)) || existingByNamePhone.get(`${name}|${phone}`)

        const payload = {
          name, phone: phone || null, stage: r['المرحلة'] || null, group_name: r['المجموعة'] || null,
          points: parseInt(r['النقاط']) || 0, warnings: parseInt(r['الإنذارات']) || 0,
          attendance_status: r['الحضور'] || 'لم يرصد', hw_status: r['الواجب'] || 'لم يرصد',
        }

        if (match) {
          await supabase.from('students').update(payload).eq('id', match.id)
          updated++
        } else {
          await supabase.from('students').insert({ teacher_id: effectiveTeacherId, code: code || generateStudentCode(), ...payload })
          inserted++
        }
      }
      showToast(`تم الاستيراد: ${inserted} طالب جديد، ${updated} طالب تم تحديثه`, 'success', 5000)
      loadAll()
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  if (!settings) return <div className="min-h-screen flex items-center justify-center bg-brand-bg text-fg-subtle text-sm">جاري التحميل...</div>

  const daysLeft = profile?.subscription_expires_at
    ? Math.max(0, Math.ceil((new Date(profile.subscription_expires_at) - new Date()) / 86400000))
    : null
  const showExpiryBanner = daysLeft !== null && daysLeft <= 5
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور'
  const firstName = (profile?.full_name || '').trim().split(' ')[0]

  const SECTIONS = [
    ['dashboard', '🏠', 'الرئيسية والإحصائيات'],
    ['students', '👥', 'سجل الطلاب والصفوف'],
    ['sessions', '📋', 'الحضور والسلوك'],
    ['exams', '📝', 'دفتر الدرجات'],
    ['games', '🎮', 'الألعاب التفاعلية'],
    ['reports', '📊', 'تقارير أولياء الأمور'],
  ]

  return (
    <div className="min-h-screen flex bg-brand-bg text-fg" dir="rtl">
      {/* الشريط الجانبي — سطح المكتب بس */}
      <aside className="hidden md:flex md:flex-col w-64 bg-[var(--surface)] backdrop-blur-xl border-l border-subtle sticky top-0 h-screen shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-subtle">
          <img src="/logo-icon.png" alt="النخبة" className="w-10 h-10" />
          <div>
            <h1 className="font-black text-base text-fg">النخبة</h1>
            <p className="text-[11px] text-fg-subtle">إدارة الحصص الذكية</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {SECTIONS.map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => (key === 'games' ? setGameModal({ open: true, studentId: null }) : setActiveSection(key))}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold border-r-[3px] transition-all ${
                activeSection === key && key !== 'games'
                  ? 'bg-brand-gold/10 text-fg border-brand-gold'
                  : 'text-fg-subtle border-transparent hover:bg-white/10 hover:text-fg'
              }`}
            >
              <span className="text-lg">{icon}</span>{label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-subtle space-y-1">
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-fg-subtle hover:bg-white/10 hover:text-fg">
            <span className="text-lg">{isLight ? '🌙' : '☀️'}</span> {isLight ? 'الوضع الغامق' : 'الوضع الفاتح'}
          </button>
          <button onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-fg-subtle hover:bg-white/10 hover:text-fg">
            <span className="text-lg">⚙️</span> الإعدادات
          </button>
          {profile?.is_admin && (
            <button onClick={onOpenAdmin}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-violet-400 hover:bg-violet-500/10">
              <span className="text-lg">🛡️</span> لوحة الأدمن
            </button>
          )}
          <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-subtle pt-3">
            <div className="w-9 h-9 rounded-full bg-brand-navy flex items-center justify-center text-brand-gold font-bold text-sm shrink-0">
              {(profile?.full_name || '؟').trim()[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-fg truncate">{profile?.full_name}</p>
              <button onClick={signOut} className="text-[11px] text-fg-subtle hover:text-rose-400">تسجيل الخروج</button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* هيدر الموبايل بس */}
        <header className="md:hidden border-b border-subtle bg-[var(--surface)] backdrop-blur-xl sticky top-0 z-10">
          <div className="px-4 py-3 flex justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <img src="/logo-icon.png" alt="النخبة" className="w-8 h-8" />
              <h1 className="font-black text-base text-fg">النخبة</h1>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell broadcasts={broadcasts} dismissedBroadcasts={dismissedBroadcasts} onDismiss={dismissBroadcast} />
              <button onClick={() => setGameModal({ open: true, studentId: null })} title="الألعاب" className="text-brand-gold-hover text-lg">🎮</button>
              <button onClick={() => setSettingsOpen(true)} title="الإعدادات" className="text-fg-subtle text-lg">⚙️</button>
              {profile?.is_admin && (
                <button onClick={onOpenAdmin} className="text-violet-400 text-sm font-bold">أدمن</button>
              )}
              <button onClick={signOut} className="text-fg-subtle hover:text-rose-400 text-sm">خروج</button>
            </div>
          </div>
        </header>

        {/* شريط علوي رفيع لسطح المكتب: حالة الاشتراك بس */}
        <div className="hidden md:flex items-center justify-between px-6 py-2.5 border-b border-subtle bg-[var(--surface)] backdrop-blur-xl text-xs text-fg-subtle">
          <span>{profile?.full_name}</span>
          <div className="flex items-center gap-4">
            <span>{profile?.subscription_status === 'trial' ? `تجربة مجانية — باقي ${daysLeft} يوم` : 'اشتراك فعّال'}</span>
            <NotificationBell broadcasts={broadcasts} dismissedBroadcasts={dismissedBroadcasts} onDismiss={dismissBroadcast} />
          </div>
        </div>

        {!isOnline && (
          <div className="bg-slate-800 text-white text-xs sm:text-sm text-center py-2 px-4 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            وضع بدون إنترنت — الواجهة شغالة، لكن أي تعديل جديد مش هيتحفظ لحد ما الاتصال يرجع
          </div>
        )}

        {showExpiryBanner && (
          <div className="bg-brand-gold/10 border-b border-brand-gold/30 text-brand-gold-hover text-xs sm:text-sm text-center py-2 px-4">
            ⏳ {daysLeft === 0 ? 'اشتراكك بينتهي النهاردة!' : `باقي ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} بس على انتهاء اشتراكك.`} جدّده دلوقتي عشان بياناتك متتوقفش.
          </div>
        )}

      <main className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto px-4 py-6 space-y-4 pb-24 md:pb-6">
        {/* تنبيهات دايمة الظهور مهما كان القسم المفتوح */}
        {broadcasts.filter((b) => !dismissedBroadcasts.includes(b.id)).map((b) => (
          <div key={b.id} className="bg-violet-500/10 border border-violet-500/30 rounded-xl px-4 py-2.5 flex justify-between items-center gap-3 text-sm">
            <span className="text-violet-300">📢 {b.message}</span>
            <button onClick={() => dismissBroadcast(b.id)} className="text-violet-400 hover:text-violet-300 shrink-0">✕</button>
          </div>
        ))}

        {Object.keys(absenceStreaks).length > 0 && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5 text-sm text-rose-300">
            🚨 غياب متكرر: {students.filter((s) => absenceStreaks[s.id]).map((s) => `${s.name} (${absenceStreaks[s.id]} مرات)`).join('، ')}
          </div>
        )}

        {/* ==================== لوحة التحكم ==================== */}
        {activeSection === 'dashboard' && (
          <>
            <h2 className="text-lg font-bold text-fg">
              👋 {greeting}{firstName ? `، أ. ${firstName}` : ''} — عندك {students.length} طالب موزعين على {groups.length} مجموعة
              {isAssistant && <span className="text-xs text-violet-400 font-normal"> · بتشتغل كمساعد لـ {ownerProfile?.full_name}</span>}
            </h2>

            <DashboardOverview
              students={students} examScoresByStudent={examScoresByStudent} absenceStreaks={absenceStreaks} ranks={ranks}
              onOpenStudent={(s) => setProfileModal({ open: true, student: s })}
            />

            <div className="flex flex-wrap gap-2">
              <ToolBtn onClick={() => setStudentModal({ open: true, student: null })} color="blue">+ طالب</ToolBtn>
              <ToolBtn onClick={() => setQrOpen(true)} color="emerald">📷 تحضير بالـ QR</ToolBtn>
              <ToolBtn onClick={() => setExamOpen(true)} color="purple">📝 رصد امتحان</ToolBtn>
            </div>
          </>
        )}

        {/* ==================== الطلاب ==================== */}
        {activeSection === 'students' && (
          <>
            <div className="flex flex-wrap gap-2">
              <ToolBtn onClick={() => setStudentModal({ open: true, student: null })} color="blue">+ طالب</ToolBtn>
              <ToolBtn onClick={() => setLeaderboardOpen(true)} color="amber">🏆 المتصدرين</ToolBtn>
              <ToolBtn onClick={exportExcel} color="slate">⬇️ تصدير Excel</ToolBtn>
              <label className="cursor-pointer">
                <span className="inline-block glass-input hover:bg-white/10 text-fg-subtle text-xs font-bold px-3 py-2 rounded-lg border border-subtle">⬆️ استيراد Excel</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
              </label>
            </div>

            <div className="grid sm:grid-cols-4 gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم / الهاتف / الكود"
                className="glass-card rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold" />
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="glass-card rounded-lg px-3 py-2 text-sm outline-none">
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="glass-card rounded-lg px-3 py-2 text-sm outline-none">
                <option value="all">المجموعات (الكل)</option>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="glass-card rounded-lg px-3 py-2 text-sm outline-none">
                <option value="all">الحالة (الكل)</option>
                <option value="present">حاضر</option>
                <option value="absent">غائب</option>
                <option value="warning">تراجع أكاديمي 📉</option>
                <option value="hw_missing">واجب ناقص/لم يتم</option>
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="👥 إجمالي الطلاب" value={filteredStudents.length} />
              <StatCard label="✅ الحاضرون" value={stats.present} />
              <StatCard label="❌ الغائبون" value={stats.absent} />
              <StatCard label="📊 متوسط الامتحانات" value={`${stats.avg}%`} />
            </div>

            {selectedIds.size > 0 && (
              <div className="bg-brand-gold/10 border border-brand-gold/40 rounded-xl p-3 flex flex-wrap items-center gap-2">
                <span className="text-brand-gold-hover text-xs font-bold">✅ {selectedIds.size} طالب محدد</span>
                <ToolBtn onClick={() => bulkSetAttendance('حاضر')} color="emerald">تحضير المحددين</ToolBtn>
                <ToolBtn onClick={() => bulkSetAttendance('غائب')} color="rose">تغييب المحددين</ToolBtn>
                <ToolBtn onClick={() => bulkAdjustPoints(settings.points_interact, 'تفاعل جماعي')} color="blue">🌟 +نقاط للمحددين</ToolBtn>
                <ToolBtn onClick={bulkMessage} color="green">📢 رسالة للمحددين</ToolBtn>
                <ToolBtn onClick={() => setSelectedIds(new Set())} color="slate">إلغاء التحديد</ToolBtn>
              </div>
            )}

            <div className="glass-card rounded-2xl overflow-x-auto shadow-lg shadow-black/20">
              {loading ? (
                <SkeletonTableRows rows={5} cols={7} />
              ) : filteredStudents.length === 0 ? (
                students.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div className="text-4xl mb-2">👥</div>
                    <p className="text-fg-muted font-bold">لسه مفيش طلاب مضافين</p>
                    <p className="text-fg-subtle text-sm mt-1 mb-4">ابدأ بإضافة أول طالب عندك</p>
                    <button onClick={() => setStudentModal({ open: true, student: null })}
                      className="btn-glow font-bold px-5 py-2.5 rounded-xl text-sm">
                      + إضافة طالب
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12 px-4">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-fg-muted font-bold">مفيش نتائج مطابقة للفلاتر دي</p>
                    <button onClick={() => { setSearch(''); setStageFilter('الكل'); setGroupFilter('all'); setStatusFilter('all') }}
                      className="text-brand-gold-hover hover:text-fg text-sm font-bold mt-2">
                      إلغاء كل الفلاتر
                    </button>
                  </div>
                )
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1] glass-input">
                    <tr className="border-b border-subtle text-fg-muted text-xs font-bold">
                      <th className="p-3">
                        <input type="checkbox" title="تحديد الكل" checked={filteredStudents.length > 0 && filteredStudents.every((s) => selectedIds.has(s.id))}
                          onChange={toggleSelectAllFiltered} className="w-4 h-4 accent-[#D4A373]" />
                      </th>
                      <th className="p-3">#</th><th className="p-3 text-right">الطالب</th><th className="p-3">المرحلة/المجموعة</th>
                      <th className="p-3">النقاط</th><th className="p-3">الحضور</th><th className="p-3">الواجب</th>
                      <th className="p-3">إجراءات سريعة</th><th className="p-3">رسائل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => (
                      <StudentRow
                        key={s.id} student={s} index={i} ranks={ranks} points={settings}
                        hasWarning={checkAcademicWarning(examScoresByStudent[s.id] || [])}
                        absenceStreak={absenceStreaks[s.id]}
                        selected={selectedIds.has(s.id)} onToggleSelect={() => toggleSelect(s.id)}
                        onOpenProfile={() => setProfileModal({ open: true, student: s })}
                        onSetAttendance={setAttendance} onUpdateHW={updateHW} onAdjustPoints={adjustPoints}
                        onAddWarning={addWarning} onEdit={() => setStudentModal({ open: true, student: s })}
                        onDelete={() => deleteStudent(s.id)}
                        onReport={() => sendIndividualReport(s)}
                        onWarningMsg={() => sendTemplateMessage(s, 'warning')}
                        onPromotionMsg={() => sendTemplateMessage(s, 'promotion')}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ==================== الحصص (حضور + QR + جدول الحصة) ==================== */}
        {activeSection === 'sessions' && (
          <>
            <div className="flex flex-wrap gap-2">
              <ToolBtn onClick={() => setQrOpen(true)} color="emerald">📷 مسح QR</ToolBtn>
              <ToolBtn onClick={markAllPresent} color="emerald">✅ تحضير الكل</ToolBtn>
              <ToolBtn onClick={startNewDay} color="rose">🌅 يوم جديد</ToolBtn>
            </div>

            <div className="glass-card rounded-xl p-3">
              {groups.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-fg-subtle text-sm">لسه معملتش مجموعات. روح ⚙️ الإعدادات وضيف مجموعاتك الأول.</p>
                  <button onClick={() => setSettingsOpen(true)} className="text-brand-gold-hover hover:text-fg text-sm font-bold mt-2">
                    فتح الإعدادات
                  </button>
                </div>
              ) : (
              <>
              {todayGroups.length > 0 && (
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[11px] text-fg-subtle">📅 مجموعات النهاردة:</span>
                  {todayGroups.map((g) => (
                    <button key={g} type="button" onClick={() => setSessionGroup(g)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border ${
                        sessionGroup === g ? 'bg-brand-navy border-brand-gold text-white font-bold' : 'glass-input border-subtle text-fg-subtle'
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-[160px_1fr_1fr_auto_auto] gap-2 items-center">
                <select value={sessionGroup} onChange={(e) => setSessionGroup(e.target.value)}
                  className="glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="">📚 اختر مجموعة</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <input
                  value={sessionDraft.lesson_topic} onChange={(e) => setSessionDraft({ ...sessionDraft, lesson_topic: e.target.value })}
                  placeholder="درس النهاردة" disabled={!sessionGroup}
                  className="glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold disabled:opacity-50"
                />
                <input
                  value={sessionDraft.homework_text} onChange={(e) => setSessionDraft({ ...sessionDraft, homework_text: e.target.value })}
                  placeholder="الواجب" disabled={!sessionGroup}
                  className="glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold disabled:opacity-50"
                />
                <button onClick={saveSessionLog} disabled={!sessionGroup}
                  className="btn-glow disabled:opacity-40 text-xs font-bold px-4 py-2.5 rounded-xl">
                  حفظ
                </button>
                <button onClick={() => sessionGroup && setHistoryModal({ open: true, group: sessionGroup })} disabled={!sessionGroup}
                  className="glass-input hover:bg-white/10 disabled:opacity-40 text-fg-subtle text-xs font-bold px-4 py-2 rounded-lg">
                  📜 السجل
                </button>
              </div>
              </>
              )}
            </div>

            <Charts variant="attendance" present={stats.present} absent={stats.absent} unrecorded={stats.unrecorded} examDatesMap={stats.examDatesMap} />
          </>
        )}

        {/* ==================== الامتحانات ==================== */}
        {activeSection === 'exams' && (
          <>
            <div className="flex flex-wrap gap-2">
              <ToolBtn onClick={() => setExamOpen(true)} color="purple">📝 رصد امتحان</ToolBtn>
              <ToolBtn onClick={() => setExamsListOpen(true)} color="purple">📋 كل الامتحانات</ToolBtn>
            </div>
            {Object.keys(stats.examDatesMap).length === 0 && students.length > 0 && (
              <p className="text-fg-subtle text-sm">لسه مفيش امتحانات مرصودة — دوس "رصد امتحان" لتبدأ.</p>
            )}
            <Charts variant="scores" present={stats.present} absent={stats.absent} unrecorded={stats.unrecorded} examDatesMap={stats.examDatesMap} />
          </>
        )}

        {/* ==================== التقارير ==================== */}
        {activeSection === 'reports' && (
          <div className="space-y-4">
            {students.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center">
                <div className="text-4xl mb-2">📊</div>
                <p className="text-fg-muted font-bold">التقارير هتظهر هنا بعد ما تضيف طلاب</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <ReportCard icon="📊" title="تقارير اليوم" desc="تقرير حضور وأداء كل طالب على واتساب، دفعة واحدة لكل الطلاب المعروضين" action="ابعت تقارير اليوم" onClick={startDailyReportsQueue} />
                <ReportCard icon="📢" title="رسالة جماعية" desc="اكتب رسالة واحدة وابعتها لكل الطلاب المعروضين حاليًا" action="اكتب رسالة" onClick={startBulkMessageQueue} />
                <ReportCard icon="📈" title="لوحة التحليل الكاملة" desc="اتجاه الحضور، توزيع النقاط، الطلاب في خطر، ومقارنة المجموعات" action="افتح التحليل" onClick={() => setAnalyticsOpen(true)} />
                <ReportCard icon="✉️" title="قوالب الرسائل" desc="عدّل نصوص رسائل الترحيب والإنذار والترقية" action="عدّل القوالب" onClick={() => setTemplatesOpen(true)} />
              </div>
            )}
          </div>
        )}
      </main>
      </div>

      {/* زرار إجراءات سريعة عائم — متاح من أي قسم من غير ما تتنقل */}
      <div className="fixed bottom-20 md:bottom-6 left-4 z-30">
        {fabOpen && (
          <div className="mb-2 space-y-2 flex flex-col items-start">
            <FabAction icon="+" label="طالب جديد" onClick={() => { setStudentModal({ open: true, student: null }); setFabOpen(false) }} />
            <FabAction icon="📷" label="مسح QR" onClick={() => { setQrOpen(true); setFabOpen(false) }} />
            <FabAction icon="📝" label="رصد امتحان" onClick={() => { setExamOpen(true); setFabOpen(false) }} />
          </div>
        )}
        <button
          onClick={() => setFabOpen((o) => !o)}
          className="w-14 h-14 rounded-full btn-glow shadow-lg flex items-center justify-center text-2xl font-black transition-transform"
          style={{ transform: fabOpen ? 'rotate(45deg)' : 'none' }}
          title="إجراءات سريعة"
        >
          +
        </button>
      </div>

      {/* شريط تنقل سفلي — للموبايل بس */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[var(--surface)] backdrop-blur-xl border-t border-subtle flex justify-around items-center py-1.5 z-20">
        {SECTIONS.filter(([key]) => key !== 'games').map(([key, icon, label]) => (
          <button
            key={key} onClick={() => setActiveSection(key)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] font-bold ${
              activeSection === key ? 'text-brand-gold-hover' : 'text-fg-subtle'
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span className="truncate max-w-[56px]">{label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      {/* Modals */}
      <StudentModal open={studentModal.open} student={studentModal.student} groups={groups}
        onClose={() => setStudentModal({ open: false, student: null })} onSave={saveStudent} />

      <ProfileModal open={profileModal.open} student={profileModal.student} allStudents={students}
        exams={examScoresByStudent[profileModal.student?.id] || []} dailyLogs={todayLogsByStudent[profileModal.student?.id] || []}
        session={sessionLogsByGroup[profileModal.student?.group_name]}
        ranks={ranks} onClose={() => setProfileModal({ open: false, student: null })}
        onEdit={(s) => { setProfileModal({ open: false, student: null }); setStudentModal({ open: true, student: s }) }}
        onPlayGame={(s) => { setProfileModal({ open: false, student: null }); setGameModal({ open: true, studentId: s.id }) }} />

      <QRScannerModal open={qrOpen} onClose={() => setQrOpen(false)} students={students}
        onMarkPresent={(id) => setAttendance(id, 'حاضر')} />

      <LeaderboardModal open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} students={students} ranks={ranks} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} onResetAllData={resetAllData} teacherId={effectiveTeacherId} teacherEmail={profile?.email || user?.email} isAssistant={isAssistant} />
      <TemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} settings={settings} onSave={saveTemplates} />
      <ExamModal open={examOpen} onClose={() => setExamOpen(false)} students={filteredStudents} onSave={saveExam} />
      <ExamsListModal open={examsListOpen} onClose={() => setExamsListOpen(false)} />
      <AnalyticsModal open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} students={students} examScoresByStudent={examScoresByStudent} />
      <GamesHubModal open={gameModal.open} students={students}
        isGamesUnlocked={unlockedFeatures.has('games')}
        initialGame={gameModal.studentId ? 'catch_mistake' : null} initialStudentId={gameModal.studentId}
        onClose={() => setGameModal({ open: false, studentId: null })}
        onAwardPoints={(id, pts) => adjustPoints(id, pts, 'لعبة امسك الغلط 🎮')} />
      <MessageQueueModal open={queue.open} queue={queue.items} index={queue.index}
        onClose={() => setQueue({ open: false, items: [], index: 0 })}
        onAdvance={() => setQueue((q) => (q.index + 1 >= q.items.length ? { open: false, items: [], index: 0 } : { ...q, index: q.index + 1 }))} />
      <SessionHistoryModal open={historyModal.open} groupName={historyModal.group}
        onClose={() => setHistoryModal({ open: false, group: null })} />

      <ConfirmDialog
        open={!!confirmDialog} title={confirmDialog?.title} message={confirmDialog?.message}
        danger={confirmDialog?.danger} confirmLabel={confirmDialog?.confirmLabel}
        onConfirm={() => { confirmDialog.resolve(true); setConfirmDialog(null) }}
        onCancel={() => { confirmDialog.resolve(false); setConfirmDialog(null) }}
      />
    </div>
  )
}

function ToolBtn({ onClick, color, children }) {
  const colors = {
    blue: 'bg-brand-gold/15 text-brand-gold-hover border-brand-gold/40 hover:bg-brand-gold/25',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
    purple: 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
    green: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/50 hover:bg-[#25D366]/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
    slate: 'glass-input text-fg-muted border-subtle hover:bg-white/10',
  }
  return (
    <button onClick={onClick} className={`text-xs font-bold px-3 py-2 rounded-lg border transition-all ${colors[color]}`}>
      {children}
    </button>
  )
}

function FabAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 glass-card shadow-lg rounded-full pl-4 pr-2 py-2 text-sm font-bold text-fg hover:border-brand-gold/50">
      {label}
      <span className="w-8 h-8 rounded-full bg-brand-navy text-brand-gold flex items-center justify-center text-sm">{icon}</span>
    </button>
  )
}

function ReportCard({ icon, title, desc, action, onClick }) {
  return (
    <div className="glass-card rounded-xl p-4 shadow-lg shadow-black/20 card-hover">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="font-bold text-fg text-sm mb-1">{title}</p>
      <p className="text-fg-subtle text-xs mb-3 leading-relaxed">{desc}</p>
      <button onClick={onClick} className="text-brand-gold-hover hover:text-fg text-xs font-bold">{action} ←</button>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="glass-card rounded-xl p-3 text-center">
      <p className="text-2xl font-black text-fg">{value}</p>
      <p className="text-fg-subtle text-xs mt-1">{label}</p>
    </div>
  )
}

function StudentRow({
  student: s, index, ranks, points, hasWarning, absenceStreak, selected, onToggleSelect,
  onOpenProfile, onSetAttendance, onUpdateHW, onAdjustPoints, onAddWarning, onEdit, onDelete,
  onReport, onWarningMsg, onPromotionMsg,
}) {
  const rank = getStudentRank(s.points, ranks)
  return (
    <tr className={`border-b border-subtle hover:bg-brand-gold/5 transition-colors ${selected ? 'bg-brand-gold/10' : index % 2 === 1 ? 'bg-white/[0.03]' : 'bg-transparent'}`}>
      <td className="p-3 text-center">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 accent-[#D4A373]" />
      </td>
      <td className="p-3 text-center text-fg-subtle font-bold">{index + 1}</td>
      <td className="p-3">
        <div className="flex items-center gap-1">
          {hasWarning && <span className="text-rose-400 text-sm" title="تراجع أكاديمي">📉</span>}
          {absenceStreak && <span className="text-rose-400 text-sm" title={`غياب متكرر (${absenceStreak} مرات)`}>🚨</span>}
          {s.warnings > 0 && <span className="text-rose-400 font-black text-[10px] bg-rose-500/20 px-1 rounded border border-rose-500/30">{s.warnings} 🚨</span>}
          <button onClick={onOpenProfile} className="font-black text-brand-gold-hover hover:text-brand-gold-hover">{s.name}</button>
        </div>
        <span className="text-[10px] text-fg-subtle font-mono glass-input px-1 rounded" dir="ltr">{s.code || 'N/A'}</span>
      </td>
      <td className="p-3 text-center text-xs">
        <div className="font-semibold text-fg">{s.stage}</div>
        <div className="text-fg-subtle">{s.group_name}</div>
      </td>
      <td className="p-3 text-center">
        <div className="text-lg font-black text-brand-gold-hover">{s.points} pt</div>
        <div className="text-[10px] text-brand-gold-hover/80 font-bold">🛡️ {rank}</div>
      </td>
      <td className="p-3 text-center">
        <div className="flex glass-input rounded p-0.5 border border-subtle w-fit mx-auto">
          <button onClick={() => onSetAttendance(s.id, 'حاضر')} className={`px-2 py-1 rounded text-xs font-bold ${s.attendance_status === 'حاضر' ? 'bg-emerald-600 text-fg' : 'text-fg-subtle'}`}>ح</button>
          <button onClick={() => onSetAttendance(s.id, 'غائب')} className={`px-2 py-1 rounded text-xs font-bold ${s.attendance_status === 'غائب' ? 'bg-rose-600 text-fg' : 'text-fg-subtle'}`}>غ</button>
        </div>
      </td>
      <td className="p-3 text-center">
        <select value={s.hw_status} onChange={(e) => onUpdateHW(s.id, e.target.value)} className="text-xs rounded p-1.5 font-bold border outline-none glass-input border-subtle text-fg-muted">
          <option value="لم يرصد">- الواجب -</option>
          <option value="مكتمل">✅ مكتمل</option>
          <option value="ناقص">⚠️ ناقص</option>
          <option value="لم يتم">❌ لم يتم</option>
        </select>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1 justify-center flex-wrap max-w-[160px] mx-auto">
          <button onClick={() => onAdjustPoints(s.id, points.points_interact, 'إجابة وتفاعل')} title="تفاعل +" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-1 rounded text-xs">🌟</button>
          <button onClick={() => onAdjustPoints(s.id, 5, 'إجابة ذهبية')} title="إجابة ذهبية" className="bg-brand-gold/10 text-brand-gold-hover border border-brand-gold/40 px-1.5 py-1 rounded text-xs">🧠</button>
          <button onClick={() => onAdjustPoints(s.id, 3, 'مساعدة زميل')} title="مساعدة زميل" className="bg-brand-gold/15 text-brand-gold-hover border border-brand-gold/40 px-1.5 py-1 rounded text-xs">🤝</button>
          <button onClick={() => onAdjustPoints(s.id, -2, 'تأخير عن موعد الحصة')} title="تأخير" className="bg-violet-500/10 text-violet-400 border border-violet-500/30 px-1.5 py-1 rounded text-xs">⏰</button>
          <button onClick={() => onAdjustPoints(s.id, points.points_interrupt, 'مخالفة سلوكية')} title="مشاغبة" className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1.5 py-1 rounded text-xs">⚠️</button>
          <button onClick={() => onAddWarning(s.id)} title="إنذار مباشر" className="bg-red-600/20 text-red-400 border border-red-500/50 px-1.5 py-1 rounded text-xs">🚨</button>
        </div>
      </td>
      <td className="p-3">
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-1">
            <button onClick={onReport} title="تقرير شامل" className="bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/50 p-1.5 rounded-lg">📊</button>
            <button onClick={onWarningMsg} title="إرسال إنذار" className="bg-rose-500/10 text-rose-400 border border-rose-500/30 p-1.5 rounded-lg">⚠️</button>
            <button onClick={onPromotionMsg} title="رسالة ترقية" className="bg-brand-gold/10 text-brand-gold-hover border border-brand-gold/40 p-1.5 rounded-lg">🎉</button>
          </div>
          <div className="flex gap-2 text-sm">
            <button onClick={onEdit} title="تعديل بيانات الطالب" className="text-brand-gold-hover hover:text-brand-gold-hover">✏️</button>
            <button onClick={onDelete} title="حذف الطالب" className="text-rose-400 hover:text-rose-300">🗑️</button>
          </div>
        </div>
      </td>
    </tr>
  )
}
