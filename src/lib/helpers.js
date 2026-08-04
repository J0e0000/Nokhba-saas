// دوال مساعدة مشتركة — نفس منطق النسخة الأصلية بالظبط

export const STAGE_CATEGORIES = ['ابتدائي', 'إعدادي', 'ثانوي']

export const GRADES_BY_STAGE = {
  'ابتدائي': ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'],
  'إعدادي': ['الأول الإعدادي', 'الثاني الإعدادي', 'الثالث الإعدادي'],
  'ثانوي': ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'],
}

export function generateStudentCode() {
  return 'F-' + Math.floor(10000 + Math.random() * 90000)
}

export function sanitizePhone(phone) {
  let p = String(phone || '').trim().replace(/\D/g, '')
  if (p.startsWith('01') && p.length === 11) p = '2' + p
  else if (p.startsWith('1') && p.length === 10) p = '20' + p
  return p
}

export function getStudentRank(points, ranks) {
  if (!ranks || ranks.length === 0) return ''
  let title = ranks[0].title
  for (const r of ranks) { if (points >= r.min) title = r.title }
  return title
}

export function getStudentRankPosition(studentId, allStudents) {
  const sorted = [...allStudents].sort((a, b) => b.points - a.points)
  const index = sorted.findIndex((s) => s.id === studentId)
  return index !== -1 ? index + 1 : '-'
}

// طالب فيه تراجع أكاديمي: آخر امتحانين والنسبة نزلت 15% أو أكتر
export function checkAcademicWarning(exams) {
  if (!exams || exams.length < 2) return false
  const last = exams[exams.length - 1]
  const prev = exams[exams.length - 2]
  const lastSections = Object.keys(last.section_scores || {}).length
  const prevSections = Object.keys(prev.section_scores || {}).length
  if (lastSections === 0 || prevSections === 0) return false
  const lastPct = (last.total_score / (last.max_score_per_section * lastSections)) * 100
  const prevPct = (prev.total_score / (prev.max_score_per_section * prevSections)) * 100
  return (prevPct - lastPct) >= 15
}

export function parseTemplate(templateStr, student, ranks) {
  return (templateStr || '')
    .replace(/{studentName}/g, student.name)
    .replace(/{rank}/g, getStudentRank(student.points, ranks))
}

export function sendWhatsApp(phone, message) {
  window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`, '_blank')
}
