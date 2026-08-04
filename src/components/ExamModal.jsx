import { useState, useRef } from 'react'
import Modal from './Modal'

const TEMPLATES = {
  'شامل': { title: 'امتحان شامل', sections: 'نحو, نصوص, أدب, بلاغة, قراءة', max: 10 },
  'قراءة': { title: 'تطبيق قراءة', sections: 'قراءة, قصة', max: 15 },
  'تسميع': { title: 'تسميع سريع', sections: 'تسميع, بلاغة', max: 5 },
}

export default function ExamModal({ open, onClose, students, onSave }) {
  const [phase, setPhase] = useState('setup') // setup | grading
  const [title, setTitle] = useState('')
  const [sectionsStr, setSectionsStr] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [sections, setSections] = useState([])
  const [scores, setScores] = useState({}) // { studentId: { section: value } }
  const inputRefs = useRef({}) // key `${row}-${col}` -> input element

  const focusCell = (row, col) => {
    const el = inputRefs.current[`${row}-${col}`]
    if (el) el.focus()
  }

  const handleKeyDown = (e, row, col) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Enter: التالي في نفس الصف، ولو آخر عمود ينتقل لأول عمود في الصف التالي (زي إكسل)
    if (col + 1 < sections.length) focusCell(row, col + 1)
    else if (row + 1 < students.length) focusCell(row + 1, 0)
  }

  const applyTemplate = (key) => {
    const t = TEMPLATES[key]
    if (!t) return
    setTitle(t.title); setSectionsStr(t.sections); setMaxScore(String(t.max))
  }

  const startGrading = () => {
    const secs = sectionsStr.split(',').map((s) => s.trim()).filter(Boolean)
    if (!title.trim() || secs.length === 0 || !maxScore) return
    setSections(secs)
    const initial = {}
    students.forEach((s) => { initial[s.id] = Object.fromEntries(secs.map((sec) => [sec, ''])) })
    setScores(initial)
    setPhase('grading')
  }

  const rowTotal = (studentId) =>
    Object.values(scores[studentId] || {}).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  const setScore = (studentId, section, value) => {
    setScores((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [section]: value } }))
  }

  const save = () => {
    const max = parseFloat(maxScore)
    const records = students.map((s) => {
      const sectionScores = {}
      let total = 0
      sections.forEach((sec) => {
        const v = parseFloat(scores[s.id]?.[sec]) || 0
        sectionScores[sec] = v
        total += v
      })
      return { studentId: s.id, sectionScores, total }
    })
    onSave({ title: title.trim(), sections, maxScorePerSection: max, records })
    reset()
  }

  const reset = () => {
    setPhase('setup'); setTitle(''); setSectionsStr(''); setMaxScore(''); setSections([]); setScores({})
  }

  const handleClose = () => { reset(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="رصد امتحان" wide>
      {phase === 'setup' ? (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {Object.keys(TEMPLATES).map((k) => (
              <button key={k} type="button" onClick={() => applyTemplate(k)}
                className="text-xs glass-input border border-subtle rounded-lg px-3 py-1.5 text-fg-subtle hover:border-brand-gold">
                {k}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm text-fg-subtle mb-1">عنوان الامتحان</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold" />
          </div>
          <div>
            <label className="block text-sm text-fg-subtle mb-1">الأقسام (افصل بفاصلة)</label>
            <input value={sectionsStr} onChange={(e) => setSectionsStr(e.target.value)}
              className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold" />
          </div>
          <div>
            <label className="block text-sm text-fg-subtle mb-1">الدرجة العظمى لكل قسم</label>
            <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} dir="ltr"
              className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold" />
          </div>
          <button onClick={startGrading} className="w-full btn-glow font-bold py-3 rounded-xl text-sm">
            بدء الرصد
          </button>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface)] backdrop-blur">
                <tr className="border-b border-subtle text-fg-subtle">
                  <th className="p-2 text-right">الطالب</th>
                  {sections.map((sec) => <th key={sec} className="p-2 text-center">{sec} ({maxScore})</th>)}
                  <th className="p-2 text-center">المجموع</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, rowIdx) => (
                  <tr key={s.id} className="border-b border-subtle">
                    <td className="p-2 font-bold text-fg">{s.name}</td>
                    {sections.map((sec, colIdx) => (
                      <td key={sec} className="p-1">
                        <input
                          ref={(el) => { inputRefs.current[`${rowIdx}-${colIdx}`] = el }}
                          type="number" step="0.5" min="0" max={maxScore} dir="ltr"
                          value={scores[s.id]?.[sec] ?? ''}
                          onChange={(e) => setScore(s.id, sec, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          className="w-20 text-center glass-input border border-subtle rounded p-1.5 text-sm outline-none focus:border-brand-gold"
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center font-black text-violet-400">{rowTotal(s.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={save} className="w-full bg-emerald-600 hover:bg-emerald-500 text-fg font-bold py-2.5 rounded-lg text-sm mt-4">
            حفظ الدرجات وتحديث النقاط
          </button>
        </div>
      )}
    </Modal>
  )
}
