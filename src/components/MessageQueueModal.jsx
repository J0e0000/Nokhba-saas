import Modal from './Modal'
import { sendWhatsApp } from '../lib/helpers'

export default function MessageQueueModal({ open, onClose, queue, index, onAdvance }) {
  if (!open || index >= queue.length) return null
  const item = queue[index]

  const send = () => {
    sendWhatsApp(item.phone, item.message)
    setTimeout(onAdvance, 400)
  }

  return (
    <Modal open={open} onClose={onClose} title={`إرسال (${index + 1}/${queue.length})`}>
      <p className="text-sm mb-2"><strong>الطالب:</strong> {item.student.name}</p>
      <div className="glass-input p-3 rounded text-xs whitespace-pre-line text-fg-subtle max-h-48 overflow-y-auto mb-4">
        {item.message}
      </div>
      <div className="flex gap-2">
        <button onClick={send} className="flex-1 bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/50 font-bold py-2 rounded-lg text-sm">
          إرسال WhatsApp
        </button>
        <button onClick={onAdvance} className="flex-1 glass-input hover:bg-white/10 text-fg-subtle font-bold py-2 rounded-lg text-sm">
          تخطي
        </button>
        <button onClick={onClose} className="flex-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold py-2 rounded-lg text-sm">
          إيقاف
        </button>
      </div>
    </Modal>
  )
}
