import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@labbayk/shared/database.types'
import { supabase, supabaseConfigured } from './lib/supabase'
import { getAdminBackendHealth, subscribeAdminBackendHealth, type AdminBackendHealth } from './lib/network-health'
import './App.css'
import './pricing.css'
import './auth.css'
import './overview.css'
import './users.css'
import './wallet.css'
import './drivers.css'
import './admin-redesign.css'
import './toast.css'
import './theme.css'
import './skeleton.css'
import { ToastProvider, useToastMessage } from './toast'

const nav = ['نظرة عامة', 'الطلبات', 'السائقون', 'المستخدمون', 'التسعير', 'التسويات', 'التنبيهات', 'الدعم والنزاعات', 'الإعدادات']
const numberFormatter = new Intl.NumberFormat('en-US')
const arabicNumberFormatter = new Intl.NumberFormat('ar-SY')
const mediumDateFormatter = new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium' })
const shortDateTimeFormatter = new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' })
const headerDateFormatter = new Intl.DateTimeFormat('ar-SY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
type Zone = Database['public']['Tables']['service_zones']['Row']
type AdminOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'customer_id'|'address_id'|'request_text'|'status'|'delivery_fee_minor'|'delivery_quote_set_at'|'driver_id'|'purchase_amount_minor'|'created_at'|'shopping_admin_alerted_at'|'delivery_admin_alerted_at'>
type AvailableDriver = Pick<Database['public']['Tables']['driver_profiles']['Row'], 'user_id'|'vehicle_description'>
type DriverApplication = Pick<Database['public']['Tables']['driver_profiles']['Row'], 'user_id'|'review_status'|'vehicle_description'|'created_at'|'is_online'> & { email: string; display_name: string }
type DriverInvite = Pick<Database['public']['Tables']['driver_invites']['Row'], 'id'|'expires_at'|'redeemed_at'|'revoked_at'|'created_at'>
type PricingAudit = Pick<Database['public']['Tables']['admin_audit_log']['Row'], 'id'|'action'|'entity_type'|'entity_id'|'reason'|'before_data'|'after_data'|'created_at'>
type AdminDirectoryUser = Database['public']['Functions']['admin_list_users']['Returns'][number]
type Access = 'loading' | 'signed-out' | 'unauthorized' | 'admin' | 'error'
const orderStates = [{ value:'requested', label:'وارد جديد' }, { value:'searching', label:'عم ندور على سائق' }, { value:'accepted', label:'قبل السائق الطلب' }, { value:'quoted', label:'تم التسعير' }, { value:'assigned', label:'تم تعيين سائق' }, { value:'shopping', label:'قيد التسوق' }, { value:'awaiting_approval', label:'بانتظار الموافقة' }, { value:'purchased', label:'تم الشراء' }, { value:'delivering', label:'قيد التوصيل' }, { value:'delivered', label:'تم التسليم' }, { value:'settled', label:'تمت التسوية' }, { value:'disputed', label:'قيد مراجعة الدعم' }, { value:'cancelled', label:'ملغي' }]

function AppContent() {
  const [user, setUser] = useState<User | null>(null)
  const [access, setAccess] = useState<Access>(supabaseConfigured ? 'loading' : 'signed-out')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return window.localStorage.getItem('labbayk-admin-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const [active, setActive] = useState(nav[0])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [forgotPassword, setForgotPassword] = useState(false)
  const [recoveryCodeSent, setRecoveryCodeSent] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useToastMessage()
  const [authMessageTone, setAuthMessageTone] = useState<'success' | 'error'>('success')
  const [authCooldown, setAuthCooldown] = useState(0)
  const authRequestInFlight = useRef(false)
  const verifiedAdminUserId = useRef<string | null>(null)
  const accessCheckSequence = useRef(0)
  const checkAccessRef = useRef<((nextUser: User | null) => void) | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { window.localStorage.setItem('labbayk-admin-theme', theme) } catch { /* storage may be disabled */ }
  }, [theme])
  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')

  useEffect(() => {
    if (authCooldown <= 0) return
    const timer = window.setTimeout(() => setAuthCooldown((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [authCooldown])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let alive = true
    const checkAccess = async (nextUser: User | null) => {
      if (!alive) return
      const sequence = ++accessCheckSequence.current
      setUser(nextUser)
      if (!nextUser) { verifiedAdminUserId.current = null; setAccess('signed-out'); return }
      const previouslyVerifiedAdmin = verifiedAdminUserId.current === nextUser.id
      if (!previouslyVerifiedAdmin) setAccess('loading')
      const { data, error } = await client.from('user_roles').select('role').eq('user_id', nextUser.id).eq('role', 'super_admin').maybeSingle()
      if (!alive || sequence !== accessCheckSequence.current) return
      if (error) {
        // A transient query failure is not proof that an already-authorized admin lost access.
        if (!previouslyVerifiedAdmin) setAccess('error')
        return
      }
      if (data) { verifiedAdminUserId.current = nextUser.id; setAccess('admin') }
      else { verifiedAdminUserId.current = null; setAccess('unauthorized') }
    }
    checkAccessRef.current = (nextUser) => { void checkAccess(nextUser) }
    const startupSequence = accessCheckSequence.current
    void client.auth.getSession().then(({ data, error }) => {
      if (!alive || startupSequence !== accessCheckSequence.current) return
      if (error) { setAccess(verifiedAdminUserId.current ? 'admin' : 'error'); return }
      void checkAccess(data.session?.user ?? null)
    }).catch(() => {
      if (alive && startupSequence === accessCheckSequence.current) setAccess(verifiedAdminUserId.current ? 'admin' : 'error')
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) return
      const sequence = ++accessCheckSequence.current
      if (event === 'SIGNED_OUT') verifiedAdminUserId.current = null
      setTimeout(() => {
        if (alive && sequence === accessCheckSequence.current) void checkAccess(session?.user ?? null)
      }, 0)
    })
    return () => { alive = false; checkAccessRef.current = null; subscription.unsubscribe() }
  }, [])

  const signInAdmin = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) { setAuthMessageTone('error'); setAuthMessage('إعداد الاتصال بخدمة الدخول ناقص.'); return }
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setAuthMessageTone('error'); setAuthMessage('أدخل بريد المدير أولاً.'); return }
    if (!password) { setAuthMessageTone('error'); setAuthMessage('اكتب كلمة السر أولاً.'); return }
    if (authRequestInFlight.current) return
    authRequestInFlight.current = true
    setAuthBusy(true); setAuthMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password })
      if (error) {
        setAuthMessageTone('error')
        setAuthMessage('البريد أو كلمة السر غير صحيحة. تأكد منهم وجرب مرة ثانية.')
        return
      }
      setAuthMessage('')
    } catch {
      setAuthMessageTone('error')
      setAuthMessage('صار خلل بالاتصال أثناء تسجيل الدخول. تحقق من الإنترنت وحاول لاحقاً.')
    } finally {
      authRequestInFlight.current = false
      setAuthBusy(false)
    }
  }
  const requestPasswordReset = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    if (!supabase) { setAuthMessageTone('error'); setAuthMessage('إعداد الاتصال بخدمة الدخول ناقص.'); return }
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setAuthMessageTone('error'); setAuthMessage('أدخل بريد المدير أولاً.'); return }
    if (authCooldown > 0 || authRequestInFlight.current) return
    authRequestInFlight.current = true
    setAuthBusy(true); setAuthMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo: window.location.origin })
      if (error) {
        const rateLimited = error.status === 429 || error.code?.includes('rate_limit')
        setAuthMessageTone('error')
        setAuthMessage(rateLimited ? 'طلبنا رمز قبل شوي. انتظر دقيقة قبل إعادة الإرسال.' : 'ما قدرنا نبعت رمز تغيير كلمة السر. تحقق من الاتصال وجرب لاحقاً.')
        if (rateLimited) setAuthCooldown(60)
        return
      }
      setRecoveryCodeSent(true)
      setAuthMessageTone('success')
      setAuthMessage('إذا كان البريد مرتبطاً بحساب، رح يصلك رمز تغيير كلمة السر. تفقد بريدك والرسائل غير المرغوبة.')
      setAuthCooldown(60)
    } catch {
      setAuthMessageTone('error')
      setAuthMessage('صار خلل بالاتصال أثناء طلب رمز التغيير.')
    } finally {
      authRequestInFlight.current = false
      setAuthBusy(false)
    }
  }
  const verifyRecoveryCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setAuthMessageTone('error'); setAuthMessage('أدخل بريد المدير أولاً.'); return }
    if (!recoveryCode.trim()) { setAuthMessageTone('error'); setAuthMessage('أدخل رمز تغيير كلمة السر.'); return }
    setAuthBusy(true); setAuthMessage('')
    try {
      const { error } = await supabase.auth.verifyOtp({ email: normalized, token: recoveryCode.trim(), type: 'recovery' })
      if (error) { setAuthMessageTone('error'); setAuthMessage('الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزاً جديداً وجرب مرة ثانية.'); return }
      setAuthMessage('')
    } catch {
      setAuthMessageTone('error')
      setAuthMessage('ما قدرنا نتحقق من الرمز. تحقق من الاتصال وجرب مرة ثانية.')
    } finally {
      setAuthBusy(false)
    }
  }
  const saveNewPassword = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    if (newPassword.length < 8) { setAuthMessageTone('error'); setAuthMessage('كلمة السر لازم تكون 8 أحرف على الأقل.'); return }
    setAuthBusy(true); setAuthMessage('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setAuthBusy(false)
    if (error) { setAuthMessageTone('error'); setAuthMessage('ما قدرنا نحدّث كلمة السر. اطلب رمز استعادة جديد وجرب.'); return }
    setPasswordRecovery(false); setForgotPassword(false); setRecoveryCodeSent(false); setRecoveryCode(''); setNewPassword('');
    setAuthMessageTone('success'); setAuthMessage('تم تغيير كلمة السر.');
  }
  if (passwordRecovery || access !== 'admin') return <div className="gate" dir="rtl">
    <div className="gate-card">
      <a className="brand gate-brand" href="#home"><img className="brand-logo" src="/labbayk-delivery-logo.png" alt=""/><span>لَبّيك<small>مساحة فريق التشغيل</small></span></a>
      {!supabaseConfigured ? <GateNotice title="إعداد الاتصال ناقص" detail="أضف إعدادات Supabase المحلية حتى نقدر نفتح جلسة آمنة." /> : passwordRecovery ? <>
        <div className="gate-icon">↗</div><h1>كلمة سر جديدة</h1><p>اختر كلمة سر من 8 أحرف على الأقل.</p>
        <form className="auth-form" noValidate onSubmit={saveNewPassword}><label>كلمة السر الجديدة<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" type="password" minLength={8} required /></label><button className="primary-button full-button" disabled={authBusy}>{authBusy ? 'عم نحفظ…' : 'حفظ كلمة السر'}</button></form>
        {authMessage && <p className={`auth-message ${authMessageTone}`} role={authMessageTone === 'error' ? 'alert' : 'status'} aria-live={authMessageTone === 'error' ? 'assertive' : 'polite'}>{authMessage}</p>}
      </> : access === 'loading' ? <GateNotice title="عم نتحقق من صلاحية الحساب" detail="لحظة واحدة، عم نتأكد من الجلسة ودور الحساب." /> : access === 'error' ? <>
        <div className="gate-icon">⌁</div><h1>تعذر التحقق من صلاحية الحساب</h1><p>الاتصال غير مستقر حالياً. الحسابات التي سبق التحقق منها تبقى مفتوحة؛ جرّب إعادة التحقق.</p><button className="primary-button full-button" onClick={() => { setAccess('loading'); checkAccessRef.current?.(user) }}>إعادة المحاولة</button>
      </> : access === 'unauthorized' ? <>
        <div className="gate-icon">⌁</div><h1>الحساب ما عنده صلاحية إدارة</h1><p>تم تسجيل الدخول، بس هاللوحة مخصصة لحساب مدير لَبّيك.</p><button className="secondary-button full-button" onClick={() => void supabase?.auth.signOut()}>تسجيل الخروج</button>
      </> : forgotPassword ? <>
        <div className="gate-icon">↗</div><h1>{recoveryCodeSent ? 'رمز تغيير كلمة السر' : 'نسيت كلمة السر؟'}</h1>
        <p>{recoveryCodeSent ? `أدخل الرمز الذي أرسلناه إلى ${email.trim().toLowerCase()}.` : 'أدخل بريد حساب الإدارة لنرسل لك رمز تغيير كلمة السر.'}</p>
        <form className="auth-form" noValidate onSubmit={recoveryCodeSent ? verifyRecoveryCode : requestPasswordReset}>
          <label>البريد الإلكتروني<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" type="email" required /></label>
          {recoveryCodeSent && <label>رمز التغيير<input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="أدخل الرمز من البريد" autoComplete="one-time-code" inputMode="numeric" maxLength={8} required /></label>}
          <button className="primary-button full-button" disabled={authBusy || (!recoveryCodeSent && authCooldown > 0)}>{authBusy ? 'عم نتحقق…' : recoveryCodeSent ? 'تأكيد الرمز' : authCooldown > 0 ? `انتظر ${authCooldown}ث لإعادة الإرسال` : 'إرسال رمز التغيير'}</button>
        </form>
        {recoveryCodeSent && <button className="secondary-button full-button text-button" disabled={authBusy || authCooldown > 0} onClick={() => void requestPasswordReset()}>{authCooldown > 0 ? `إعادة الإرسال بعد ${authCooldown}ث` : 'إعادة إرسال الرمز'}</button>}
        <button className="secondary-button full-button text-button" onClick={() => { setForgotPassword(false); setRecoveryCodeSent(false); setRecoveryCode(''); setAuthMessage('') }}>رجوع لتسجيل الدخول</button>
        {authMessage && <p className={`auth-message ${authMessageTone}`} role={authMessageTone === 'error' ? 'alert' : 'status'} aria-live={authMessageTone === 'error' ? 'assertive' : 'polite'}>{authMessage}</p>}
      </> : <>
        <div className="gate-icon">↗</div><h1>دخول فريق الإدارة</h1><p>سجّل دخولك ببريد الإدارة وكلمة السر.</p>
        <form className="auth-form" noValidate onSubmit={signInAdmin}>
          <label>البريد الإلكتروني<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="username" type="email" required /></label>
          <label>كلمة السر<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="كلمة السر" autoComplete="current-password" type="password" required /></label>
          <button className="primary-button full-button" disabled={authBusy}>{authBusy ? 'عم نسجّل دخولك…' : 'تسجيل الدخول'}</button>
        </form>
        <button className="secondary-button full-button text-button" onClick={() => { setForgotPassword(true); setAuthMessage('') }}>نسيت كلمة السر؟</button>
        {authMessage && <p className={`auth-message ${authMessageTone}`} role={authMessageTone === 'error' ? 'alert' : 'status'} aria-live={authMessageTone === 'error' ? 'assertive' : 'polite'}>{authMessage}</p>}
      </>}
    </div>
  </div>

  return <AdminShell active={active} setActive={setActive} user={user} theme={theme} onToggleTheme={toggleTheme} />
}

