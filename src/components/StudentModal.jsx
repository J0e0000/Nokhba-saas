import { useEffect, useState } from 'react'
import Modal from './Modal'
import { sanitizePhone, GRADES_BY_STAGE } from '../lib/helpers'

const FIRST_STAGE = Object.values(GRADES_BY_STAGE)[0][0]

export default function StudentModal({ open, onClose, onSave, student, groups }) {
  const [form, setForm] = useState({ name: '', phone: '', stage: FIRST_STAGE, group: groups?.[0] || '' })

  useEffect(() => {
    if (student) {
      setForm({ name: student.name, phone: student.phone || '', stage: student.stage, group: student.group })
    } else {
      setForm({ name: '', phone: '', stage: FIRST_STAGE, group: groups?.[0] || '' })
    }
  }, [student, open, groups])

  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({ ...form, phone: sanitizePhone(form.phone) })
  }

  return (
    <Modal open={open} onClose={onClose} title={student ? 'تعديل بيانات الطالب' : 'إضافة طالب'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm text-fg-subtle mb-1">اسم الطالب</label>
          <input
            required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold"
          />
        </div>
        <div>
          <label className="block text-sm text-fg-subtle mb-1">رقم الهاتف (واتساب)</label>
          <input
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr"
            className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-fg-subtle mb-1">المرحلة</label>
            <select
              value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}
              className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold"
            >
              {Object.entries(GRADES_BY_STAGE).map(([category, grades]) => (
                <optgroup key={category} label={category}>
                  {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-fg-subtle mb-1">المجموعة</label>
            <select
              value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}
              className="w-full glass-input border border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-gold"
            >
              {(groups || []).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <button className="w-full btn-glow font-bold py-3 rounded-xl text-sm mt-2">
          حفظ
        </button>
      </form>
    </Modal>
  )
}
