import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type ToastTone = 'success' | 'error' | 'warning' | 'info'
type ToastItem = { id: number; message: string; tone: ToastTone }
const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null)

function inferTone(message: string): ToastTone {
  if (/ما قدرنا|ما انحفظ|ما تمت|ما انضاف|ما انرسل|تعذر|خطأ|غير صحيح|غير صحيحة|ناقص/.test(message)) return 'error'
  if (/اختار|اكتب|أدخل|تحقق|لازم|انتظر|بانتظار|غير مؤكدة|لا يكفي|ما في رصيد/.test(message)) return 'warning'
  if (/تم |تمت |انحفظ|انحذف|انرسل|انضاف|انضافت|انطلق|انلغى|انعكس|انعكست|تأكد|وافق|الرابط جاهز|تم نسخ/.test(message)) return 'success'
  return 'info'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const nextId = useRef(0)
  const lastToast = useRef<{ message: string; time: number } | null>(null)
  const showToast = useCallback((message: string, tone?: ToastTone) => {
    const clean = message.trim()
    if (!clean) return
    const now = Date.now()
    if (lastToast.current?.message === clean && now - lastToast.current.time < 900) return
    lastToast.current = { message: clean, time: now }
    setToast({ id: ++nextId.current, message: clean, tone: tone ?? inferTone(clean) })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])
  return <ToastContext.Provider value={showToast}>{children}<ToastViewport toast={toast} onDismiss={dismissToast} /></ToastContext.Provider>
}

function ToastViewport({ toast, onDismiss }: { toast: ToastItem | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onDismiss, toast.tone === 'error' ? 5200 : 3900)
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])
  if (!toast) return null
  const icon = toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '×' : toast.tone === 'warning' ? '!' : 'i'
  const label = toast.tone === 'success' ? 'تم بنجاح' : toast.tone === 'error' ? 'صار خطأ' : toast.tone === 'warning' ? 'تنبيه' : 'معلومة'
  return <div className="toast-viewport" aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}><div className={`app-toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} key={toast.id}>
    <span className="toast-icon" aria-hidden="true">{icon}</span><div className="toast-copy"><small>{label}</small><p>{toast.message}</p></div><button className="toast-close" type="button" aria-label="إغلاق التنبيه" onClick={onDismiss}>×</button><span className="toast-progress" />
  </div></div>
}

export function useToastMessage(): [string, (message: string) => void] {
  const [message, setMessageState] = useState('')
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToastMessage must be used inside ToastProvider')
  const setMessage = useCallback((next: string) => { setMessageState(next); if (next) showToast(next) }, [showToast])
  return [message, setMessage]
}