function GateNotice({ title, detail }: { title: string; detail: string }) {
  return <><div className="gate-icon">⌁</div><h1>{title}</h1><p>{detail}</p></>
}

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="loading-skeleton-list" role="status" aria-label="جار تحميل البيانات">
    {Array.from({ length: rows }, (_, index) => <div className="loading-skeleton-row" key={index} aria-hidden="true"><i/><i/><i/></div>)}
    <span className="sr-only">جار تحميل البيانات…</span>
  </div>
}

function AdminNetworkBanner() {
  const [backendHealth, setBackendHealth] = useState<AdminBackendHealth>(getAdminBackendHealth)
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const unsubscribe = subscribeAdminBackendHealth(setBackendHealth)
    const updateOnline = () => setBrowserOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      unsubscribe()
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])
  const message = !browserOnline
    ? 'الاتصال بالإنترنت منقطع. بيانات اللوحة قديمة؛ حدّث الصفحة بعد عودة الاتصال.'
    : backendHealth === 'unreachable'
      ? 'تعذّر الاتصال بالخادم. البيانات الحالية قديمة، أعد المحاولة بعد قليل.'
      : backendHealth === 'degraded'
        ? 'الخادم يواجه بطئًا أو مشكلة مؤقتة. احتفظ بالصفحة مفتوحة وأعد المحاولة.'
        : ''
  if (!message) return null
  return <div role="alert" style={{ margin: '0 24px 12px', padding: '10px 14px', borderRadius: 10, background: '#3A2D18', border: '1px solid #745C2C', color: '#FFE2A0', textAlign: 'center', fontSize: 12, lineHeight: 1.6 }}>{message}</div>
}

function useDebouncedRefresh(refresh: () => Promise<void>) {
  const refreshRef = useRef(refresh)
  const timer = useRef<number | null>(null)
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = null; void refreshRef.current() }, 250)
  }, [])
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  return schedule
}

function DriversPanel({ userId }: { userId: string }) {
  const [applications, setApplications] = useState<DriverApplication[]>([])
  const [invites, setInvites] = useState<DriverInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useToastMessage()
  const [newToken, setNewToken] = useState('')
  const [newInviteUrl, setNewInviteUrl] = useState('')
  const hasLoaded = useRef(false)
  const refresh = useCallback(async () => {
    if (!supabase) return
    if (!hasLoaded.current) setLoading(true)
    const [drivers, codes, directory] = await Promise.all([
      supabase.from('driver_profiles').select('user_id,review_status,vehicle_description,created_at,is_online').order('created_at', { ascending: false }),
      supabase.from('driver_invites').select('id,expires_at,redeemed_at,revoked_at,created_at').order('created_at', { ascending: false }).limit(30),
      supabase.rpc('admin_list_users'),
    ])
    if (drivers.error || codes.error || directory.error) setMessage('ما قدرنا نحمّل بيانات السائقين والدعوات.')
    else {
      const usersById = new Map((directory.data ?? []).map((entry) => [entry.user_id, entry]))
      setApplications((drivers.data ?? []).map((driver) => {
        const account = usersById.get(driver.user_id)
        return { ...driver, email: account?.email ?? '', display_name: account?.display_name ?? '' }
      }))
      setInvites(codes.data ?? [])
      hasLoaded.current = true
    }
    setLoading(false)
  }, [setMessage])
  useEffect(() => { void refresh() }, [refresh])
  const createInvite = async () => {
    if (!supabase || !userId) return
    setBusy(true); setMessage('')
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('driver_invites').insert({ created_by: userId, expires_at: expiresAt, token_hash: tokenHash })
    setBusy(false)
    if (error) { setMessage('تعذر إنشاء الدعوة. حاول مرة ثانية.'); return }
    const customerAppUrl = import.meta.env.VITE_CUSTOMER_APP_URL?.trim()
    const inviteUrl = customerAppUrl ? `${customerAppUrl.replace(/\/+$/, '')}/?invite=${token}` : `labbayk:///?invite=${token}`
    setNewToken(token); setNewInviteUrl(inviteUrl); setMessage('الرابط جاهز. السائق بيفتحه، بيسجل ببريده الإلكتروني، وبيرسل طلب الانضمام.'); await refresh()
  }
  const review = async (driverId: string, approved: boolean) => {
    if (!supabase) return
    const { error } = await supabase.rpc('review_driver_application', { p_user_id: driverId, p_approved: approved })
    if (error) setMessage('ما قدرنا نحفظ قرار المراجعة.')
    else { setMessage(approved ? 'تم اعتماد السائق.' : 'تم رفض الطلب.'); await refresh() }
  }
  const revoke = async (inviteId: string) => {
    if (!supabase) return
    const { error } = await supabase.from('driver_invites').update({ revoked_at: new Date().toISOString() }).eq('id', inviteId)
    if (error) setMessage('ما قدرنا نلغي الدعوة.')
    else { setMessage('تم إلغاء رابط الدعوة.'); await refresh() }
  }
  const [clockNow, setClockNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setClockNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const pendingDrivers = applications.filter((driver) => driver.review_status === 'pending')
  const registeredDrivers = applications.filter((driver) => driver.review_status !== 'pending')
  const activeInvites = invites.filter((invite) => !invite.redeemed_at && !invite.revoked_at && Date.parse(invite.expires_at) > clockNow)
  const statusLabel = (driver: DriverApplication) => driver.review_status === 'approved' ? 'معتمد' : driver.review_status === 'suspended' ? 'موقوف مؤقتاً' : driver.review_status === 'rejected' ? 'مرفوض' : 'بانتظار المراجعة'
  const inviteLabel = (invite: DriverInvite) => invite.redeemed_at ? 'استُخدم' : invite.revoked_at ? 'ملغى' : Date.parse(invite.expires_at) < clockNow ? 'منتهي' : 'صالح'
  const dateLabel = (date: string) => mediumDateFormatter.format(new Date(date))

  return <div className="drivers-page" dir="rtl">
    <section className="drivers-invite-callout" aria-labelledby="driver-invite-title">
      <div className="drivers-invite-copy">
        <span className="drivers-section-kicker">الخطوة الأولى</span>
        <h2 id="driver-invite-title">أرسل دعوة لسائق جديد</h2>
        <p>السائق يسجّل ببريده وكلمة السر من الرابط. بعدها بيظهر طلبه هون لتراجعه.</p>
      </div>
      <button className="primary-button drivers-create-button" onClick={() => void createInvite()} disabled={busy}>
        {busy ? 'عم ننشئ الرابط…' : 'إنشاء رابط دعوة'}
      </button>
      <ol className="drivers-steps">
        <li><span>1</span> أنشئ الرابط وانسخه</li>
        <li><span>2</span> أرسله للسائق</li>
        <li><span>3</span> راجع طلبه وقرّر</li>
      </ol>
    </section>

    {message && <p className="drivers-feedback" role="status">{message}</p>}

    {newInviteUrl && <section className="drivers-new-invite" aria-label="رابط الدعوة الجديد">
      <div><strong>رابط الدعوة جاهز</strong><p>صالح لمرة واحدة ولمدة 7 أيام.</p></div>
      <code dir="ltr">{newInviteUrl}</code>
      <button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(newInviteUrl).then(() => setMessage('تم نسخ رابط الدعوة.')) }}>نسخ الرابط</button>
      <details><summary>عرض رمز الدعوة</summary><code dir="ltr">{newToken}</code></details>
    </section>}

    <section className="drivers-stats" aria-label="ملخص فريق السائقين">
      <article className="drivers-stat drivers-stat-pending"><span>طلبات تنتظر مراجعتك</span><strong>{pendingDrivers.length}</strong></article>
      <article className="drivers-stat"><span>سائقون معتمدون</span><strong>{applications.filter((driver) => driver.review_status === 'approved').length}</strong></article>
      <article className="drivers-stat"><span>روابط دعوة صالحة</span><strong>{activeInvites.length}</strong></article>
    </section>

    <section className="panel drivers-section" aria-labelledby="pending-drivers-title">
      <div className="drivers-section-heading">
        <div><h2 id="pending-drivers-title">طلبات الانضمام</h2><p>راجع بيانات السائق قبل اعتماد طلبه.</p></div>
        <button className="refresh-button drivers-refresh" onClick={() => void refresh()} aria-label="تحديث بيانات السائقين">تحديث</button>
      </div>
      {loading ? <LoadingSkeleton rows={3}/> : pendingDrivers.length ? <div className="drivers-list">
        {pendingDrivers.map((driver) => <article className="driver-row driver-row-pending" key={driver.user_id}>
          <div className="driver-identity"><span className="driver-avatar" aria-hidden="true">س</span><div>
            <strong>{driver.display_name.trim() || driver.email || 'سائق جديد'}</strong>
            {driver.display_name.trim() && driver.email && <p dir="ltr">{driver.email}</p>}
            <small>{driver.vehicle_description?.trim() || 'لم يضف نوع المركبة'} <span aria-hidden="true">·</span> تاريخ الطلب {dateLabel(driver.created_at)}</small>
          </div></div>
          <span className="driver-status status-pending">بانتظار المراجعة</span>
          <div className="driver-actions">
            <button className="approve-button" onClick={() => void review(driver.user_id, true)}>اعتماد السائق</button>
            <button className="reject-button" onClick={() => void review(driver.user_id, false)}>رفض الطلب</button>
          </div>
        </article>)}
      </div> : <div className="drivers-empty"><strong>ما في طلبات معلّقة</strong><p>أي سائق يسجّل من رابط الدعوة رح يظهر هون لتراجعه.</p></div>}
    </section>

    <section className="panel drivers-section" aria-labelledby="registered-drivers-title">
      <div className="drivers-section-heading">
        <div><h2 id="registered-drivers-title">السائقون المسجّلون</h2><p>حالة كل سائق واتصاله حالياً.</p></div>
        <span className="drivers-count">{registeredDrivers.length} سائق</span>
      </div>
      {loading ? <LoadingSkeleton rows={3}/> : registeredDrivers.length ? <div className="drivers-list">
        {registeredDrivers.map((driver) => <article className="driver-row" key={driver.user_id}>
          <div className="driver-identity"><span className="driver-avatar" aria-hidden="true">س</span><div>
            <strong>{driver.display_name.trim() || driver.email || 'سائق'}</strong>
            {driver.display_name.trim() && driver.email && <p dir="ltr">{driver.email}</p>}
            <small>{driver.vehicle_description?.trim() || 'لم يضف نوع المركبة'} <span aria-hidden="true">·</span> انضم {dateLabel(driver.created_at)}</small>
          </div></div>
          <div className="driver-state-group">
            <span className={`driver-status status-${driver.review_status}`}>{statusLabel(driver)}</span>
            {driver.review_status === 'approved' && <span className={`driver-online ${driver.is_online ? 'is-online' : ''}`}>{driver.is_online ? 'متصل الآن' : 'غير متصل'}</span>}
          </div>
        </article>)}
      </div> : <div className="drivers-empty"><strong>ما في سائقين مسجّلين بعد</strong><p>السائقون المعتمدون أو المرفوضون رح يظهروا هون.</p></div>}
    </section>

    <details className="drivers-invite-history">
      <summary>سجل روابط الدعوة <span>{activeInvites.length} صالحة الآن</span></summary>
      {invites.length ? <div className="invite-history-list">{invites.map((invite) => <div className="invite-row" key={invite.id}>
        <div><strong>{inviteLabel(invite)}</strong><small>أُنشئ {dateLabel(invite.created_at)} · ينتهي {dateLabel(invite.expires_at)}</small></div>
        {!invite.redeemed_at && !invite.revoked_at && Date.parse(invite.expires_at) > clockNow && <button className="revoke-button" onClick={() => void revoke(invite.id)}>إلغاء الرابط</button>}
      </div>)}</div> : <p className="muted-copy">ما في روابط دعوة سابقة.</p>}
    </details>
  </div>
}

function PricingPanel() {
  const [audit, setAudit] = useState<PricingAudit[]>([])
  const [commissionRate, setCommissionRate] = useState('')
  const [commissionVersion, setCommissionVersion] = useState<number | null>(null)
  const [commissionReason, setCommissionReason] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const hasLoaded = useRef(false)
  const [message, setMessage] = useToastMessage()
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    if (!hasLoaded.current) setLoading(true)
    const [auditRows, commissionResult] = await Promise.all([
      supabase.from('admin_audit_log').select('id,action,entity_type,entity_id,reason,before_data,after_data,created_at').order('created_at',{ascending:false}).limit(20),
      supabase.from('commission_policies').select('rate_basis_points,version').eq('id',1).maybeSingle(),
    ])
    const { data: commission, error: commissionError } = commissionResult
    if (auditRows.error || commissionError) { setMessage('ما قدرنا نحمّل إعدادات الأسعار وسجل التغييرات.'); setLoading(false); return }
    setAudit(auditRows.data ?? [])
    setCommissionRate(commission ? String(commission.rate_basis_points / 100) : '')
    setCommissionVersion(commission?.version ?? null)
    hasLoaded.current = true
    setLoading(false)
  }, [setMessage])
  useEffect(() => { void load() }, [load])
  const saveCommission = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    const rate=Number(commissionRate); const basisPoints=Math.round(rate*100)
    if (!Number.isFinite(rate) || basisPoints < 0 || basisPoints > 6000 || Math.abs(rate*100-basisPoints) > 0.001 || commissionReason.trim().length < 5) { setMessage('أدخل نسبة من 0 إلى 60% بخطوتين عشريتين كحد أقصى وسبباً واضحاً.'); return }
    setBusy('commission'); setMessage('')
    const { error } = await supabase.rpc('set_commission_rate',{p_rate_basis_points:basisPoints,p_reason:commissionReason.trim()})
    setBusy('')
    if (error) { setMessage('ما انحفظت نسبة العمولة. تأكد من صلاحية المدير.'); return }
    setCommissionReason(''); setMessage('انحفظت نسبة العمولة. الطلبات القادمة ستحتفظ بنسخة ثابتة منها وقت الإرسال.'); await load()
  }
  return <><div className="connection-card"><div className="connection-symbol">◈</div><div><strong>تسعير الطلبات</strong><p>حدد أجرة كل طلب من قائمة الطلبات، ثم اسنده لسائق أو أرسله للسائقين المتاحين.</p></div><span className="connection-tag">لكل طلب</span></div>{message && <p className="form-feedback" role="status">{message}</p>}{loading && <LoadingSkeleton rows={3}/>}<div className="pricing-layout"><section className="panel pricing-global"><div className="panel-heading"><div><h2>عمولة لَبّيك</h2><p>{commissionVersion === null ? 'غير مضبوطة؛ توزيع الطلبات متوقف حتى تحدد النسبة.' : 'النسبة الحالية ' + commissionRate + '% · إصدار ' + commissionVersion}</p></div></div><form className="zone-form" onSubmit={(event) => void saveCommission(event)}><label>نسبة العمولة<input type="number" min="0" max="50" step="0.01" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} placeholder="مثال: 10" required /></label><label>سبب التغيير<input value={commissionReason} onChange={(event) => setCommissionReason(event.target.value)} placeholder="مثال: اعتماد نسبة العمولة" minLength={5} maxLength={500} required /></label><button className="primary-button create-button" disabled={loading||busy==='commission'}>{busy==='commission'?'عم نحفظ…':'حفظ نسبة العمولة'} <span>←</span></button><p className="field-hint">تُسجل العمولة المستحقة بعد اكتمال الطلب، ويسددها السائق للإدارة لاحقاً.</p></form></section></div><section className="panel pricing-audit"><div className="panel-heading"><div><h2>سجل تغييرات الأسعار</h2><p>آخر 20 تغييراً مع القيمة السابقة والجديدة والسبب.</p></div></div>{audit.length ? audit.map((item) => <article className="audit-entry" key={item.id}><div><strong>{item.entity_type==='commission_policy'?'نسبة العمولة':item.entity_type==='global_delivery_pricing'?'الرسم المرجعي':'رسم المنطقة'}</strong><small>{item.entity_id} · {shortDateTimeFormatter.format(new Date(item.created_at))}</small><p>{item.reason}</p></div><div className="audit-values"><span>قبل: {JSON.stringify(item.before_data)}</span><span>بعد: {JSON.stringify(item.after_data)}</span></div></article>) : <div className="zone-empty"><p>ما في تغييرات مسجلة.</p></div>}</section></>
}
function SettlementPanel() {
  type Driver = Pick<Database['public']['Tables']['driver_profiles']['Row'],'user_id'|'review_status'>
  type SettlementOrder = Pick<Database['public']['Tables']['orders']['Row'],'id'|'driver_id'|'purchase_amount_minor'|'delivery_fee_minor'|'status'|'created_at'>
  type Settlement = Pick<Database['public']['Tables']['cash_settlements']['Row'],'id'|'order_id'|'driver_id'|'purchase_amount_minor'|'delivery_fee_minor'|'commission_amount_minor'|'driver_earning_minor'|'cash_collected_minor'|'created_at'>
  type LedgerEntry = Pick<Database['public']['Tables']['driver_wallet_ledger']['Row'],'id'|'driver_id'|'amount_minor'|'entry_type'|'order_id'|'reversal_of_entry_id'|'reason'|'created_at'>
  type Reconciliation = Database['public']['Functions']['get_cash_reconciliation']['Returns'][number]
  const dateValue=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  const [initialDateRange] = useState(() => { const today = new Date(); const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 29); return { from: dateValue(monthAgo), to: dateValue(today) } })
  const [drivers,setDrivers]=useState<Driver[]>([]); const [orders,setOrders]=useState<SettlementOrder[]>([]); const [settlements,setSettlements]=useState<Settlement[]>([]); const [ledgerEntries,setLedgerEntries]=useState<LedgerEntry[]>([]); const [reversedSettlementIds,setReversedSettlementIds]=useState<number[]>([])
  const [selectedDriver,setSelectedDriver]=useState(''); const [amount,setAmount]=useState(''); const [reason,setReason]=useState(''); const [adjustmentAmount,setAdjustmentAmount]=useState(''); const [adjustmentReason,setAdjustmentReason]=useState(''); const [busy,setBusy]=useState(''); const [message,setMessage]=useToastMessage(); const [loading,setLoading]=useState(true); const hasLoaded=useRef(false)
  const [walletBalances,setWalletBalances]=useState<Record<string,number>>({})
  const [reportFrom,setReportFrom]=useState(initialDateRange.from); const [reportTo,setReportTo]=useState(initialDateRange.to); const [report,setReport]=useState<Reconciliation|null>(null); const [reportLoading,setReportLoading]=useState(true); const [reportMessage,setReportMessage]=useToastMessage()
  const money=(n:number)=>`${arabicNumberFormatter.format(n)} قرش`
  const loadReconciliation=useCallback(async()=>{
    if(!supabase)return
    const from=new Date(`${reportFrom}T00:00:00`); const to=new Date(`${reportTo}T00:00:00`)
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to<from){setReportMessage('تحقق من تاريخ بداية ونهاية التقرير.');return}
    to.setDate(to.getDate()+1)
    if(to.getTime()-from.getTime()>366*24*60*60*1000){setReportMessage('الفترة القصوى للتقرير سنة واحدة.');return}
    setReportLoading(true);setReportMessage('')
    const {data,error}=await supabase.rpc('get_cash_reconciliation',{p_from:from.toISOString(),p_to:to.toISOString()})
    if(error){setReport(null);setReportMessage('تعذر تحميل تقرير المطابقة النقدية.')}
    else setReport(data?.[0]??{settlement_count:0,purchase_total_minor:0,delivery_fee_total_minor:0,commission_total_minor:0,driver_earning_total_minor:0,cash_collected_total_minor:0})
    setReportLoading(false)
  },[reportFrom,reportTo,setReportMessage])
  const refresh=useCallback(async()=>{
    if(!supabase)return; if(!hasLoaded.current)setLoading(true)
    const [driverRows,orderRows,settlementRows,balanceRows,ledgerRows]=await Promise.all([
      supabase.from('driver_profiles').select('user_id,review_status').eq('review_status','approved').order('created_at',{ascending:false}),
      supabase.from('orders').select('id,driver_id,purchase_amount_minor,delivery_fee_minor,status,created_at').eq('status','delivered').order('delivered_at',{ascending:false}).limit(100),
      supabase.from('cash_settlements').select('id,order_id,driver_id,purchase_amount_minor,delivery_fee_minor,commission_amount_minor,driver_earning_minor,cash_collected_minor,created_at').order('created_at',{ascending:false}).limit(50),
      supabase.rpc('get_driver_wallet_balances'),
      supabase.from('driver_wallet_ledger').select('id,driver_id,amount_minor,entry_type,order_id,reversal_of_entry_id,reason,created_at').order('created_at',{ascending:false}).limit(50),
    ])
    const settlementIds=(settlementRows.data??[]).map(row=>row.id)
    const reversalRows=settlementIds.length
      ? await supabase.from('cash_settlement_reversals').select('settlement_id').in('settlement_id',settlementIds)
      : {data:[],error:null}
    const error=driverRows.error||orderRows.error||settlementRows.error||balanceRows.error||ledgerRows.error||reversalRows.error
    if(error)setMessage('تعذر تحميل بيانات المحفظة والتسويات.')
    else {setDrivers(driverRows.data??[]);setOrders(orderRows.data??[]);setSettlements(settlementRows.data??[]);setLedgerEntries(ledgerRows.data??[]);setReversedSettlementIds((reversalRows.data??[]).map(row=>row.settlement_id));setWalletBalances(Object.fromEntries((balanceRows.data??[]).map(row=>[row.driver_id,row.balance_minor])));setSelectedDriver((current)=>current || driverRows.data?.[0]?.user_id || '');hasLoaded.current=true}
    setLoading(false)
  },[setMessage])
  useEffect(()=>{void refresh();void loadReconciliation()},[refresh,loadReconciliation])
  const topUp=async(event:FormEvent)=>{
    event.preventDefault(); if(!supabase)return
    const value=Number(amount); if(!selectedDriver||!Number.isSafeInteger(value)||value<1||reason.trim().length<5){setMessage('اختر سائقاً وأدخل مبلغاً وسبباً صحيحين.');return}
    if(!window.confirm('أكدت استلام دفعة العمولة نقداً من السائق؟ ستُسجل لتخفيض المبلغ المستحق عليه.'))return
    setBusy('topup');setMessage('')
    const fingerprint=selectedDriver+'|'+value+'|'+reason.trim()
    const pending=JSON.parse(sessionStorage.getItem('labbayk-wallet-topup')||'null') as {key:string;fingerprint:string}|null
    const operationKey=pending?.fingerprint===fingerprint?pending.key:crypto.randomUUID()
    sessionStorage.setItem('labbayk-wallet-topup',JSON.stringify({key:operationKey,fingerprint}))
    const {error}=await supabase.rpc('top_up_driver_wallet',{p_driver_id:selectedDriver,p_amount_minor:value,p_reason:reason.trim(),p_idempotency_key:operationKey})
    setBusy(''); if(error){setMessage('ما انضاف المبلغ. أعد المحاولة بنفس البيانات حتى ما تتكرر الدفعة.');return}
    setAmount('');setReason('');sessionStorage.removeItem('labbayk-wallet-topup');setMessage('تم تسجيل دفعة العمولة وتحديث المستحقات.');await refresh()
  }
  const adjustWallet=async(event:FormEvent)=>{
    event.preventDefault(); if(!supabase)return
    const value=Number(adjustmentAmount); const reasonText=adjustmentReason.trim()
    if(!selectedDriver||!Number.isSafeInteger(value)||value===0||Math.abs(value)>100000000||reasonText.length<5){setMessage('اختر سائقاً وأدخل تعديلاً غير صفري وسبباً من 5 أحرف على الأقل.');return}
    if(!window.confirm(`تأكيد تعديل حساب العمولة بمقدار ${money(value)}؟ ${value<0?'سيتم رفضه إذا جعل الرصيد سالباً.':''}`))return
    setBusy('adjust');setMessage('')
    const fingerprint=`${selectedDriver}|${value}|${reasonText}`
    const pending=JSON.parse(sessionStorage.getItem('labbayk-wallet-adjustments')||'null') as {key:string;fingerprint:string}|null
    const operationKey=pending?.fingerprint===fingerprint?pending.key:crypto.randomUUID()
    sessionStorage.setItem('labbayk-wallet-adjustments',JSON.stringify({key:operationKey,fingerprint}))
    const {error}=await supabase.rpc('adjust_driver_wallet',{p_driver_id:selectedDriver,p_amount_minor:value,p_reason:reasonText,p_idempotency_key:operationKey})
    setBusy('');if(error){setMessage(error.message.includes('negative')?'ما في رصيد كافي لهالخصم؛ الرصيد ما رح يصير سالب. أعد المحاولة بنفس البيانات بعد المراجعة.':'ما قدرنا نحفظ التعديل. أعد المحاولة بنفس البيانات حتى ما يتكرر.');return}
    setAdjustmentAmount('');setAdjustmentReason('');sessionStorage.removeItem('labbayk-wallet-adjustments');setMessage('تم حفظ التعديل كقيد جديد وتسجيل السبب في سجل الإدارة.');await refresh()
  }
  const settle=async(order:SettlementOrder)=>{
    if(!supabase)return
    if(!window.confirm(`تأكدت أن السائق سلّم الطلب وحصّل من الزبون ${arabicNumberFormatter.format((order.purchase_amount_minor??0)+order.delivery_fee_minor)} قرش؟`))return
    setBusy(order.id);setMessage('')
    const {error}=await supabase.rpc('settle_cash_order',{p_order_id:order.id,p_idempotency_key:crypto.randomUUID()})
    setBusy('');if(error){setMessage('ما تمت التسوية. تحقق من اكتمال التوصيل وقيمة المشتريات.');return}
    setMessage('تمت التسوية وتوثيق النقد والعمولة وأرباح السائق.');await refresh()
  }
  const reverseSettlement=async(row:Settlement)=>{
    if(!supabase)return
    const reasonText=window.prompt(`سبب عكس التسوية #${row.id} (5 أحرف على الأقل)`)?.trim()
    if(!reasonText)return
    if(reasonText.length<5){setMessage('اكتب سبباً واضحاً من 5 أحرف على الأقل.');return}
    if(!window.confirm(`سيعود الطلب لحالة «تم التسليم»، وتُعكس عمولة ${money(row.commission_amount_minor)} من حساب السائق. سجل التسوية الأصلي سيبقى محفوظاً. متابعة؟`))return
    const fingerprint=`${row.id}|${reasonText}`
    const pending=JSON.parse(sessionStorage.getItem('labbayk-cash-settlement-reversals')||'{}') as Record<string,string>
    const operationKey=pending[fingerprint]??crypto.randomUUID()
    pending[fingerprint]=operationKey
    sessionStorage.setItem('labbayk-cash-settlement-reversals',JSON.stringify(pending))
    setBusy(`settlement-${row.id}`);setMessage('')
    const {error}=await supabase.rpc('reverse_cash_settlement',{p_settlement_id:row.id,p_reason:reasonText,p_idempotency_key:operationKey})
    setBusy('')
    if(error){setMessage('ما قدرنا نعكس التسوية. أعد المحاولة بنفس السبب حتى ما يتكرر القيد.');return}
    delete pending[fingerprint];sessionStorage.setItem('labbayk-cash-settlement-reversals',JSON.stringify(pending))
    setMessage('انعكست التسوية بقيد موثق؛ عاد الطلب إلى قائمة التسوية مع حفظ السجل الأصلي.');await refresh()
  }
  const reverseEntry=async(entry:LedgerEntry)=>{
    if(!supabase)return
    const reason=window.prompt(`سبب عكس القيد #${entry.id} · المبلغ ${money(entry.amount_minor)} (5 أحرف على الأقل)`)?.trim()
    if(!reason)return
    if(reason.length<5){setMessage('اكتب سبباً واضحاً من 5 أحرف على الأقل.');return}
    if(!window.confirm('سيُضاف قيد عكسي جديد، وسيبقى القيد الأصلي وسجل التسوية كما هما. متابعة؟'))return
    const fingerprint=`${entry.id}|${reason}`
    const pending=JSON.parse(sessionStorage.getItem('labbayk-wallet-reversals')||'{}') as Record<string,string>
    const operationKey=pending[fingerprint]??crypto.randomUUID()
    pending[fingerprint]=operationKey
    sessionStorage.setItem('labbayk-wallet-reversals',JSON.stringify(pending))
    setBusy(`reverse-${entry.id}`);setMessage('')
    const {error}=await supabase.rpc('reverse_driver_wallet_entry',{p_entry_id:entry.id,p_reason:reason,p_idempotency_key:operationKey})
    setBusy('')
    if(error){setMessage(error.message.includes('negative')?'ما في رصيد كافي لعكس هالقيد بدون ما يصير الرصيد سالب.':'ما قدرنا نعكس القيد. أعد المحاولة بنفس السبب حتى ما يتكرر.');return}
    delete pending[fingerprint];sessionStorage.setItem('labbayk-wallet-reversals',JSON.stringify(pending))
    setMessage('انضاف القيد العكسي وتوثق السبب؛ القيود الأصلية لم تتغير.');await refresh()
  }
  const reversedEntryIds=new Set(ledgerEntries.map((entry)=>entry.reversal_of_entry_id).filter((id):id is number=>id!==null))
  return <><div className="connection-card"><div className="connection-symbol">▤</div><div><strong>تسويات النقد ومحافظ السائقين</strong><p>التسوية تسجل استلام النقد يدوياً، وتخصم العمولة من سجل محفظة غير قابل للتعديل.</p></div><span className="connection-tag">{settlements.length} تسوية حديثة</span></div>{message&&<p className="form-feedback" role="status">{message}</p>}
    <section className="panel pricing-audit wallet-ledger-panel"><div className="panel-heading"><div><h2>سجل المحفظة</h2><p>آخر 50 قيداً. العكس والتعديلات يضيفان قيوداً موثقة ولا يغيران التاريخ السابق.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث سجل المحفظة">↻</button></div>{ledgerEntries.length?ledgerEntries.map((entry)=><article className="audit-entry" key={entry.id}><div><strong>{entry.entry_type==='cash_top_up'?'دفعة عمولة من السائق':entry.entry_type==='delivery_commission'?'عمولة توصيل':entry.entry_type==='manual_adjustment'?'تعديل يدوي':'قيد عكسي'} · {money(entry.amount_minor)}</strong><small>قيد #{entry.id} · السائق {entry.driver_id.slice(0,8)}…{entry.order_id?` · الطلب ${entry.order_id.slice(0,8)}…`:''} · {shortDateTimeFormatter.format(new Date(entry.created_at))}</small><p>{entry.reason}{entry.reversal_of_entry_id?` · يعكس القيد #${entry.reversal_of_entry_id}`:''}</p></div>{entry.entry_type!=='wallet_reversal'&&entry.entry_type!=='delivery_commission'&&!reversedEntryIds.has(entry.id)&&<button className="reversal-button" disabled={busy===`reverse-${entry.id}`} onClick={()=>void reverseEntry(entry)}>{busy===`reverse-${entry.id}`?'عم نعكس…':'عكس القيد'}</button>}</article>):<div className="zone-empty"><p>ما في قيود محفظة مسجلة.</p></div>}</section>
    <section className="panel reconciliation-panel"><div className="panel-heading"><div><h2>مطابقة النقد</h2><p>إجماليات التسويات الفعّالة خلال الفترة؛ التسويات المعكوسة مستثناة.</p></div></div><form className="reconciliation-filters" onSubmit={(event)=>{event.preventDefault();void loadReconciliation()}}><label>من تاريخ<input type="date" value={reportFrom} onChange={(event)=>setReportFrom(event.target.value)}/></label><label>إلى تاريخ<input type="date" value={reportTo} onChange={(event)=>setReportTo(event.target.value)}/></label><button className="secondary-button" disabled={reportLoading}>{reportLoading?'عم نحسب…':'تحديث التقرير'}</button></form>{reportMessage&&<p className="error-line" role="alert">{reportMessage}</p>}{report&&<><div className="reconciliation-grid"><div><span>عدد التسويات</span><strong>{arabicNumberFormatter.format(report.settlement_count)}</strong></div><div><span>نقد مستلم</span><strong>{money(report.cash_collected_total_minor)}</strong></div><div><span>كلفة المشتريات</span><strong>{money(report.purchase_total_minor)}</strong></div><div><span>أجور التوصيل</span><strong>{money(report.delivery_fee_total_minor)}</strong></div><div><span>عمولة المنصة</span><strong>{money(report.commission_total_minor)}</strong></div><div><span>حصة السائق</span><strong>{money(report.driver_earning_total_minor)}</strong></div></div><p className="reconciliation-check">مطابقة الحساب: النقد = المشتريات + أجور التوصيل، وأجور التوصيل = العمولة + حصة السائق.</p></>}</section>
    <div className="pricing-layout"><section className="panel pricing-global"><div className="panel-heading"><div><h2>تسجيل دفعة العمولة</h2><p>المبلغ السالب هو عمولات التوصيل التي يدفعها السائق للإدارة لاحقاً.</p></div></div><form className="zone-form" onSubmit={(event)=>void topUp(event)}><label>السائق<select value={selectedDriver} onChange={(event)=>setSelectedDriver(event.target.value)} required><option value="">اختر سائقاً</option>{drivers.map((driver)=><option key={driver.user_id} value={driver.user_id}>{driver.user_id.slice(0,8)}… · حساب العمولة {arabicNumberFormatter.format(walletBalances[driver.user_id]??0)}</option>)}</select></label><label>المبلغ المسدد · قرش<input type="number" min="1" max="100000000" step="1" value={amount} onChange={(event)=>setAmount(event.target.value)} required/></label><label>سبب الدفعة<input value={reason} onChange={(event)=>setReason(event.target.value)} minLength={5} maxLength={500} placeholder="مثال: سداد عمولة حتى 13 تشرين الثاني" required/></label><button className="primary-button create-button" disabled={busy==='topup'||loading}>{busy==='topup'?'عم نسجل…':'تسجيل دفعة العمولة'}</button></form><section className="wallet-adjustment"><h3>تعديل حساب العمولة يدوياً</h3><p>موجب للإضافة، وسالب للخصم. اكتب السبب؛ الخصم ما بيخلي الرصيد سالب.</p><form className="zone-form" onSubmit={(event)=>void adjustWallet(event)}><label>التعديل · قرش<input type="number" min="-100000000" max="100000000" step="1" value={adjustmentAmount} onChange={(event)=>setAdjustmentAmount(event.target.value)} placeholder="مثال: -500" required/></label><label>سبب التعديل<input value={adjustmentReason} onChange={(event)=>setAdjustmentReason(event.target.value)} minLength={5} maxLength={500} placeholder="سبب واضح وموثق" required/></label><button className="secondary-button" disabled={busy==="adjust"||loading}>{busy==="adjust"?"عم نسجل التعديل…":"حفظ تعديل الرصيد"}</button></form></section><div className="invite-history"><h3>حسابات العمولة · السالب مبلغ مستحق</h3>{drivers.map((driver)=><div className="invite-row" key={driver.user_id}><strong>{driver.user_id.slice(0,12)}…</strong><span>{money(walletBalances[driver.user_id]??0)}</span></div>)}</div></section><section className="panel pricing-zones"><div className="panel-heading"><div><h2>طلبات جاهزة للتسوية</h2><p>بعد إتمام التوصيل وتأكيد المبلغ الذي حصّله السائق من الزبون.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث التسويات">↻</button></div>{loading?<LoadingSkeleton rows={3}/>:orders.length?orders.map((order)=><article className="pricing-zone" key={order.id}><div className="zone-location"><span className="zone-pin pin-active">▤</span><div><strong>#{order.id.slice(0,8)}</strong><p>السائق {order.driver_id?.slice(0,8)??'—'} · المشتريات {money(order.purchase_amount_minor??0)}</p><small>النقد المتوقع {money((order.purchase_amount_minor??0)+order.delivery_fee_minor)} · أجرة التوصيل {money(order.delivery_fee_minor)}</small></div></div><button className="primary-button" disabled={!!busy} onClick={()=>void settle(order)}>{busy===order.id?'عم نسجل التسوية…':'تأكيد التحصيل وحساب العمولة'}</button></article>):<div className="zone-empty"><strong>ما في طلبات بانتظار التسوية</strong><p>طلبات التوصيل المكتملة رح تظهر هون.</p></div>}</section></div><section className="panel pricing-audit">
      <div className="panel-heading"><div><h2>سجل التسويات الأخيرة</h2><p>تفصيل المشتريات والنقد والعمولة وحصة السائق. العكس يحفظ السجل الأصلي.</p></div></div>
      {settlements.length ? settlements.map((row) => {
        const reversed = reversedSettlementIds.includes(row.id)
        return <article className="audit-entry" key={row.id}>
          <div><strong>طلب #{row.order_id.slice(0,8)} · سائق {row.driver_id.slice(0,8)} · {reversed ? 'معكوسة' : 'فعّالة'}</strong><small>تسوية #{row.id} · {shortDateTimeFormatter.format(new Date(row.created_at))}</small></div>
          <div className="audit-values"><span>المشتريات: {money(row.purchase_amount_minor)}</span><span>النقد: {money(row.cash_collected_minor)}</span><span>العمولة: {money(row.commission_amount_minor)}</span><span>حصة السائق: {money(row.driver_earning_minor)}</span></div>
          {!reversed && <button className="reversal-button" disabled={busy===`settlement-${row.id}`} onClick={() => void reverseSettlement(row)}>{busy===`settlement-${row.id}` ? 'عم نعكس…' : 'عكس التسوية'}</button>}
        </article>
      }) : <div className="zone-empty"><p>ما تمت تسويات بعد.</p></div>}
    </section></>
}

function NotificationsPanel({userId}:{userId:string}) {
  type Notification=Pick<Database['public']['Tables']['notifications']['Row'],'id'|'title'|'body'|'created_at'|'read_at'|'order_id'>
  const [items,setItems]=useState<Notification[]>([]); const [loading,setLoading]=useState(true); const [message,setMessage]=useToastMessage()
  const refresh=useCallback(async()=>{
    if(!supabase)return
    const {data,error}=await supabase.from('notifications').select('id,title,body,created_at,read_at,order_id').order('created_at',{ascending:false}).limit(50)
    if(error)setMessage('ما قدرنا نحمّل التنبيهات.')
    else {setItems(data??[]);setMessage('')}
    setLoading(false)
  },[setMessage])
  const scheduleRefresh=useDebouncedRefresh(refresh)
  useEffect(()=>{
    void refresh();if(!supabase)return
    const channel=supabase.channel('admin-notifications-'+userId).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_id=eq.'+userId},scheduleRefresh).subscribe()
    return ()=>{void supabase?.removeChannel(channel)}
  },[userId,refresh,scheduleRefresh])
  const markRead=async(id:number)=>{
    if(!supabase)return
    const {error}=await supabase.rpc('mark_notification_read',{p_notification_id:id})
    if(error){setMessage('ما قدرنا نحدّث التنبيه.');return}
    setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item))
  }
  return <><div className="connection-card"><div className="connection-symbol">♢</div><div><strong>صندوق التنبيهات</strong><p>تحديثات الطلبات والعمليات محفوظة ويمكن الرجوع إليها.</p></div><span className="connection-tag">{items.filter(item=>!item.read_at).length} غير مقروء</span></div>{message&&<p className="error-line" role="alert">{message}</p>}<section className="panel pricing-audit"><div className="panel-heading"><div><h2>آخر التنبيهات</h2><p>التنبيهات الظاهرة مخصصة لحساب المدير الحالي.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث التنبيهات">↻</button></div>{loading?<LoadingSkeleton rows={3}/>:items.length?items.map(item=><article className="audit-entry" key={item.id} style={{opacity:item.read_at?0.65:1}}><div><strong>{item.title}</strong><small>{shortDateTimeFormatter.format(new Date(item.created_at))}{item.order_id?' · طلب #'+item.order_id.slice(0,8):''}</small><p>{item.body}</p></div>{!item.read_at&&<button className="secondary-button" onClick={()=>void markRead(item.id)}>تعليم كمقروء</button>}</article>):<div className="zone-empty"><p>ما في تنبيهات حالياً.</p></div>}</section></>
}

function DisputesPanel() {
  type Dispute=Database['public']['Tables']['order_disputes']['Row']
  const [items,setItems]=useState<Dispute[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState('');const [message,setMessage]=useToastMessage()
  const refresh=useCallback(async()=>{if(!supabase)return;setLoading(true);const {data,error}=await supabase.from('order_disputes').select('*').order('created_at',{ascending:false}).limit(100);if(error)setMessage('ما قدرنا نحمّل قضايا الدعم.');else setItems(data??[]);setLoading(false)},[setMessage])
  const scheduleRefresh=useDebouncedRefresh(refresh)
  useEffect(()=>{
    void refresh();if(!supabase)return
    const channel=supabase.channel('admin-order-disputes').on('postgres_changes',{event:'*',schema:'public',table:'order_disputes'},scheduleRefresh).subscribe()
    return ()=>{void supabase?.removeChannel(channel)}
  },[refresh,scheduleRefresh])
  const resolve=async(item:Dispute)=>{if(!supabase)return;const resolution=window.prompt('اكتب ملخص الحل أو الخطوة المتفق عليها (5 أحرف على الأقل)')?.trim();if(!resolution)return;setBusy(item.id);setMessage('');const {error}=await supabase.rpc('resolve_order_dispute',{p_dispute_id:item.id,p_resolution:resolution});setBusy('');if(error){setMessage('ما قدرنا نحفظ الحل. تأكد أن القضية ما زالت مفتوحة.');return}setMessage('انحفظ الحل، وبقي سجل التسوية المالية كما هو.');await refresh()}
  return <><div className="connection-card"><div className="connection-symbol">⌁</div><div><strong>الدعم والنزاعات</strong><p>راجع وصف العميل أو السائق ووثّق الحل. حل القضية لا يغيّر قيود المحفظة أو التسوية تلقائياً.</p></div><span className="connection-tag">{items.filter(item=>!item.resolved_at).length} مفتوحة</span></div>{message&&<p className="form-feedback" role="status">{message}</p>}<section className="panel pricing-audit"><div className="panel-heading"><div><h2>القضايا</h2><p>آخر 100 قضية، المفتوحة أولاً.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث القضايا">↻</button></div>{loading?<LoadingSkeleton rows={3}/>:items.length?items.map(item=><article className="audit-entry" key={item.id}><div><strong>طلب #{item.order_id.slice(0,8)} · {item.reason}</strong><small>{item.resolved_at?'محلولة':'مفتوحة'} · {shortDateTimeFormatter.format(new Date(item.created_at))}</small><p>{item.details}</p>{item.resolution&&<p><b>الحل:</b> {item.resolution}</p>}</div>{!item.resolved_at&&<button className="secondary-button" disabled={busy===item.id} onClick={()=>void resolve(item)}>{busy===item.id?'عم نحفظ…':'تسجيل الحل'}</button>}</article>):<div className="zone-empty"><p>ما في قضايا مسجلة.</p></div>}</section></>
}

function SettingsPanel({ onOpen }: { onOpen: (section: string) => void }) {
  return <UsersPanel onOpen={onOpen} layout="table" />
}

function UsersPanel({ onOpen, layout = 'cards' }: { onOpen: (section: string) => void; layout?: 'cards' | 'table' }) {
  const [users, setUsers] = useState<AdminDirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useToastMessage()
  const [query, setQuery] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(50)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [vehicleDescription, setVehicleDescription] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [accessBusyUser, setAccessBusyUser] = useState<string | null>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(false)
  const [vehicleLoadFailed, setVehicleLoadFailed] = useState(false)
  const editingUserRef = useRef<string | null>(null)
  const hasLoaded = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase) return
    if (!hasLoaded.current) setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_users')
    if (error) setMessage('ما قدرنا نحمّل الحسابات. تأكد من جلسة المدير وحاول مرة ثانية.')
    else { setUsers(data ?? []); setMessage(''); hasLoaded.current = true }
    setLoading(false)
  }, [setMessage])
  useEffect(() => { void refresh() }, [refresh])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingUsers = useMemo(() => users.filter((account) =>
    [account.email, account.display_name, account.user_id, ...account.roles]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  ), [normalizedQuery, users])
  const visibleUsers = matchingUsers.slice(0, visibleLimit)
  const roleLabels: Record<string, string> = {
    customer: 'عميل', driver_pending: 'طلب سائق', driver: 'سائق', super_admin: 'مدير',
  }
  const driverLabels: Record<string, string> = {
    pending: 'بانتظار المراجعة', approved: 'معتمد', suspended: 'موقوف', rejected: 'مرفوض',
  }
  const beginEdit = (account: AdminDirectoryUser) => {
    editingUserRef.current = account.user_id
    setEditingUser(account.user_id)
    setDisplayName(account.display_name)
    setVehicleDescription('')
    setEditReason('')
    setVehicleLoadFailed(false)
    setLoadingVehicle(!!account.driver_status)
    if (account.driver_status && supabase) {
      void supabase.from('driver_profiles').select('vehicle_description').eq('user_id', account.user_id).maybeSingle()
        .then(({ data, error }) => {
          if (editingUserRef.current !== account.user_id) return
          setLoadingVehicle(false)
          setVehicleLoadFailed(!!error)
          if (!error) setVehicleDescription(data?.vehicle_description ?? '')
        })
    }
  }
  const toggleEdit = (account: AdminDirectoryUser) => {
    if (editingUser === account.user_id) { editingUserRef.current = null; setEditingUser(null); return }
    beginEdit(account)
  }
  const changeAccountAccess = async (account: AdminDirectoryUser) => {
    if (!supabase || account.roles.includes('super_admin')) return
    const action = account.account_suspended ? 'restore' : 'suspend'
    const actionLabel = action === 'suspend' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'
    const reason = window.prompt(`سبب ${actionLabel} (5 أحرف على الأقل)`)?.trim()
    if (!reason) return
    if (reason.length < 5) { setMessage('اكتب سبباً من 5 أحرف على الأقل.'); return }
    const detail = action === 'suspend'
      ? 'لن يستطيع هذا الحساب تسجيل الدخول أو تجديد الجلسة. قد تبقى الجلسة المفتوحة صالحة حتى انتهاء رمزها.'
      : 'سيستطيع هذا الحساب تسجيل الدخول من جديد.'
    if (!window.confirm(`${detail}\n\n${actionLabel}؟`)) return
    setAccessBusyUser(account.user_id); setMessage('')
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { user_id: account.user_id, action, reason },
    })
    setAccessBusyUser(null)
    if (error) { setMessage('ما قدرنا نغيّر حالة الحساب. تحقق من الاتصال والصلاحية وجرب مرة ثانية.'); return }
    await refresh()
    setMessage(data?.audit_recorded === false
      ? 'تغيرت حالة الحساب لكن تعذر تسجيل التدقيق؛ راجع سجل المشروع قبل أي تغيير آخر.'
      : action === 'suspend' ? 'تم إيقاف تسجيل الدخول وتوثيق السبب.' : 'تمت إعادة تفعيل الحساب وتوثيق السبب.')
  }
  const saveProfile = async (event: FormEvent, account: AdminDirectoryUser) => {
    event.preventDefault()
    if (!supabase) return
    if (loadingVehicle || vehicleLoadFailed || !displayName.trim() || displayName.trim().length > 120 || vehicleDescription.trim().length > 160 || editReason.trim().length < 5) {
      setMessage('اكتب اسماً صحيحاً وسبباً من 5 أحرف على الأقل. وصف المركبة اختياري حتى 160 حرفاً.')
      return
    }
    setSavingUser(true); setMessage('')
    const { error } = await supabase.rpc('admin_update_user_profile', {
      p_user_id: account.user_id,
      p_display_name: displayName.trim(),
      p_vehicle_description: vehicleDescription.trim(),
      p_reason: editReason.trim(),
    })
    setSavingUser(false)
    if (error) { setMessage('ما قدرنا نحفظ الملف. تأكد من صلاحية المدير وجرب مرة ثانية.'); return }
    setEditingUser(null); setMessage('تم حفظ الملف وتسجيل التغيير في سجل الإدارة.'); await refresh()
  }

  const pendingDriverCount = users.filter((account) => account.driver_status === 'pending').length
  const suspendedCount = users.filter((account) => account.account_suspended).length
  const accountType = (account: AdminDirectoryUser) => account.roles.includes('super_admin') ? 'المدير' : account.driver_status || account.roles.includes('driver') || account.roles.includes('driver_pending') ? 'السائق' : account.roles.includes('customer') ? 'العميل' : 'المستخدم'
  const roleStyle = (role: string) => role === 'super_admin' ? 'admin' : role === 'driver' ? 'driver' : role === 'driver_pending' ? 'pending' : 'customer'
  const lastLogin = (date: string | null) => date ? mediumDateFormatter.format(new Date(date)) : 'لم يسجّل دخول بعد'

  return <div className={`users-page${layout === 'table' ? ' users-page-table' : ''}`} dir="rtl">
    <section className="users-overview" aria-label="ملخص الحسابات">
      <article className="users-overview-main"><span>إدارة الحسابات</span><strong>{users.length}</strong><small>حساب مسجّل</small></article>
      <article className="users-overview-stat"><span>طلبات سائقين للمراجعة</span><strong>{pendingDriverCount}</strong></article>
      <article className="users-overview-stat"><span>حسابات موقوفة</span><strong>{suspendedCount}</strong></article>
    </section>

    <section className="panel user-directory-panel" aria-labelledby="users-directory-title">
      <div className="users-toolbar">
        <div><h2 id="users-directory-title">{layout === 'table' ? 'المستخدمون والصلاحيات' : 'كل المستخدمين'}</h2><p>{layout === 'table' ? 'راجع دور كل حساب وحالته، ونفّذ الإجراء المناسب مباشرة من الجدول.' : 'اعرف دور الحساب وحالته، واستخدم الإجراء المناسب لكل مستخدم.'}</p></div>
        <button className="refresh-button users-refresh" onClick={() => void refresh()} aria-label="تحديث الحسابات">تحديث</button>
      </div>
      <label className="user-search">ابحث بالاسم أو البريد أو رقم الحساب<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(50) }} placeholder="name@example.com" /></label>
      {message && <p className="error-line" role="alert">{message}</p>}
      {loading ? <LoadingSkeleton rows={4}/> : visibleUsers.length ? layout === 'table' ? <div className="users-table-wrap"><table className="users-table"><caption className="users-table-caption">المستخدمون وأدوارهم وحالة حساباتهم وإجراءات الإدارة</caption><thead><tr><th scope="col">المستخدم</th><th scope="col">الدور</th><th scope="col">الحالة</th><th scope="col">آخر دخول</th><th scope="col">الإجراءات</th></tr></thead>{visibleUsers.map((account) => <tbody key={account.user_id}><tr className="users-table-row"><td data-label="المستخدم"><div className="users-account"><strong>{account.display_name || account.email || 'حساب بدون اسم'}</strong><span dir="ltr">{account.email || 'ما في بريد مرتبط'}</span><small dir="ltr">ID · {account.user_id.slice(0, 8)}…</small></div></td><td data-label="الدور"><div className="users-role-list">{account.roles.map((role) => <span className={`users-role role-${roleStyle(role)}`} key={role}>{roleLabels[role] ?? role}</span>)}</div></td><td data-label="الحالة"><div className="users-state-list"><span className={`users-state ${account.account_suspended ? 'state-suspended' : 'state-active'}`}>{account.account_suspended ? 'موقوف' : 'فعّال'}</span><span className={`users-state ${account.email_confirmed ? 'state-confirmed' : 'state-unconfirmed'}`}>{account.email_confirmed ? 'البريد مؤكّد' : 'البريد غير مؤكّد'}</span>{account.driver_status && <span className={`users-state state-driver-${account.driver_status}`}>السائق: {driverLabels[account.driver_status] ?? account.driver_status}</span>}</div></td><td data-label="آخر دخول"><span className="users-last-login">{lastLogin(account.last_sign_in_at)}</span></td><td data-label="الإجراءات"><div className="users-actions">{account.driver_status === 'pending' && <button className="users-review-action" onClick={() => onOpen('السائقون')}>مراجعة طلب السائق</button>}<button className="secondary-button user-edit-button" onClick={() => toggleEdit(account)}>{editingUser === account.user_id ? 'إغلاق التعديل' : `تعديل ${accountType(account)}`}</button>{account.roles.includes('super_admin') ? <span className="users-protected-action">صلاحية المدير محمية</span> : <button className="secondary-button user-access-button" disabled={accessBusyUser === account.user_id} onClick={() => void changeAccountAccess(account)}>{accessBusyUser === account.user_id ? 'عم نحدّث…' : account.account_suspended ? 'إعادة التفعيل' : 'إيقاف الحساب'}</button>}</div></td></tr>{editingUser === account.user_id && <tr className="users-edit-row"><td colSpan={5}><form className="user-edit-form" onSubmit={(event) => void saveProfile(event, account)}><label>اسم المستخدم<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} required /></label>{account.driver_status && <label>وصف المركبة<input value={vehicleDescription} onChange={(event) => setVehicleDescription(event.target.value)} maxLength={160} placeholder={loadingVehicle ? 'عم نحمّل…' : 'اختياري'} disabled={loadingVehicle||vehicleLoadFailed} /></label>}<label>سبب التعديل<input value={editReason} onChange={(event) => setEditReason(event.target.value)} minLength={5} maxLength={500} required /></label><button className="primary-button" disabled={savingUser||loadingVehicle||vehicleLoadFailed}>{savingUser ? 'عم نحفظ…' : loadingVehicle ? 'عم نحمّل بيانات المركبة…' : vehicleLoadFailed ? 'تعذّر تحميل المركبة' : 'حفظ التغييرات'}</button></form></td></tr>}</tbody>)}</table></div> : <div className="users-directory-list">
        {visibleUsers.map((account) => <article className="user-account-card" key={account.user_id}>
          <div className="user-card-main">
            <div className="user-card-identity"><span className={`user-card-avatar role-${roleStyle(account.roles[0] ?? 'customer')}`}>{(account.display_name || account.email || 'ل').slice(0, 1).toUpperCase()}</span><div className="users-account"><strong>{account.display_name || account.email || 'حساب بدون اسم'}</strong><span dir="ltr">{account.email || 'ما في بريد مرتبط'}</span><small dir="ltr">ID · {account.user_id.slice(0, 8)}…</small></div></div>
            <div className="user-card-roles"><span className="user-card-label">الدور</span><div className="users-role-list">{account.roles.map((role) => <span className={`users-role role-${roleStyle(role)}`} key={role}>{roleLabels[role] ?? role}</span>)}</div></div>
          </div>
          <div className="user-card-meta"><div><span className="user-card-label">الحالة</span><div className="users-state-list"><span className={`users-state ${account.account_suspended ? 'state-suspended' : 'state-active'}`}>{account.account_suspended ? 'موقوف' : 'فعّال'}</span><span className={`users-state ${account.email_confirmed ? 'state-confirmed' : 'state-unconfirmed'}`}>{account.email_confirmed ? 'البريد مؤكّد' : 'البريد غير مؤكّد'}</span>{account.driver_status && <span className={`users-state state-driver-${account.driver_status}`}>السائق: {driverLabels[account.driver_status] ?? account.driver_status}</span>}</div></div><div><span className="user-card-label">آخر دخول</span><span className="users-last-login">{lastLogin(account.last_sign_in_at)}</span></div></div>
          <div className="users-actions">{account.driver_status === 'pending' && <button className="users-review-action" onClick={() => onOpen('السائقون')}>مراجعة طلب السائق</button>}<button className="secondary-button user-edit-button" onClick={() => toggleEdit(account)}>{editingUser === account.user_id ? 'إغلاق التعديل' : `تعديل ${accountType(account)}`}</button>{account.roles.includes('super_admin') ? <span className="users-protected-action">صلاحية المدير محمية</span> : <button className="secondary-button user-access-button" disabled={accessBusyUser === account.user_id} onClick={() => void changeAccountAccess(account)}>{accessBusyUser === account.user_id ? 'عم نحدّث…' : account.account_suspended ? 'إعادة التفعيل' : 'إيقاف الحساب'}</button>}</div>
          {editingUser === account.user_id && <form className="user-edit-form" onSubmit={(event) => void saveProfile(event, account)}><label>اسم المستخدم<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} required /></label>{account.driver_status && <label>وصف المركبة<input value={vehicleDescription} onChange={(event) => setVehicleDescription(event.target.value)} maxLength={160} placeholder={loadingVehicle ? 'عم نحمّل…' : 'اختياري'} disabled={loadingVehicle||vehicleLoadFailed} /></label>}<label>سبب التعديل<input value={editReason} onChange={(event) => setEditReason(event.target.value)} minLength={5} maxLength={500} required /></label><button className="primary-button" disabled={savingUser||loadingVehicle||vehicleLoadFailed}>{savingUser ? 'عم نحفظ…' : loadingVehicle ? 'عم نحمّل بيانات المركبة…' : vehicleLoadFailed ? 'تعذّر تحميل المركبة' : 'حفظ التغييرات'}</button></form>}
        </article>)}
      </div> : <div className="users-empty"><strong>{users.length ? 'ما لقينا حساب يطابق البحث' : 'ما في حسابات بعد'}</strong><p>{users.length ? 'جرّب جزءاً أقصر من الاسم أو البريد.' : 'الحسابات الجديدة رح تظهر هون بعد التسجيل.'}</p></div>}
      {!loading && <><p className="user-result-count">عرض {visibleUsers.length} من {matchingUsers.length} نتيجة · إجمالي {users.length} حساب (حتى 500)</p>{visibleUsers.length < matchingUsers.length && <button className="secondary-button" onClick={() => setVisibleLimit((current) => Math.min(current + 50, matchingUsers.length))}>عرض 50 مستخدماً إضافياً</button>}</>}
    </section>
  </div>
}

function OverviewPanel({ onOpen }: { onOpen: (section: string) => void }) {
  type RecentOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'created_at'>
  const [counts, setCounts] = useState({ requested: 0, quoted: 0, searching: 0, onlineDrivers: 0, toSettle: 0, openDisputes: 0 })
  const [recent, setRecent] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useToastMessage()
  const hasLoaded = useRef(false)
  const refresh = useCallback(async () => {
    if (!supabase) return
    if (!hasLoaded.current) setLoading(true)
    setMessage('')
    const [requested, quoted, searching, drivers, toSettle, disputes, recentOrders] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'quoted'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'searching'),
      supabase.from('driver_profiles').select('user_id', { count: 'exact', head: true }).eq('review_status', 'approved').eq('is_online', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      supabase.from('order_disputes').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      supabase.from('orders').select('id,status,created_at').order('created_at', { ascending: false }).limit(5),
    ])
    const error = requested.error || quoted.error || searching.error || drivers.error || toSettle.error || disputes.error || recentOrders.error
    if (error) setMessage('تعذر تحميل ملخص التشغيل. حدّث الصفحة أو أعد المحاولة.')
    else {
      setCounts({ requested: requested.count ?? 0, quoted: quoted.count ?? 0, searching: searching.count ?? 0, onlineDrivers: drivers.count ?? 0, toSettle: toSettle.count ?? 0, openDisputes: disputes.count ?? 0 })
      setRecent(recentOrders.data ?? [])
      hasLoaded.current = true
    }
    setLoading(false)
  }, [setMessage])
  const scheduleRefresh = useDebouncedRefresh(refresh)
  useEffect(() => {
    void refresh()
    if (!supabase) return
    const channel = supabase.channel('admin-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_disputes' }, scheduleRefresh)
      .subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }, [refresh, scheduleRefresh])
  const stages = [
    { label: 'بانتظار التوزيع', value: counts.quoted, note: 'أجرة التوصيل محفوظة' },
    { label: 'جارٍ البحث عن سائق', value: counts.searching, note: 'الطلب بانتظار قبول سائق' },
    { label: 'سائقون متصلون الآن', value: counts.onlineDrivers, note: 'سائقون معتمدون وجاهزون' },
  ]
  const statusLabel = (status: string) => orderStates.find((item) => item.value === status)?.label ?? status
  return <>
    <div className="overview-heading"><div><span className="overview-kicker"><i /> مركز التشغيل</span><p>كل ما يحتاج متابعتك اليوم، مرتباً من الأهم.</p></div><button className="refresh-button" onClick={() => void refresh()} aria-label="تحديث ملخص التشغيل"><span aria-hidden="true">↻</span> تحديث</button></div>
    {message && <p className="error-line" role="alert">{message}</p>}
    <button className={`overview-priority${!loading && counts.requested > 0 ? ' has-work' : ''}`} onClick={() => onOpen('الطلبات')}>
      <span className="overview-priority-orbit" aria-hidden="true"><i /><i /><i /></span>
      <span className="overview-priority-copy"><small>{!loading && counts.requested > 0 ? 'يتطلب إجراءك' : 'حالة الطلبات الجديدة'}</small><strong>{loading ? 'عم نحمّل الطلبات…' : counts.requested > 0 ? 'في طلبات جديدة بانتظار تسعيرك' : 'طلباتك الجديدة تحت السيطرة'}</strong><span>{loading ? 'لحظة واحدة ونجهز لك ملخص التشغيل.' : counts.requested > 0 ? 'حدد أجرة التوصيل حسب الطريق، ثم أرسلها للعميل.' : 'ما في طلبات جديدة حالياً. رح ننبّهك هون أول ما يوصل طلب.'}</span><em>{counts.requested > 0 ? 'راجع الطلبات وسعّرها' : 'استكشف الطلبات'} <b aria-hidden="true">←</b></em></span>
      <span className="overview-priority-action"><b>{loading ? '—' : numberFormatter.format(counts.requested)}</b><small>{counts.requested === 1 ? 'طلب جديد' : 'طلبات جديدة'}</small><span aria-hidden="true">↗</span></span>
    </button>
    <section className="overview-section" aria-labelledby="overview-flow-title"><div className="overview-section-heading"><div><h2 id="overview-flow-title">وين وصلت الطلبات؟</h2><p>مراحل الطلب بعد تحديد أجرة التوصيل.</p></div><button className="overview-link" onClick={() => onOpen('الطلبات')}>عرض الطلبات ←</button></div>
      <div className="overview-stages">{stages.map((stage, index) => <button className={`overview-stage stage-${index + 1}`} key={stage.label} onClick={() => onOpen(index === 2 ? 'السائقون' : 'الطلبات')}><span className="overview-stage-symbol" aria-hidden="true">{index === 0 ? '◷' : index === 1 ? '⌁' : '↗'}</span><span className="overview-stage-copy"><strong>{stage.label}</strong><small>{stage.note}</small></span><b>{loading ? '—' : numberFormatter.format(stage.value)}</b></button>)}</div>
    </section>
    <section className="overview-section overview-followup" aria-labelledby="overview-followup-title"><div className="overview-section-heading"><div><h2 id="overview-followup-title">متابعة الإدارة</h2><p>أمور تحتاج تأكيداً أو تدخلاً منك.</p></div></div><div className="overview-followup-grid">
      <button className="overview-followup-card" onClick={() => onOpen('التسويات')}><span className="overview-followup-icon settlement">✓</span><span><strong>تسويات بانتظار التأكيد</strong><small>توصيلات مكتملة بانتظار مراجعة التحصيل.</small></span><b>{loading ? '—' : numberFormatter.format(counts.toSettle)}</b><span className="overview-followup-arrow" aria-hidden="true">←</span></button>
      <button className="overview-followup-card" onClick={() => onOpen('الدعم والنزاعات')}><span className="overview-followup-icon disputes">!</span><span><strong>قضايا مفتوحة</strong><small>راجع الحالات التي تحتاج متابعة.</small></span><b>{loading ? '—' : numberFormatter.format(counts.openDisputes)}</b><span className="overview-followup-arrow" aria-hidden="true">←</span></button>
    </div></section>
    <section className="panel overview-recent"><div className="panel-heading"><div><h2>أحدث الطلبات</h2><p>آخر خمسة طلبات وصلت للنظام.</p></div><button className="secondary-button" onClick={() => onOpen('الطلبات')}>فتح كل الطلبات</button></div>
      {loading ? <LoadingSkeleton rows={3}/> : recent.length ? <div className="overview-recent-list">{recent.map((order) => <article className="overview-recent-row" key={order.id}><div><strong>#{order.id.slice(0, 8)}</strong><small> · {shortDateTimeFormatter.format(new Date(order.created_at))}</small></div><span className="status-pill">{statusLabel(order.status)}</span></article>)}</div> : <div className="zone-empty"><strong>ما في طلبات لسه</strong><p>الطلبات الجديدة رح تظهر هون بعد إرسالها من التطبيق.</p></div>}
    </section>
  </>
}

function AdminShell({ active, setActive, user, theme, onToggleTheme }: { active: string; setActive: (value: string) => void; user: User | null; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const [todayLabel] = useState(() => headerDateFormatter.format(new Date()))
  const [zones, setZones] = useState<Zone[]>([])
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([])
  const [quoteFees, setQuoteFees] = useState<Record<string, string>>({})
  const [quoteReasons, setQuoteReasons] = useState<Record<string, string>>({})
  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({})
  const [pricingOrderId, setPricingOrderId] = useState('')
  const [hasMoreOrders, setHasMoreOrders] = useState(true)
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false)
  const [ordersAreStale, setOrdersAreStale] = useState(false)
  const [ordersSyncedAt, setOrdersSyncedAt] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [orderMessage, setOrderMessage] = useToastMessage()
  const [loadingZones, setLoadingZones] = useState(false)
  const [zoneError, setZoneError] = useToastMessage()
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useToastMessage()
  const [name, setName] = useState('')
  const [governorate, setGovernorate] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')

  const hasLoadedZones = useRef(false)
  const hasLoadedOrders = useRef(false)
  const ordersRef = useRef<AdminOrder[]>([])
  const ordersRequestId = useRef(0)
  const loadingMoreOrdersRef = useRef(false)

  const loadZones = useCallback(async () => {
    if (!supabase) return
    if (!hasLoadedZones.current) setLoadingZones(true)
    setZoneError('')
    const { data, error } = await supabase.from('service_zones').select('*').order('governorate').order('city').order('name')
    if (error) setZoneError('ما قدرنا نحمّل مناطق الخدمة. جرّب تحدّث الصفحة.')
    else { setZones(data ?? []); hasLoadedZones.current = true }
    setLoadingZones(false)
  }, [setZoneError])
  useEffect(() => { if (active === 'المناطق') void loadZones() }, [active, loadZones])
  const loadOrders = useCallback(async (append = false) => {
    if (!supabase) return
    if (append && loadingMoreOrdersRef.current) return
    if (!hasLoadedOrders.current && !append) setLoadingOrders(true)
    if (append) { loadingMoreOrdersRef.current = true; setLoadingMoreOrders(true) }
    setOrderMessage('')
    const requestId = ++ordersRequestId.current
    const offset = append ? ordersRef.current.length : 0
    let data: AdminOrder[] | null = null
    let error: unknown = null
    try {
      const result = await supabase.from('orders').select('id,customer_id,address_id,request_text,status,delivery_fee_minor,delivery_quote_set_at,driver_id,purchase_amount_minor,created_at,shopping_admin_alerted_at,delivery_admin_alerted_at').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 29)
      data = result.data
      error = result.error
    } catch {
      error = new Error('Network request failed')
    }
    if (requestId !== ordersRequestId.current) {
      if (append) { loadingMoreOrdersRef.current = false; setLoadingMoreOrders(false) }
      return
    }
    if (error) {
      setOrderMessage('ما قدرنا نحمّل الطلبات. البيانات المعروضة قديمة؛ جرّب التحديث مرة ثانية.')
      setOrdersAreStale(true)
    } else {
      const page = data ?? []
      const nextOrders = append ? [...ordersRef.current, ...page.filter((order) => !ordersRef.current.some((current) => current.id === order.id))] : page
      ordersRef.current = nextOrders
      setOrders(nextOrders)
      setHasMoreOrders(page.length === 30)
      setOrdersAreStale(false)
      setOrdersSyncedAt(new Date().toISOString())
      hasLoadedOrders.current = true
    }
    setLoadingOrders(false)
    loadingMoreOrdersRef.current = false
    setLoadingMoreOrders(false)
  }, [setOrderMessage])
  const scheduleOrderRefresh = useDebouncedRefresh(loadOrders)
  const loadAvailableDrivers = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.from('driver_profiles').select('user_id,vehicle_description').eq('review_status','approved').eq('is_online',true).order('created_at')
    if (error) setOrderMessage('ما قدرنا نحمّل السائقين المتاحين.')
    else setAvailableDrivers(data ?? [])
  }, [setOrderMessage])
  useEffect(() => {
    if (active !== 'الطلبات' || !supabase) return
    void loadOrders()
    void loadAvailableDrivers()
    const channel = supabase.channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleOrderRefresh).subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }, [active, loadOrders, loadAvailableDrivers, scheduleOrderRefresh])
  const priceAndDispatchOrder = async (order: AdminOrder) => {
    if (!supabase) return
    const fee = Number(quoteFees[order.id])
    const reason = (quoteReasons[order.id] ?? '').trim()
    const driverId = selectedDrivers[order.id] || null
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000000) {
      setOrderMessage('أدخل أجرة توصيل صحيحة.')
      return
    }
    setPricingOrderId(order.id); setOrderMessage('')
    const { data, error } = await supabase.rpc('admin_price_and_dispatch_order', {
      p_order_id: order.id, p_fee_minor: fee, p_driver_id: driverId, p_reason: reason,
    })
    setPricingOrderId('')
    if (error) { setOrderMessage('ما قدرنا نحفظ الأجرة أو نرسل الطلب. تأكد أن السائق متاح وحاول مرة ثانية.'); return }
    const successMessage = driverId ? 'تم تحديد الأجرة وإسناد الطلب للسائق المحدد.' : data ? `تم تحديد الأجرة وإرسال العرض إلى ${data} سائق متاح؛ أول من يقبل يحصل على الطلب.` : 'تم حفظ أجرة التوصيل، ولا يوجد سائق متاح حالياً. أعد الإرسال عند توفر سائق.'
    await Promise.all([loadOrders(), loadAvailableDrivers()])
    setOrderMessage(successMessage)
  }
  const cancelOrder = async (id: string) => {
    if (!supabase) return
    const reason=window.prompt('اكتب سبب إلغاء الطلب (5 أحرف على الأقل)')?.trim()
    if (!reason) return
    const { error } = await supabase.rpc('cancel_admin_order',{p_order_id:id,p_reason:reason})
    if (error) { setOrderMessage('ما قدرنا نلغي الطلب بهالمرحلة؛ إذا تم الشراء افتح مسار نزاع.'); return }
    setOrderMessage('انلغى الطلب وتوثق السبب بسجل الإدارة.'); await loadOrders()
  }

  const addZone = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return

    setSaving(true); setFormMessage('')
    const { error } = await supabase.from('service_zones').insert({ name: name.trim(), governorate: governorate.trim(), city: city.trim(), neighborhood: neighborhood.trim() || null, delivery_surcharge_minor: 0, currency: 'SYP', active: false })
    setSaving(false)
    if (error) { setFormMessage(error.code === '23505' ? 'هالموقع مضاف من قبل.' : 'ما انحفظت المنطقة. تأكد من البيانات وحاول مرة ثانية.'); return }
    setName(''); setGovernorate(''); setCity(''); setNeighborhood(''); setFormMessage('انضافت المنطقة كمسودة. فعّلها بعد ما تتأكد من تفاصيلها.'); await loadZones()
  }

  const toggleZone = async (zone: Zone) => {
    if (!supabase) return
    const { error } = await supabase.from('service_zones').update({ active: !zone.active }).eq('id', zone.id)
    if (error) setZoneError('ما قدرنا نغيّر حالة المنطقة.')
    else setZones((current) => current.map((item) => item.id === zone.id ? { ...item, active: !zone.active } : item))
  }

  const signOut = async () => { await supabase?.auth.signOut() }
  return <div className="admin" dir="rtl">
    <aside className="sidebar"><a className="brand" href="#home" onClick={() => setActive(nav[0])} aria-label="لَبّيك لوحة الإدارة الرئيسية"><img className="brand-logo" src="/labbayk-delivery-logo.png" alt=""/><span>لَبّيك<small>لوحة الإدارة</small></span></a><div className="workspace-label">مساحة العمل</div><nav aria-label="القائمة الرئيسية">{nav.map((item, i) => <button key={item} className={`nav-item ${active === item ? 'selected' : ''}`} onClick={() => setActive(item)} aria-pressed={active === item}><span className="nav-icon" aria-hidden="true">{['⌂','≋','♙','♧','◈','⌖','▤','♢','⌁','⚙'][i]}</span>{item}</button>)}</nav><button className="sidebar-bottom account-button" onClick={() => void signOut()} aria-label="تسجيل الخروج من لوحة الإدارة"><span className="avatar" aria-hidden="true">ل</span><span className="account-copy">{user?.email || 'مدير لَبّيك'}<small>تسجيل الخروج</small></span><span className="more">↗</span></button></aside>
    <main className="main"><AdminNetworkBanner/><header className="topbar"><div><span className="crumb">لوحة الإدارة</span><span className="slash">/</span><strong>{active}</strong></div><div className="top-actions"><button className="appearance-toggle" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}><svg viewBox="0 0 24 24" aria-hidden="true">{theme === 'dark' ? <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42m-9.88 9.88-1.42-1.42M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/> : <path d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z"/>}</svg></button><span className="environment"><i className="online-dot"/> جلسة مدير موثّقة</span><span className="admin-avatar">{user?.email?.slice(0,1).toUpperCase() || 'ل'}</span></div></header>
      <section className={`page ${active === 'الطلبات' ? 'orders-page' : active === 'المناطق' ? 'zones-page' : active === 'التسويات' ? 'settlements-page' : active === 'التنبيهات' ? 'notifications-page' : active === 'الإعدادات' ? 'settings-page' : active === 'المستخدمون' ? 'users-admin-page' : ''}`}><div className="page-heading"><div><p className="eyebrow">{todayLabel}</p><h1>{active === nav[0] ? 'أهلاً في لَبّيك' : active}</h1><p className="subtitle">{active === nav[0] ? 'من هون بتتابع الطلبات والتشغيل اليومي.' : active === 'السائقون' ? 'ادعُ سائقين جدد، راجع طلبات الانضمام، وتابع حالة فريق التوصيل.' : active === 'المستخدمون' ? 'ابحث عن الحساب، اعرف دوره وحالته، واختر الإجراء المناسب.' : active === 'الإعدادات' ? 'جدول موحّد لحسابات المستخدمين، أدوارهم، وحالة كل حساب وإجراءاته.' : `إدارة ومتابعة ${active} ضمن نظام لَبّيك.`}</p></div></div>
        {active === 'نظرة عامة' ? <OverviewPanel onOpen={setActive}/> : active === 'الطلبات' ? <><section className="panel order-admin-panel"><div className="panel-heading"><div><h2>الطلبات الواردة</h2><p>تصل الطلبات الجديدة للإدارة. حدد الأجرة ثم عيّن سائقاً أو أرسل العرض للجميع؛ أول قبول يفوز.</p></div><button className="refresh-button" onClick={() => void loadOrders()} aria-label="تحديث الطلبات">↻</button></div>{orderMessage && <p className="error-line" role="alert">{orderMessage}</p>}{ordersAreStale && <p className="muted-copy" role="status">{ordersSyncedAt ? 'البيانات قديمة. آخر مزامنة ' + shortDateTimeFormatter.format(new Date(ordersSyncedAt)) : 'تعذر تحديث الطلبات.'}</p>}{loadingOrders ? <LoadingSkeleton rows={4}/> : orders.length ? <><div className="admin-order-list">{orders.map(order => <article className="admin-order" key={order.id}><div className="admin-order-head"><div><span className="order-reference">#{order.id.slice(0,8)}</span><span className="status-pill is-active"><i/>{orderStates.find(x=>x.value===order.status)?.label??order.status}</span>{order.status==='shopping'&&order.shopping_admin_alerted_at?<span className="delay-status-pill">متأخر بالتسوّق</span>:null}{order.status==='delivering'&&order.delivery_admin_alerted_at?<span className="delay-status-pill">متأخر بالتوصيل</span>:null}</div><time>{shortDateTimeFormatter.format(new Date(order.created_at))}</time></div><div className="admin-order-copy"><strong>#{order.id.slice(0,8)}</strong><p>{order.request_text}</p><small>العميل {order.customer_id?.slice(0,8) ?? 'محذوف'} · العنوان {order.address_id?.slice(0,8) ?? 'غير متاح'}</small></div><div className="admin-order-actions">{order.driver_id ? <span>أجرة التوصيل {arabicNumberFormatter.format(order.delivery_fee_minor)} ل.س · السائق {order.driver_id.slice(0,8)}</span> : order.delivery_quote_set_at ? <span>أجرة التوصيل المحددة: {arabicNumberFormatter.format(order.delivery_fee_minor)} ل.س</span> : <span>بانتظار تحديد أجرة التوصيل</span>}{(['requested','quoted','searching'].includes(order.status)&&!order.driver_id)&&<form className="admin-quote-form" onSubmit={(event)=>{event.preventDefault();void priceAndDispatchOrder(order)}}><label>أجرة التوصيل · ل.س<input type="number" min="0" max="100000000" step="1" value={quoteFees[order.id]??(order.delivery_quote_set_at?String(order.delivery_fee_minor):'')} onChange={(event)=>setQuoteFees((current)=>({...current,[order.id]:event.target.value}))} required/></label><label>التعيين<select value={selectedDrivers[order.id]??''} onChange={(event)=>setSelectedDrivers((current)=>({...current,[order.id]:event.target.value}))}><option value="">إرسال لكل السائقين المتاحين</option>{availableDrivers.map((driver)=><option key={driver.user_id} value={driver.user_id}>{driver.vehicle_description||'سائق'} · {driver.user_id.slice(0,8)}</option>)}</select></label><label>سبب التسعير · اختياري<input value={quoteReasons[order.id]??''} onChange={(event)=>setQuoteReasons((current)=>({...current,[order.id]:event.target.value}))} maxLength={500} placeholder="اختياري · مثال: حسب مسافة الطريق"/></label><button className="primary-button" disabled={pricingOrderId===order.id||ordersAreStale}>{pricingOrderId===order.id?'عم نحفظ ونرسل…':selectedDrivers[order.id]?'تحديد الأجرة وإسناد السائق':'تحديد الأجرة وإرسال للسائقين'}</button></form>}{(['requested','quoted','searching','accepted','assigned','awaiting_approval'].includes(order.status)||(order.status==='shopping'&&order.purchase_amount_minor===null))&&<button className="cancel-admin-button" onClick={()=>void cancelOrder(order.id)}>إلغاء الطلب</button>}</div></article>)}</div>{hasMoreOrders && <button disabled={loadingMoreOrders} className="secondary-button" onClick={() => void loadOrders(true)}>{loadingMoreOrders ? 'عم نحمّل الطلبات…' : 'تحميل 30 طلبًا إضافيًا'}</button>}</>:<div className="zone-empty"><strong>لسه ما وصل طلب</strong></div>}</section></> : active === 'السائقون' ? <DriversPanel userId={user?.id??''}/> : active === 'المستخدمون' ? <UsersPanel onOpen={setActive}/> : active === 'التسعير' ? <PricingPanel/> : active === 'التسويات' ? <SettlementPanel/> : active === 'التنبيهات' ? <NotificationsPanel userId={user?.id??''}/> : active === 'الدعم والنزاعات' ? <DisputesPanel/> : active === 'المناطق' ? <><div className="zone-layout"><section className="panel zone-form-panel"><div className="panel-heading"><div><h2>أضف منطقة</h2><p>أضف نطاقات العناوين التي يمكن توصيل الطلبات إليها.</p></div><span className="step-mark">01</span></div><form className="zone-form" onSubmit={addZone}><label>اسم العرض<input value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: المزة" required maxLength={100}/></label><div className="field-pair"><label>المحافظة<input value={governorate} onChange={e=>setGovernorate(e.target.value)} placeholder="دمشق" required maxLength={100}/></label><label>المدينة<input value={city} onChange={e=>setCity(e.target.value)} placeholder="دمشق" required maxLength={100}/></label></div><label>الحي · اختياري<input value={neighborhood} onChange={e=>setNeighborhood(e.target.value)} placeholder="المزة" maxLength={100}/></label><button className="primary-button create-button" disabled={saving}>{saving?'عم نحفظ…':'حفظ كمسودة'} ←</button>{formMessage&&<p className="form-feedback" role="status">{formMessage}</p>}</form></section><section className="panel zone-list-panel"><div className="panel-heading"><div><h2>مناطق التوصيل</h2><p>إدارة نطاقات التوصيل؛ أجرة التوصيل تحددها الإدارة لكل طلب.</p></div><button className="refresh-button" onClick={()=>void loadZones()} aria-label="تحديث المناطق">↻</button></div>{zoneError&&<p className="error-line" role="alert">{zoneError}</p>}{loadingZones?<LoadingSkeleton rows={3}/>:zones.length===0?<div className="zone-empty"><strong>ابدأ بأول منطقة خدمة</strong></div>:<div className="zone-list">{zones.map(zone=><article key={zone.id} className="zone-row"><div className="zone-location"><span className="zone-pin">{zone.active?'●':'⌖'}</span><div><strong>{zone.name}</strong><p>{[zone.neighborhood,zone.city,zone.governorate].filter(Boolean).join('، ')}</p></div></div><div className="zone-status"><span className="status-pill">{zone.active?'فعّالة':'مسودة'}</span><button className="toggle-button" onClick={()=>void toggleZone(zone)} role="switch" aria-checked={zone.active} aria-label={`تفعيل منطقة ${zone.name}`}><span/></button></div></article>)}</div>}</section></div></> : active === 'الإعدادات' ? <SettingsPanel onOpen={setActive}/> : <div className="empty-panel"><h3>مرحباً في لوحة لَبّيك</h3><p>تابع الطلبات والسائقين والأسعار من القائمة.</p><button className="text-button" onClick={()=>setActive('الطلبات')}>عرض الطلبات ←</button></div>}
        <footer>لَبّيك <span>•</span> لوحة الإدارة · بيانات تشغيل فعلية</footer></section>
    </main>
  </div>
}

function App() {
  return <ToastProvider><AppContent /></ToastProvider>
}

export default App

