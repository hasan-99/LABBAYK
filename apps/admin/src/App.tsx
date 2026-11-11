import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@labbayk/shared/database.types'
import { supabase, supabaseConfigured } from './lib/supabase'
import './App.css'
import './pricing.css'
import './auth.css'
import './overview.css'
import './users.css'
import './wallet.css'

const nav = ['نظرة عامة', 'الطلبات', 'السائقون', 'المستخدمون', 'التسعير', 'المناطق', 'التسويات', 'التنبيهات', 'الدعم والنزاعات', 'الإعدادات']
type Zone = Database['public']['Tables']['service_zones']['Row']
type AdminOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'customer_id'|'address_id'|'category'|'request_text'|'status'|'delivery_fee_minor'|'delivery_quote_set_at'|'delivery_quote_approved_at'|'budget_ceiling_minor'|'purchase_amount_minor'|'created_at'>
type DriverApplication = Pick<Database['public']['Tables']['driver_profiles']['Row'], 'user_id'|'review_status'|'vehicle_description'|'created_at'>
type DriverInvite = Pick<Database['public']['Tables']['driver_invites']['Row'], 'id'|'expires_at'|'redeemed_at'|'revoked_at'|'created_at'>
type PricingAudit = Pick<Database['public']['Tables']['admin_audit_log']['Row'], 'id'|'action'|'entity_type'|'entity_id'|'reason'|'before_data'|'after_data'|'created_at'>
type AdminDirectoryUser = Database['public']['Functions']['admin_list_users']['Returns'][number]
type Access = 'loading' | 'signed-out' | 'unauthorized' | 'admin'
const orderStates = [{ value:'requested', label:'وارد جديد' }, { value:'searching', label:'عم ندور على سائق' }, { value:'accepted', label:'قبل السائق الطلب' }, { value:'quoted', label:'تم التسعير' }, { value:'assigned', label:'تم تعيين سائق' }, { value:'shopping', label:'قيد التسوق' }, { value:'awaiting_approval', label:'بانتظار الموافقة' }, { value:'purchased', label:'تم الشراء' }, { value:'delivering', label:'قيد التوصيل' }, { value:'delivered', label:'تم التسليم' }, { value:'settled', label:'تمت التسوية' }, { value:'disputed', label:'قيد مراجعة الدعم' }, { value:'cancelled', label:'ملغي' }]

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [access, setAccess] = useState<Access>(supabaseConfigured ? 'loading' : 'signed-out')
  const [active, setActive] = useState(nav[0])
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageTone, setAuthMessageTone] = useState<'success' | 'error'>('success')
  const [authCooldown, setAuthCooldown] = useState(0)
  const authRequestInFlight = useRef(false)

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
      setUser(nextUser)
      if (!nextUser) { setAccess('signed-out'); return }
      setAccess('loading')
      const { data, error } = await client.from('user_roles').select('role').eq('user_id', nextUser.id).eq('role', 'super_admin').maybeSingle()
      if (alive) setAccess(!error && data ? 'admin' : 'unauthorized')
    }
    void client.auth.getSession().then(({ data }) => checkAccess(data.session?.user ?? null))
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true); setTimeout(() => { void checkAccess(session?.user ?? null) }, 0) })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  const signInAdmin = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) { setAuthMessageTone('error'); setAuthMessage('إعداد الاتصال بخدمة الدخول ناقص.'); return }
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setAuthMessageTone('error'); setAuthMessage('أدخل بريد المدير أولاً.'); return }
    if (authCooldown > 0 || authRequestInFlight.current) return
    authRequestInFlight.current = true
    setAuthBusy(true); setAuthMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
      })
      if (error) {
        const rateLimited = error.status === 429 || error.code?.includes('rate_limit')
        setAuthMessageTone('error')
        setAuthMessage(rateLimited
          ? 'انطلب رابط دخول قبل شوي. افتح أحدث رسالة من لَبّيك، أو انتظر دقيقة قبل إعادة الإرسال.'
          : 'ما قدرنا نبعت رابط الدخول. تأكد من الاتصال والبريد وجرب لاحقاً.')
        if (rateLimited) setAuthCooldown(60)
        return
      }
      setAuthMessageTone('success')
      setAuthMessage('طلبنا رابط الدخول. افتح أحدث رسالة من لَبّيك في بريدك؛ وإذا ما وصل، تفقد الرسائل غير المرغوبة. انتظر دقيقة قبل طلب رابط آخر.')
      setAuthCooldown(60)
    } catch {
      setAuthMessageTone('error')
      setAuthMessage('صار خلل بالاتصال أثناء طلب رابط الدخول. تحقق من الإنترنت وحاول لاحقاً.')
    } finally {
      authRequestInFlight.current = false
      setAuthBusy(false)
    }
  }
  const saveNewPassword = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    if (newPassword.length < 8) { setAuthMessageTone('error'); setAuthMessage('كلمة السر لازم تكون 8 أحرف على الأقل.'); return }
    setAuthBusy(true); setAuthMessage('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setAuthBusy(false)
    if (error) { setAuthMessageTone('error'); setAuthMessage('ما قدرنا نحدّث كلمة السر. افتح رابط استعادة جديد وجرب.'); return }
    setPasswordRecovery(false); setAuthMessageTone('success'); setAuthMessage('تم تغيير كلمة السر.');
  }
  if (passwordRecovery || access !== 'admin') return <div className="gate" dir="rtl">
    <div className="gate-card"><a className="brand gate-brand" href="#home"><span className="brand-mark">ل</span><span>لَبّيك<small>مساحة فريق التشغيل</small></span></a>
      {!supabaseConfigured ? <GateNotice title="إعداد الاتصال ناقص" detail="أضف إعدادات Supabase المحلية حتى نقدر نفتح جلسة آمنة." /> : passwordRecovery ? <><div className="gate-icon">↗</div><h1>كلمة سر جديدة</h1><p>اختر كلمة سر من 8 أحرف على الأقل.</p><form className="auth-form" onSubmit={saveNewPassword}><label>كلمة السر الجديدة<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" type="password" minLength={8} required /></label><button className="primary-button full-button" disabled={authBusy}>{authBusy ? 'عم نحفظ…' : 'حفظ كلمة السر'}</button></form>{authMessage && <p className={`auth-message ${authMessageTone}`} role={authMessageTone === 'error' ? 'alert' : 'status'} aria-live={authMessageTone === 'error' ? 'assertive' : 'polite'}>{authMessage}</p>}</> : access === 'loading' ? <GateNotice title="عم نتحقق من صلاحية الحساب" detail="لحظة واحدة، عم نتأكد من الجلسة ودور الحساب." /> : access === 'unauthorized' ? <><div className="gate-icon">⌁</div><h1>الحساب ما عنده صلاحية إدارة</h1><p>تم تسجيل الدخول، بس هاللوحة مخصصة لحساب مدير لَبّيك.</p><button className="secondary-button full-button" onClick={() => void supabase?.auth.signOut()}>تسجيل الخروج</button></> : <><div className="gate-icon">↗</div><h1>دخول فريق الإدارة</h1><p>أدخل بريد المدير لنرسل له رابط دخول آمن.</p><form className="auth-form" onSubmit={signInAdmin}><label>البريد الإلكتروني<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" type="email" required /></label><button className="primary-button full-button" disabled={authBusy || authCooldown > 0}>{authBusy ? 'عم نبعت الرابط…' : authCooldown > 0 ? `افتح بريدك · إعادة الإرسال بعد ${authCooldown}ث` : 'إرسال رابط الدخول ←'}</button></form>{authMessage && <p className={`auth-message ${authMessageTone}`} role={authMessageTone === 'error' ? 'alert' : 'status'} aria-live={authMessageTone === 'error' ? 'assertive' : 'polite'}>{authMessage}</p>}</>}
    </div>
  </div>

  return <AdminShell active={active} setActive={setActive} user={user} />
}

function GateNotice({ title, detail }: { title: string; detail: string }) {
  return <><div className="gate-icon">⌁</div><h1>{title}</h1><p>{detail}</p></>
}

function DriversPanel({ userId }: { userId: string }) {
  const [applications, setApplications] = useState<DriverApplication[]>([])
  const [invites, setInvites] = useState<DriverInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [newToken, setNewToken] = useState('')
  const [newInviteUrl, setNewInviteUrl] = useState('')
  const refresh = async () => {
    if (!supabase) return
    setLoading(true)
    const [drivers, codes] = await Promise.all([
      supabase.from('driver_profiles').select('user_id,review_status,vehicle_description,created_at').order('created_at', { ascending: false }),
      supabase.from('driver_invites').select('id,expires_at,redeemed_at,revoked_at,created_at').order('created_at', { ascending: false }).limit(30),
    ])
    if (drivers.error || codes.error) setMessage('ما قدرنا نحمّل بيانات السائقين والدعوات.')
    else { setApplications(drivers.data ?? []); setInvites(codes.data ?? []) }
    setLoading(false)
  }
  useEffect(() => { void refresh() }, [])
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
    else await refresh()
  }
  return <><div className="connection-card"><div className="connection-symbol">♙</div><div><strong>السائقون والدعوات</strong><p>كل دعوة صالحة مرة واحدة لمدة 7 أيام؛ الطلب يبقى بانتظار موافقة الإدارة.</p></div><span className="connection-tag">{applications.filter((driver) => driver.review_status === 'pending').length} طلب مراجعة</span></div><div className="driver-layout"><section className="panel driver-invite-panel"><div className="panel-heading"><div><h2>دعوة سائق</h2><p>الرمز ما بينحفظ كنص واضح.</p></div><span className="step-mark">01</span></div><button className="primary-button create-button" onClick={() => void createInvite()} disabled={busy}>{busy ? 'عم ننشئ الدعوة…' : 'إنشاء رابط دعوة'} <span>←</span></button>{newToken && <div className="invite-token"><span>رابط دعوة السائق — صالح 7 أيام ومرة واحدة</span><code dir="ltr">{newInviteUrl}</code><button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(newInviteUrl).then(() => setMessage('اننسخ رابط الدعوة.')) }}>نسخ الرابط</button><details><summary>عرض الرمز بدل الرابط</summary><code dir="ltr">{newToken}</code></details></div>}{message && <p className="form-feedback" role="status">{message}</p>}<div className="invite-history"><h3>آخر الدعوات</h3>{invites.length ? invites.map((invite) => <div className="invite-row" key={invite.id}><div><strong>{invite.redeemed_at ? 'مستخدمة' : invite.revoked_at ? 'ملغاة' : new Date(invite.expires_at) < new Date() ? 'منتهية' : 'صالحة'}</strong><small>تنتهي {new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium'}).format(new Date(invite.expires_at))}</small></div>{!invite.redeemed_at && !invite.revoked_at && new Date(invite.expires_at) > new Date() && <button className="revoke-button" onClick={() => void revoke(invite.id)}>إلغاء</button>}</div>) : <p className="muted-copy">لسه ما أنشأت دعوات.</p>}</div></section><section className="panel driver-applications-panel"><div className="panel-heading"><div><h2>طلبات الانضمام</h2><p>مراجعة الطلبات قبل منح صلاحية السائق.</p></div><button className="refresh-button" onClick={() => void refresh()} aria-label="تحديث السائقين">↻</button></div>{loading ? <div className="zone-empty">عم نحمّل الطلبات…</div> : applications.filter((driver) => driver.review_status === 'pending').length ? applications.filter((driver) => driver.review_status === 'pending').map((driver) => <article className="driver-application" key={driver.user_id}><div className="zone-location"><span className="zone-pin">♙</span><div><strong>طلب سائق جديد</strong><p dir="ltr">{driver.user_id.slice(0, 18)}…</p><small>{driver.vehicle_description || 'ما ذكر مركبته'} · {new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium'}).format(new Date(driver.created_at))}</small></div></div><div className="review-actions"><button className="approve-button" onClick={() => void review(driver.user_id,true)}>اعتماد</button><button className="reject-button" onClick={() => void review(driver.user_id,false)}>رفض</button></div></article>) : <div className="zone-empty"><span>♙</span><strong>ما في طلبات معلّقة</strong><p>طلبات السائقين الجديدة رح تظهر هون.</p></div>}</section></div></>
}

function PricingPanel() {
  const [zones, setZones] = useState<Zone[]>([])
  const [audit, setAudit] = useState<PricingAudit[]>([])
  const [globalFee, setGlobalFee] = useState('')
  const [globalVersion, setGlobalVersion] = useState<number | null>(null)
  const [globalReason, setGlobalReason] = useState('')
  const [commissionRate, setCommissionRate] = useState('')
  const [commissionVersion, setCommissionVersion] = useState<number | null>(null)
  const [commissionReason, setCommissionReason] = useState('')
  const [zoneFees, setZoneFees] = useState<Record<string,string>>({})
  const [zoneReasons, setZoneReasons] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const load = async () => {
    if (!supabase) return
    setLoading(true)
    const [pricing, zoneRows, auditRows] = await Promise.all([
      supabase.from('global_delivery_pricing').select('base_fee_minor,version').eq('id',1).maybeSingle(),
      supabase.from('service_zones').select('*').order('governorate').order('city').order('name'),
      supabase.from('admin_audit_log').select('id,action,entity_type,entity_id,reason,before_data,after_data,created_at').order('created_at',{ascending:false}).limit(20),
    ])
    const { data: commission } = await supabase.from('commission_policies').select('rate_basis_points,version').eq('id',1).maybeSingle()
    if (pricing.error || zoneRows.error || auditRows.error) { setMessage('ما قدرنا نحمّل إعدادات الأسعار وسجل التغييرات.'); setLoading(false); return }
    setGlobalFee(pricing.data ? String(pricing.data.base_fee_minor) : ''); setGlobalVersion(pricing.data?.version ?? null); setZones(zoneRows.data ?? []); setAudit(auditRows.data ?? [])
    setCommissionRate(commission ? String(commission.rate_basis_points / 100) : ''); setCommissionVersion(commission?.version ?? null)
    setZoneFees(Object.fromEntries((zoneRows.data ?? []).map((zone) => [zone.id,String(zone.delivery_surcharge_minor)])))
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const saveGlobal = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    const fee=Number(globalFee)
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000000 || globalReason.trim().length < 5) { setMessage('أدخل رسماً صحيحاً وسبباً من 5 أحرف على الأقل.'); return }
    setBusy('global'); setMessage('')
    const { error } = await supabase.rpc('set_global_delivery_fee',{p_fee_minor:fee,p_reason:globalReason.trim()})
    setBusy('')
    if (error) { setMessage('ما انحفظ الرسم المرجعي. تأكد من صلاحية المدير وجرب مرة ثانية.'); return }
    setGlobalReason(''); setMessage('انحفظ الرسم المرجعي. الطلبات الجديدة رح تستخدمه؛ الطلبات الحالية بتضل على سعرها المحفوظ.'); await load()
  }
  const saveZone = async (zone: Zone) => {
    if (!supabase) return
    const fee=Number(zoneFees[zone.id]); const reason=(zoneReasons[zone.id] ?? '').trim()
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000000 || reason.length < 5) { setMessage('أدخل رسماً صحيحاً وسبباً من 5 أحرف على الأقل لكل منطقة.'); return }
    setBusy(zone.id); setMessage('')
    const { error } = await supabase.rpc('set_zone_delivery_surcharge',{p_zone_id:zone.id,p_fee_minor:fee,p_reason:reason})
    setBusy('')
    if (error) { setMessage('ما انحفظ رسم المنطقة. تأكد من صلاحية المدير.'); return }
    setZoneReasons((current) => ({...current,[zone.id]:''})); setMessage(`تم تحديث رسم ${zone.name} للطلبات الجديدة.`); await load()
  }
  const saveCommission = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    const rate=Number(commissionRate); const basisPoints=Math.round(rate*100)
    if (!Number.isFinite(rate) || basisPoints < 0 || basisPoints > 5000 || Math.abs(rate*100-basisPoints) > 0.001 || commissionReason.trim().length < 5) { setMessage('أدخل نسبة من 0 إلى 50% بخطوتين عشريتين كحد أقصى وسبباً واضحاً.'); return }
    setBusy('commission'); setMessage('')
    const { error } = await supabase.rpc('set_commission_rate',{p_rate_basis_points:basisPoints,p_reason:commissionReason.trim()})
    setBusy('')
    if (error) { setMessage('ما انحفظت نسبة العمولة. تأكد من صلاحية المدير.'); return }
    setCommissionReason(''); setMessage('انحفظت نسبة العمولة. الطلبات القادمة ستحتفظ بنسخة ثابتة منها وقت التوزيع.'); await load()
  }
  return <><div className="connection-card"><div className="connection-symbol">◈</div><div><strong>إعدادات العمولة والرسوم المرجعية</strong><p>كل أجرة طلب يحددها المدير حسب الطريق ويوافق عليها العميل؛ العمولة تثبت عند التوزيع.</p></div><span className="connection-tag">SYP · قرش</span></div>{message && <p className="form-feedback" role="status">{message}</p>}<div className="pricing-layout"><section className="panel pricing-global"><div className="panel-heading"><div><h2>الرسم المرجعي</h2><p>{globalVersion === null ? 'غير مضبوط؛ أجرة كل طلب يحددها المدير حسب مسافة الطريق، وهذا الرقم مرجع فقط.' : `القيمة المرجعية الحالية ${new Intl.NumberFormat('ar-SY').format(Number(globalFee))} قرش · إصدار ${globalVersion}`}</p></div><button className="refresh-button" onClick={() => void load()} aria-label="تحديث التسعير">↻</button></div><form className="zone-form" onSubmit={(event) => void saveGlobal(event)}><label>المبلغ <span className="field-hint">بالقروش</span><input type="number" min="0" max="100000000" step="1" value={globalFee} onChange={(event) => setGlobalFee(event.target.value)} placeholder="مثال: 5000" required /></label><label>سبب التغيير<input value={globalReason} onChange={(event) => setGlobalReason(event.target.value)} placeholder="مثال: تحديث كلفة التشغيل" minLength={5} maxLength={500} required /></label><button className="primary-button create-button" disabled={busy==='global'}>{busy==='global'?'عم نحفظ…':'حفظ الرسم المرجعي'} <span>←</span></button></form></section><section className="panel pricing-global"><div className="panel-heading"><div><h2>عمولة لَبّيك</h2><p>{commissionVersion === null ? 'غير مضبوطة؛ توزيع الطلبات متوقف حتى تحدد النسبة.' : `النسبة الحالية ${commissionRate}% · إصدار ${commissionVersion}`}</p></div></div><form className="zone-form" onSubmit={(event) => void saveCommission(event)}><label>نسبة العمولة<input type="number" min="0" max="50" step="0.01" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} placeholder="مثال: 10" required /></label><label>سبب التغيير<input value={commissionReason} onChange={(event) => setCommissionReason(event.target.value)} placeholder="مثال: اعتماد نسبة العمولة" minLength={5} maxLength={500} required /></label><button className="primary-button create-button" disabled={busy==='commission'}>{busy==='commission'?'عم نحفظ…':'حفظ نسبة العمولة'} <span>←</span></button><p className="field-hint">تُخصم العمولة بعد التسليم. لازم يكون رصيد محفظة السائق كافياً.</p></form></section></div><section className="panel pricing-zones"><div className="panel-heading"><div><h2>رسوم المناطق</h2><p>قيمة مرجعية فقط؛ أجرة كل طلب تُسعّر حسب الطريق قبل التوزيع.</p></div></div>{loading ? <div className="zone-empty">عم نحمل الأسعار…</div> : zones.length ? zones.map((zone) => <article className="pricing-zone" key={zone.id}><div className="zone-location"><span className={`zone-pin ${zone.active?'pin-active':''}`}>⌖</span><div><strong>{zone.name}</strong><p>{zone.city}، {zone.governorate} · {zone.active?'فعالة':'مسودة'}</p></div></div><form className="pricing-zone-form" onSubmit={(event) => {event.preventDefault();void saveZone(zone)}}><label>رسم المنطقة · قرش<input type="number" min="0" max="100000000" step="1" value={zoneFees[zone.id] ?? '0'} onChange={(event) => setZoneFees((current) => ({...current,[zone.id]:event.target.value}))} required /></label><label>سبب التغيير<input value={zoneReasons[zone.id] ?? ''} onChange={(event) => setZoneReasons((current) => ({...current,[zone.id]:event.target.value}))} placeholder="سبب من 5 أحرف على الأقل" minLength={5} maxLength={500} required /></label><button className="secondary-button" disabled={busy===zone.id}>{busy===zone.id?'عم نحفظ…':'حفظ'}</button></form></article>) : <div className="zone-empty"><strong>ما في مناطق مسجلة</strong><p>أضف منطقة خدمة أولاً.</p></div>}</section><section className="panel pricing-audit"><div className="panel-heading"><div><h2>سجل تغييرات الأسعار</h2><p>آخر 20 تغييراً مع القيمة السابقة والجديدة والسبب.</p></div></div>{audit.length ? audit.map((item) => <article className="audit-entry" key={item.id}><div><strong>{item.entity_type==='commission_policy'?'نسبة العمولة':item.entity_type==='global_delivery_pricing'?'الرسم المرجعي':'رسم المنطقة'}</strong><small>{item.entity_id} · {new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}</small><p>{item.reason}</p></div><div className="audit-values"><span>قبل: {JSON.stringify(item.before_data)}</span><span>بعد: {JSON.stringify(item.after_data)}</span></div></article>) : <div className="zone-empty"><p>ما في تغييرات مسجلة لسه.</p></div>}</section></>
}

function SettlementPanel() {
  type Driver = Pick<Database['public']['Tables']['driver_profiles']['Row'],'user_id'|'review_status'>
  type SettlementOrder = Pick<Database['public']['Tables']['orders']['Row'],'id'|'driver_id'|'category'|'purchase_amount_minor'|'delivery_fee_minor'|'status'|'created_at'>
  type Settlement = Pick<Database['public']['Tables']['cash_settlements']['Row'],'id'|'order_id'|'driver_id'|'purchase_amount_minor'|'delivery_fee_minor'|'commission_amount_minor'|'driver_earning_minor'|'cash_collected_minor'|'created_at'>
  type LedgerEntry = Pick<Database['public']['Tables']['driver_wallet_ledger']['Row'],'id'|'driver_id'|'amount_minor'|'entry_type'|'order_id'|'reversal_of_entry_id'|'reason'|'created_at'>
  type Reconciliation = Database['public']['Functions']['get_cash_reconciliation']['Returns'][number]
  const dateValue=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  const today=new Date(); const monthAgo=new Date(today); monthAgo.setDate(today.getDate()-29)
  const [drivers,setDrivers]=useState<Driver[]>([]); const [orders,setOrders]=useState<SettlementOrder[]>([]); const [settlements,setSettlements]=useState<Settlement[]>([]); const [ledgerEntries,setLedgerEntries]=useState<LedgerEntry[]>([]); const [reversedSettlementIds,setReversedSettlementIds]=useState<number[]>([])
  const [selectedDriver,setSelectedDriver]=useState(''); const [amount,setAmount]=useState(''); const [reason,setReason]=useState(''); const [adjustmentAmount,setAdjustmentAmount]=useState(''); const [adjustmentReason,setAdjustmentReason]=useState(''); const [busy,setBusy]=useState(''); const [message,setMessage]=useState(''); const [loading,setLoading]=useState(true)
  const [walletBalances,setWalletBalances]=useState<Record<string,number>>({})
  const [reportFrom,setReportFrom]=useState(dateValue(monthAgo)); const [reportTo,setReportTo]=useState(dateValue(today)); const [report,setReport]=useState<Reconciliation|null>(null); const [reportLoading,setReportLoading]=useState(true); const [reportMessage,setReportMessage]=useState('')
  const money=(n:number)=>`${new Intl.NumberFormat('ar-SY').format(n)} قرش`
  const loadReconciliation=async()=>{
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
  }
  const refresh=async()=>{
    if(!supabase)return; setLoading(true)
    const [driverRows,orderRows,settlementRows,balanceRows,ledgerRows,reversalRows]=await Promise.all([
      supabase.from('driver_profiles').select('user_id,review_status').eq('review_status','approved').order('created_at',{ascending:false}),
      supabase.from('orders').select('id,driver_id,category,purchase_amount_minor,delivery_fee_minor,status,created_at').eq('status','delivered').order('delivered_at',{ascending:false}).limit(100),
      supabase.from('cash_settlements').select('id,order_id,driver_id,purchase_amount_minor,delivery_fee_minor,commission_amount_minor,driver_earning_minor,cash_collected_minor,created_at').order('created_at',{ascending:false}).limit(50),
      supabase.rpc('get_driver_wallet_balances'),
      supabase.from('driver_wallet_ledger').select('id,driver_id,amount_minor,entry_type,order_id,reversal_of_entry_id,reason,created_at').order('created_at',{ascending:false}).limit(50),
      supabase.from('cash_settlement_reversals').select('settlement_id'),
    ])
    const error=driverRows.error||orderRows.error||settlementRows.error||balanceRows.error||ledgerRows.error||reversalRows.error
    if(error)setMessage('تعذر تحميل بيانات المحفظة والتسويات.')
    else {setDrivers(driverRows.data??[]);setOrders(orderRows.data??[]);setSettlements(settlementRows.data??[]);setLedgerEntries(ledgerRows.data??[]);setReversedSettlementIds((reversalRows.data??[]).map(row=>row.settlement_id));setWalletBalances(Object.fromEntries((balanceRows.data??[]).map(row=>[row.driver_id,row.balance_minor])));if(!selectedDriver&&driverRows.data?.[0])setSelectedDriver(driverRows.data[0].user_id)}
    setLoading(false)
  }
  useEffect(()=>{void refresh();void loadReconciliation()},[])
  const topUp=async(event:FormEvent)=>{
    event.preventDefault(); if(!supabase)return
    const value=Number(amount); if(!selectedDriver||!Number.isSafeInteger(value)||value<1||reason.trim().length<5){setMessage('اختر سائقاً وأدخل مبلغاً وسبباً صحيحين.');return}
    if(!window.confirm('أكدت استلام هذا المبلغ النقدي فعلياً من السائق؟ سيتم تسجيله كرصيد محفظة.'))return
    setBusy('topup');setMessage('')
    const fingerprint=selectedDriver+'|'+value+'|'+reason.trim()
    const pending=JSON.parse(sessionStorage.getItem('labbayk-wallet-topup')||'null') as {key:string;fingerprint:string}|null
    const operationKey=pending?.fingerprint===fingerprint?pending.key:crypto.randomUUID()
    sessionStorage.setItem('labbayk-wallet-topup',JSON.stringify({key:operationKey,fingerprint}))
    const {error}=await supabase.rpc('top_up_driver_wallet',{p_driver_id:selectedDriver,p_amount_minor:value,p_reason:reason.trim(),p_idempotency_key:operationKey})
    setBusy(''); if(error){setMessage('ما انضاف المبلغ. أعد المحاولة بنفس البيانات حتى ما يتكرر الإيداع.');return}
    setAmount('');setReason('');sessionStorage.removeItem('labbayk-wallet-topup');setMessage('تم تسجيل المبلغ المستلم وإضافته إلى سجل المحفظة.');await refresh()
  }
  const adjustWallet=async(event:FormEvent)=>{
    event.preventDefault(); if(!supabase)return
    const value=Number(adjustmentAmount); const reasonText=adjustmentReason.trim()
    if(!selectedDriver||!Number.isSafeInteger(value)||value===0||Math.abs(value)>100000000||reasonText.length<5){setMessage('اختر سائقاً وأدخل تعديلاً غير صفري وسبباً من 5 أحرف على الأقل.');return}
    if(!window.confirm(`تأكيد تعديل رصيد المحفظة بمقدار ${money(value)}؟ ${value<0?'سيتم رفضه إذا جعل الرصيد سالباً.':''}`))return
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
    if(!window.confirm(`أكدت استلام ${new Intl.NumberFormat('ar-SY').format((order.purchase_amount_minor??0)+order.delivery_fee_minor)} قرش نقداً لهذا الطلب؟`))return
    setBusy(order.id);setMessage('')
    const {error}=await supabase.rpc('settle_cash_order',{p_order_id:order.id,p_idempotency_key:crypto.randomUUID()})
    setBusy('');if(error){setMessage(error.message.includes('insufficient')?'رصيد محفظة السائق لا يكفي للعمولة. سجّل إيداعاً نقدياً موثقاً أولاً.':'ما تمت التسوية. تحقق من استلام النقد ورصيد المحفظة وحالة الطلب.');return}
    setMessage('تمت التسوية وتوثيق النقد والعمولة وأرباح السائق.');await refresh()
  }
  const reverseSettlement=async(row:Settlement)=>{
    if(!supabase)return
    const reasonText=window.prompt(`سبب عكس التسوية #${row.id} (5 أحرف على الأقل)`)?.trim()
    if(!reasonText)return
    if(reasonText.length<5){setMessage('اكتب سبباً واضحاً من 5 أحرف على الأقل.');return}
    if(!window.confirm(`سيعود الطلب لحالة «تم التسليم»، وتُعاد عمولة ${money(row.commission_amount_minor)} إلى محفظة السائق. سجل التسوية الأصلي سيبقى محفوظاً. متابعة؟`))return
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
    <section className="panel pricing-audit wallet-ledger-panel"><div className="panel-heading"><div><h2>سجل المحفظة</h2><p>آخر 50 قيداً. العكس والتعديلات يضيفان قيوداً موثقة ولا يغيران التاريخ السابق.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث سجل المحفظة">↻</button></div>{ledgerEntries.length?ledgerEntries.map((entry)=><article className="audit-entry" key={entry.id}><div><strong>{entry.entry_type==='cash_top_up'?'إيداع نقدي':entry.entry_type==='delivery_commission'?'عمولة توصيل':entry.entry_type==='manual_adjustment'?'تعديل يدوي':'قيد عكسي'} · {money(entry.amount_minor)}</strong><small>قيد #{entry.id} · السائق {entry.driver_id.slice(0,8)}…{entry.order_id?` · الطلب ${entry.order_id.slice(0,8)}…`:''} · {new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(entry.created_at))}</small><p>{entry.reason}{entry.reversal_of_entry_id?` · يعكس القيد #${entry.reversal_of_entry_id}`:''}</p></div>{entry.entry_type!=='wallet_reversal'&&entry.entry_type!=='delivery_commission'&&!reversedEntryIds.has(entry.id)&&<button className="reversal-button" disabled={busy===`reverse-${entry.id}`} onClick={()=>void reverseEntry(entry)}>{busy===`reverse-${entry.id}`?'عم نعكس…':'عكس القيد'}</button>}</article>):<div className="zone-empty"><p>ما في قيود محفظة مسجلة.</p></div>}</section>
    <section className="panel reconciliation-panel"><div className="panel-heading"><div><h2>مطابقة النقد</h2><p>إجماليات التسويات الفعّالة خلال الفترة؛ التسويات المعكوسة مستثناة.</p></div></div><form className="reconciliation-filters" onSubmit={(event)=>{event.preventDefault();void loadReconciliation()}}><label>من تاريخ<input type="date" value={reportFrom} onChange={(event)=>setReportFrom(event.target.value)}/></label><label>إلى تاريخ<input type="date" value={reportTo} onChange={(event)=>setReportTo(event.target.value)}/></label><button className="secondary-button" disabled={reportLoading}>{reportLoading?'عم نحسب…':'تحديث التقرير'}</button></form>{reportMessage&&<p className="error-line" role="alert">{reportMessage}</p>}{report&&<><div className="reconciliation-grid"><div><span>عدد التسويات</span><strong>{new Intl.NumberFormat('ar-SY').format(report.settlement_count)}</strong></div><div><span>نقد مستلم</span><strong>{money(report.cash_collected_total_minor)}</strong></div><div><span>كلفة المشتريات</span><strong>{money(report.purchase_total_minor)}</strong></div><div><span>أجور التوصيل</span><strong>{money(report.delivery_fee_total_minor)}</strong></div><div><span>عمولة المنصة</span><strong>{money(report.commission_total_minor)}</strong></div><div><span>حصة السائق</span><strong>{money(report.driver_earning_total_minor)}</strong></div></div><p className="reconciliation-check">مطابقة الحساب: النقد = المشتريات + أجور التوصيل، وأجور التوصيل = العمولة + حصة السائق.</p></>}</section>
    <div className="pricing-layout"><section className="panel pricing-global"><div className="panel-heading"><div><h2>إيداع نقدي للمحفظة</h2><p>استخدمه بعد استلام المبلغ من السائق فعلياً.</p></div></div><form className="zone-form" onSubmit={(event)=>void topUp(event)}><label>السائق<select value={selectedDriver} onChange={(event)=>setSelectedDriver(event.target.value)} required><option value="">اختر سائقاً</option>{drivers.map((driver)=><option key={driver.user_id} value={driver.user_id}>{driver.user_id.slice(0,8)}… · الرصيد {new Intl.NumberFormat('ar-SY').format(walletBalances[driver.user_id]??0)}</option>)}</select></label><label>المبلغ · قرش<input type="number" min="1" max="100000000" step="1" value={amount} onChange={(event)=>setAmount(event.target.value)} required/></label><label>سبب الإيداع<input value={reason} onChange={(event)=>setReason(event.target.value)} minLength={5} maxLength={500} placeholder="سبب موثق" required/></label><button className="primary-button create-button" disabled={busy==='topup'||loading}>{busy==='topup'?'عم نسجل…':'تأكيد استلام وإيداع'}</button></form><section className="wallet-adjustment"><h3>تعديل رصيد يدوي</h3><p>موجب للإضافة، وسالب للخصم. اكتب السبب؛ الخصم ما بيخلي الرصيد سالب.</p><form className="zone-form" onSubmit={(event)=>void adjustWallet(event)}><label>التعديل · قرش<input type="number" min="-100000000" max="100000000" step="1" value={adjustmentAmount} onChange={(event)=>setAdjustmentAmount(event.target.value)} placeholder="مثال: -500" required/></label><label>سبب التعديل<input value={adjustmentReason} onChange={(event)=>setAdjustmentReason(event.target.value)} minLength={5} maxLength={500} placeholder="سبب واضح وموثق" required/></label><button className="secondary-button" disabled={busy==="adjust"||loading}>{busy==="adjust"?"عم نسجل التعديل…":"حفظ تعديل الرصيد"}</button></form></section><div className="invite-history"><h3>أرصدة السائقين</h3>{drivers.map((driver)=><div className="invite-row" key={driver.user_id}><strong>{driver.user_id.slice(0,12)}…</strong><span>{money(walletBalances[driver.user_id]??0)}</span></div>)}</div></section><section className="panel pricing-zones"><div className="panel-heading"><div><h2>طلبات جاهزة للتسوية</h2><p>بعد التسليم وتأكيد استلام النقد كاملاً.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث التسويات">↻</button></div>{loading?<div className="zone-empty">عم نحمّل التسويات…</div>:orders.length?orders.map((order)=><article className="pricing-zone" key={order.id}><div className="zone-location"><span className="zone-pin pin-active">▤</span><div><strong>#{order.id.slice(0,8)} · {order.category}</strong><p>السائق {order.driver_id?.slice(0,8)??'—'} · المشتريات {money(order.purchase_amount_minor??0)}</p><small>النقد المتوقع {money((order.purchase_amount_minor??0)+order.delivery_fee_minor)} · أجرة التوصيل {money(order.delivery_fee_minor)}</small></div></div><button className="primary-button" disabled={!!busy} onClick={()=>void settle(order)}>{busy===order.id?'عم نسجل التسوية…':'تأكيد استلام النقد وتسوية الطلب'}</button></article>):<div className="zone-empty"><strong>ما في طلبات بانتظار التسوية</strong><p>طلبات التوصيل المكتملة رح تظهر هون.</p></div>}</section></div><section className="panel pricing-audit">
      <div className="panel-heading"><div><h2>سجل التسويات الأخيرة</h2><p>تفصيل المشتريات والنقد والعمولة وحصة السائق. العكس يحفظ السجل الأصلي.</p></div></div>
      {settlements.length ? settlements.map((row) => {
        const reversed = reversedSettlementIds.includes(row.id)
        return <article className="audit-entry" key={row.id}>
          <div><strong>طلب #{row.order_id.slice(0,8)} · سائق {row.driver_id.slice(0,8)} · {reversed ? 'معكوسة' : 'فعّالة'}</strong><small>تسوية #{row.id} · {new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(row.created_at))}</small></div>
          <div className="audit-values"><span>المشتريات: {money(row.purchase_amount_minor)}</span><span>النقد: {money(row.cash_collected_minor)}</span><span>العمولة: {money(row.commission_amount_minor)}</span><span>حصة السائق: {money(row.driver_earning_minor)}</span></div>
          {!reversed && <button className="reversal-button" disabled={busy===`settlement-${row.id}`} onClick={() => void reverseSettlement(row)}>{busy===`settlement-${row.id}` ? 'عم نعكس…' : 'عكس التسوية'}</button>}
        </article>
      }) : <div className="zone-empty"><p>ما تمت تسويات بعد.</p></div>}
    </section></>
}

function NotificationsPanel({userId}:{userId:string}) {
  type Notification=Pick<Database['public']['Tables']['notifications']['Row'],'id'|'title'|'body'|'created_at'|'read_at'|'order_id'>
  const [items,setItems]=useState<Notification[]>([]); const [loading,setLoading]=useState(true); const [message,setMessage]=useState('')
  const refresh=async()=>{
    if(!supabase)return
    const {data,error}=await supabase.from('notifications').select('id,title,body,created_at,read_at,order_id').order('created_at',{ascending:false}).limit(50)
    if(error)setMessage('ما قدرنا نحمّل التنبيهات.')
    else {setItems(data??[]);setMessage('')}
    setLoading(false)
  }
  useEffect(()=>{
    void refresh();if(!supabase)return
    const channel=supabase.channel('admin-notifications-'+userId).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_id=eq.'+userId},()=>{void refresh()}).subscribe()
    return ()=>{void supabase?.removeChannel(channel)}
  },[userId])
  const markRead=async(id:number)=>{
    if(!supabase)return
    const {error}=await supabase.rpc('mark_notification_read',{p_notification_id:id})
    if(error){setMessage('ما قدرنا نحدّث التنبيه.');return}
    setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item))
  }
  return <><div className="connection-card"><div className="connection-symbol">♢</div><div><strong>صندوق التنبيهات</strong><p>تحديثات الطلبات والعمليات محفوظة ويمكن الرجوع إليها.</p></div><span className="connection-tag">{items.filter(item=>!item.read_at).length} غير مقروء</span></div>{message&&<p className="error-line" role="alert">{message}</p>}<section className="panel pricing-audit"><div className="panel-heading"><div><h2>آخر التنبيهات</h2><p>التنبيهات الظاهرة مخصصة لحساب المدير الحالي.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث التنبيهات">↻</button></div>{loading?<div className="zone-empty">عم نحمّل التنبيهات…</div>:items.length?items.map(item=><article className="audit-entry" key={item.id} style={{opacity:item.read_at?0.65:1}}><div><strong>{item.title}</strong><small>{new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}{item.order_id?' · طلب #'+item.order_id.slice(0,8):''}</small><p>{item.body}</p></div>{!item.read_at&&<button className="secondary-button" onClick={()=>void markRead(item.id)}>تعليم كمقروء</button>}</article>):<div className="zone-empty"><p>ما في تنبيهات حالياً.</p></div>}</section></>
}

function DisputesPanel() {
  type Dispute=Database['public']['Tables']['order_disputes']['Row']
  const [items,setItems]=useState<Dispute[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState('');const [message,setMessage]=useState('')
  const refresh=async()=>{if(!supabase)return;setLoading(true);const {data,error}=await supabase.from('order_disputes').select('*').order('created_at',{ascending:false}).limit(100);if(error)setMessage('ما قدرنا نحمّل قضايا الدعم.');else setItems(data??[]);setLoading(false)}
  useEffect(()=>{
    void refresh();if(!supabase)return
    const channel=supabase.channel('admin-order-disputes').on('postgres_changes',{event:'*',schema:'public',table:'order_disputes'},()=>{void refresh()}).subscribe()
    return ()=>{void supabase?.removeChannel(channel)}
  },[])
  const resolve=async(item:Dispute)=>{if(!supabase)return;const resolution=window.prompt('اكتب ملخص الحل أو الخطوة المتفق عليها (5 أحرف على الأقل)')?.trim();if(!resolution)return;setBusy(item.id);setMessage('');const {error}=await supabase.rpc('resolve_order_dispute',{p_dispute_id:item.id,p_resolution:resolution});setBusy('');if(error){setMessage('ما قدرنا نحفظ الحل. تأكد أن القضية ما زالت مفتوحة.');return}setMessage('انحفظ الحل، وبقي سجل التسوية المالية كما هو.');await refresh()}
  return <><div className="connection-card"><div className="connection-symbol">⌁</div><div><strong>الدعم والنزاعات</strong><p>راجع وصف العميل أو السائق ووثّق الحل. حل القضية لا يغيّر قيود المحفظة أو التسوية تلقائياً.</p></div><span className="connection-tag">{items.filter(item=>!item.resolved_at).length} مفتوحة</span></div>{message&&<p className="form-feedback" role="status">{message}</p>}<section className="panel pricing-audit"><div className="panel-heading"><div><h2>القضايا</h2><p>آخر 100 قضية، المفتوحة أولاً.</p></div><button className="refresh-button" onClick={()=>void refresh()} aria-label="تحديث القضايا">↻</button></div>{loading?<div className="zone-empty">عم نحمّل القضايا…</div>:items.length?items.map(item=><article className="audit-entry" key={item.id}><div><strong>طلب #{item.order_id.slice(0,8)} · {item.reason}</strong><small>{item.resolved_at?'محلولة':'مفتوحة'} · {new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}</small><p>{item.details}</p>{item.resolution&&<p><b>الحل:</b> {item.resolution}</p>}</div>{!item.resolved_at&&<button className="secondary-button" disabled={busy===item.id} onClick={()=>void resolve(item)}>{busy===item.id?'عم نحفظ…':'تسجيل الحل'}</button>}</article>):<div className="zone-empty"><p>ما في قضايا مسجلة.</p></div>}</section></>
}

function SettingsPanel({ onOpen }: { onOpen: (section: string) => void }) {
  const items = [
    { title: 'تسعير التوصيل', detail: 'المدير يحدد أجرة كل طلب حسب الطريق، والعميل يوافق قبل إرسال الطلب للسائقين.', action: 'الطلبات' },
    { title: 'العمولة والتوصيل النقدي', detail: 'نسبة العمولة تُدار من صفحة التسعير وتُحسب على أجرة التوصيل فقط. العميل يدفع للمندوب قيمة المشتريات والتوصيل، وتُسجل التسوية بعد تأكيد استلام النقد.', action: 'التسويات' },
    { title: 'دخول العملاء والسائقين', detail: 'الدخول بالبريد وكلمة السر، مع رمز تأكيد عند إنشاء الحساب فقط. السائق يحتاج دعوة وموافقة الإدارة.', action: 'السائقون' },
    { title: 'مناطق الخدمة', detail: 'أنشئ المنطقة كمسودة وراجعها قبل تفعيلها للعملاء.', action: 'المناطق' },
  ]
  return <><div className="connection-card"><div className="connection-symbol">⚙</div><div><strong>إعدادات التشغيل الحالية</strong><p>ملخص للقرارات المطبقة وروابط الصفحات التي تديرها.</p></div><span className="connection-tag">حالة التشغيل</span></div><div className="pricing-layout">{items.map((item) => <section className="panel pricing-global" key={item.title}><div className="panel-heading"><div><h2>{item.title}</h2><p>{item.detail}</p></div></div><button className="secondary-button" onClick={() => onOpen(item.action)}>فتح {item.action}</button></section>)}</div></>
}

function UsersPanel() {
  const [users, setUsers] = useState<AdminDirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [vehicleDescription, setVehicleDescription] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [accessBusyUser, setAccessBusyUser] = useState<string | null>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(false)
  const [vehicleLoadFailed, setVehicleLoadFailed] = useState(false)
  const editingUserRef = useRef<string | null>(null)

  const refresh = async () => {
    if (!supabase) return
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_users')
    if (error) setMessage('ما قدرنا نحمّل الحسابات. تأكد من جلسة المدير وحاول مرة ثانية.')
    else { setUsers(data ?? []); setMessage('') }
    setLoading(false)
  }
  useEffect(() => { void refresh() }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleUsers = users.filter((account) =>
    [account.email, account.display_name, account.user_id, ...account.roles]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  )
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

  return <>
    <div className="connection-card"><div className="connection-symbol">♧</div><div><strong>دليل الحسابات</strong><p>عرض إداري للبحث عن حسابات العملاء والسائقين وحالة بريدهم.</p></div><span className="connection-tag">{users.length} حساب</span></div>
    <section className="panel user-directory-panel">
      <div className="panel-heading"><div><h2>الحسابات المسجلة</h2><p>المعلومات هنا للمدير فقط؛ لا يمكن تغيير الأدوار من هذه الصفحة.</p></div><button className="refresh-button" onClick={() => void refresh()} aria-label="تحديث الحسابات">↻</button></div>
      <label className="user-search">بحث بالبريد أو الاسم أو رقم الحساب<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="name@example.com" /></label>
      {message && <p className="error-line" role="alert">{message}</p>}
      {loading ? <div className="zone-empty">عم نحمّل الحسابات…</div> : visibleUsers.length ? <div className="user-directory-list">{visibleUsers.map((account) => <article className="user-directory-entry" key={account.user_id}>
        <div className="user-directory-main"><div><strong>{account.display_name || account.email || 'حساب بدون اسم'}</strong><p dir="ltr">{account.email || 'ما في بريد مرتبط'}</p></div><span className="user-id" dir="ltr">{account.user_id.slice(0, 8)}…</span></div>
        <div className="user-directory-meta"><span className="user-roles">{account.roles.map((role) => <span className="user-role" key={role}>{roleLabels[role] ?? role}</span>)}</span><span>{account.email_confirmed ? 'البريد مؤكد' : 'البريد غير مؤكد'}</span><span>{account.account_suspended ? 'الحساب موقوف' : 'الحساب فعّال'}</span>{account.driver_status && <span>السائق: {driverLabels[account.driver_status] ?? account.driver_status}</span>}<span>آخر دخول: {account.last_sign_in_at ? new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium' }).format(new Date(account.last_sign_in_at)) : 'لم يسجّل دخول بعد'}</span></div>
        <button className="secondary-button user-edit-button" onClick={() => toggleEdit(account)}>{editingUser === account.user_id ? 'إغلاق التعديل' : 'تعديل الملف'}</button>
        {!account.roles.includes('super_admin') && <button className="secondary-button user-access-button" disabled={accessBusyUser === account.user_id} onClick={() => void changeAccountAccess(account)}>{accessBusyUser === account.user_id ? 'عم نحدّث الحساب…' : account.account_suspended ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب'}</button>}
        {editingUser === account.user_id && <form className="user-edit-form" onSubmit={(event) => void saveProfile(event, account)}>
          <label>اسم المستخدم<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} required /></label>
          {account.driver_status && <label>وصف المركبة<input value={vehicleDescription} onChange={(event) => setVehicleDescription(event.target.value)} maxLength={160} placeholder={loadingVehicle ? 'عم نحمّل…' : 'اختياري'} disabled={loadingVehicle||vehicleLoadFailed} /></label>}
          <label>سبب التعديل<input value={editReason} onChange={(event) => setEditReason(event.target.value)} minLength={5} maxLength={500} required /></label>
          <button className="primary-button" disabled={savingUser||loadingVehicle||vehicleLoadFailed}>{savingUser ? 'عم نحفظ…' : loadingVehicle ? 'عم نحمّل بيانات المركبة…' : vehicleLoadFailed ? 'تعذّر تحميل المركبة' : 'حفظ التغييرات'}</button>
        </form>}
      </article>)}</div> : <div className="zone-empty"><strong>{users.length ? 'ما لقينا حساب يطابق البحث' : 'ما في حسابات بعد'}</strong></div>}
      {!loading && <p className="user-result-count">عم تعرض {visibleUsers.length} من {users.length} حساب · الحد الأقصى 500</p>}
    </section>
  </>
}

function OverviewPanel({ onOpen }: { onOpen: (section: string) => void }) {
  type RecentOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'category'|'status'|'created_at'>
  const [counts, setCounts] = useState({ requested: 0, quoted: 0, searching: 0, onlineDrivers: 0, toSettle: 0, openDisputes: 0 })
  const [recent, setRecent] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const refresh = async () => {
    if (!supabase) return
    setLoading(true); setMessage('')
    const [requested, quoted, searching, drivers, toSettle, disputes, recentOrders] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'quoted'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'searching'),
      supabase.from('driver_profiles').select('user_id', { count: 'exact', head: true }).eq('review_status', 'approved').eq('is_online', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      supabase.from('order_disputes').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      supabase.from('orders').select('id,category,status,created_at').order('created_at', { ascending: false }).limit(5),
    ])
    const error = requested.error || quoted.error || searching.error || drivers.error || toSettle.error || disputes.error || recentOrders.error
    if (error) setMessage('تعذر تحميل ملخص التشغيل. حدّث الصفحة أو أعد المحاولة.')
    else {
      setCounts({ requested: requested.count ?? 0, quoted: quoted.count ?? 0, searching: searching.count ?? 0, onlineDrivers: drivers.count ?? 0, toSettle: toSettle.count ?? 0, openDisputes: disputes.count ?? 0 })
      setRecent(recentOrders.data ?? [])
    }
    setLoading(false)
  }
  useEffect(() => {
    void refresh()
    if (!supabase) return
    const channel = supabase.channel('admin-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_disputes' }, () => { void refresh() })
      .subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }, [])
  const tiles = [
    { label: 'طلبات جديدة', value: counts.requested, section: 'الطلبات', note: 'تحتاج تحديد أجرة الطريق' },
    { label: 'بانتظار موافقة السعر', value: counts.quoted, section: 'الطلبات', note: 'أرسل العميل موافقته قبل التوزيع' },
    { label: 'عم ندور على سائق', value: counts.searching, section: 'الطلبات', note: 'عروض التوصيل المرسلة' },
    { label: 'سائقون متصلون', value: counts.onlineDrivers, section: 'السائقون', note: 'من السائقين المعتمدين' },
    { label: 'بانتظار التسوية', value: counts.toSettle, section: 'التسويات', note: 'توصيل مكتمل ونقد بانتظار التأكيد' },
    { label: 'قضايا مفتوحة', value: counts.openDisputes, section: 'الدعم والنزاعات', note: 'تحتاج مراجعة الإدارة' },
  ]
  const statusLabel = (status: string) => orderStates.find((item) => item.value === status)?.label ?? status
  return <>
    <div className="overview-heading"><div><strong>ملخص التشغيل</strong><p>أرقام مباشرة من الطلبات والسائقين والدعم.</p></div><button className="refresh-button" onClick={() => void refresh()} aria-label="تحديث ملخص التشغيل">↻</button></div>
    {message && <p className="error-line" role="alert">{message}</p>}
    <div className="overview-grid">{tiles.map((tile) => <button className="overview-tile" key={tile.label} onClick={() => onOpen(tile.section)}><span>{tile.label}</span><strong>{loading ? '…' : new Intl.NumberFormat('ar-SY').format(tile.value)}</strong><small>{tile.note}</small></button>)}</div>
    <section className="panel overview-recent"><div className="panel-heading"><div><h2>أحدث الطلبات</h2><p>آخر خمسة طلبات وصلت للنظام.</p></div><button className="secondary-button" onClick={() => onOpen('الطلبات')}>فتح كل الطلبات</button></div>
      {loading ? <div className="zone-empty">عم نحمّل آخر الطلبات…</div> : recent.length ? <div className="overview-recent-list">{recent.map((order) => <article className="overview-recent-row" key={order.id}><div><strong>{order.category}</strong><small>#{order.id.slice(0, 8)} · {new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}</small></div><span className="status-pill">{statusLabel(order.status)}</span></article>)}</div> : <div className="zone-empty"><strong>ما في طلبات لسه</strong><p>الطلبات الجديدة رح تظهر هون بعد إرسالها من التطبيق.</p></div>}
    </section>
  </>
}

function AdminShell({ active, setActive, user }: { active: string; setActive: (value: string) => void; user: User | null }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [orderMessage, setOrderMessage] = useState('')
  const [quoteFees, setQuoteFees] = useState<Record<string, string>>({})
  const [quoteReasons, setQuoteReasons] = useState<Record<string, string>>({})
  const [quoteBusy, setQuoteBusy] = useState('')
  const [loadingZones, setLoadingZones] = useState(false)
  const [zoneError, setZoneError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [name, setName] = useState('')
  const [governorate, setGovernorate] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [fee, setFee] = useState('0')

  const loadZones = async () => {
    if (!supabase) return
    setLoadingZones(true); setZoneError('')
    const { data, error } = await supabase.from('service_zones').select('*').order('governorate').order('city').order('name')
    if (error) setZoneError('ما قدرنا نحمّل مناطق الخدمة. جرّب تحدّث الصفحة.')
    else setZones(data ?? [])
    setLoadingZones(false)
  }
  useEffect(() => { if (active === 'المناطق') void loadZones() }, [active])
  const loadOrders = async () => {
    if (!supabase) return
    setLoadingOrders(true); setOrderMessage('')
    const { data, error } = await supabase.from('orders').select('id,customer_id,address_id,category,request_text,status,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,created_at').order('created_at', { ascending: false }).limit(100)
    if (error) setOrderMessage('ما قدرنا نحمّل الطلبات. جرّب تحدّث القائمة.')
    else setOrders(data ?? [])
    setLoadingOrders(false)
  }
  useEffect(() => {
    if (active !== 'الطلبات' || !supabase) return
    void loadOrders()
    const channel = supabase.channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void loadOrders() }).subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }, [active])
  const dispatchOrder = async (id: string) => {
    if (!supabase) return
    setOrderMessage('')
    const { data, error } = await supabase.rpc('dispatch_order', { p_order_id: id })
    if (error) { setOrderMessage(error.message.includes('Commission policy') ? 'حدد نسبة العمولة أولاً من صفحة التسعير.' : error.message.includes('No online approved drivers') ? 'ما في سائقين رصيدهم كافي ومتصلين بهالمنطقة.' : 'ما قدرنا نرسل الطلب للسائقين.') ; return }
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status: 'searching' } : order))
    setOrderMessage(`انرسل العرض إلى ${data} سائق ضمن المنطقة.`)
  }
  const saveDeliveryQuote = async (event: FormEvent, order: AdminOrder) => {
    event.preventDefault(); if (!supabase) return
    const amount = Number(quoteFees[order.id] ?? '')
    const reason = (quoteReasons[order.id] ?? '').trim()
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) { setOrderMessage('أجرة التوصيل لازم تكون رقماً صحيحاً بين 0 و100 مليون قرش.'); return }
    if (reason.length < 5) { setOrderMessage('اكتب سبب التسعير أو ملاحظة المسافة (5 أحرف على الأقل).'); return }
    setQuoteBusy(order.id); setOrderMessage('')
    const { error } = await supabase.rpc('set_order_delivery_quote', { p_order_id: order.id, p_fee_minor: amount, p_reason: reason })
    setQuoteBusy('')
    if (error) { setOrderMessage('ما قدرنا نحفظ أجرة الطريق. تأكد أن الطلب بانتظار التسعير.'); return }
    setQuoteReasons((current) => ({ ...current, [order.id]: '' }))
    setOrderMessage('انرسلت أجرة التوصيل للعميل، والتوزيع ينتظر موافقته.')
    await loadOrders()
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
    const surcharge = Number(fee)
    if (!Number.isSafeInteger(surcharge) || surcharge < 0) { setFormMessage('رسوم التوصيل لازم تكون رقماً صحيحاً موجباً أو صفراً.'); return }
    setSaving(true); setFormMessage('')
    const { error } = await supabase.from('service_zones').insert({ name: name.trim(), governorate: governorate.trim(), city: city.trim(), neighborhood: neighborhood.trim() || null, delivery_surcharge_minor: surcharge, currency: 'SYP', active: false })
    setSaving(false)
    if (error) { setFormMessage(error.code === '23505' ? 'هالموقع مضاف من قبل.' : 'ما انحفظت المنطقة. تأكد من البيانات وحاول مرة ثانية.'); return }
    setName(''); setGovernorate(''); setCity(''); setNeighborhood(''); setFee('0'); setFormMessage('انضافت المنطقة كمسودة. فعّلها بعد ما تتأكد من تفاصيلها.'); await loadZones()
  }

  const toggleZone = async (zone: Zone) => {
    if (!supabase) return
    const { error } = await supabase.from('service_zones').update({ active: !zone.active }).eq('id', zone.id)
    if (error) setZoneError('ما قدرنا نغيّر حالة المنطقة.')
    else setZones((current) => current.map((item) => item.id === zone.id ? { ...item, active: !zone.active } : item))
  }

  const signOut = async () => { await supabase?.auth.signOut() }
  return <div className="admin" dir="rtl">
    <aside className="sidebar"><a className="brand" href="#home" onClick={() => setActive(nav[0])} aria-label="لَبّيك لوحة الإدارة الرئيسية"><span className="brand-mark">ل</span><span>لَبّيك<small>لوحة الإدارة</small></span></a><div className="workspace-label">مساحة العمل</div><nav aria-label="القائمة الرئيسية">{nav.map((item, i) => <button key={item} className={`nav-item ${active === item ? 'selected' : ''}`} onClick={() => setActive(item)} aria-pressed={active === item}><span className="nav-icon" aria-hidden="true">{['⌂','≋','♙','♧','◈','⌖','▤','♢','⌁','⚙'][i]}</span>{item}</button>)}</nav><button className="sidebar-bottom account-button" onClick={() => void signOut()} aria-label="تسجيل الخروج من لوحة الإدارة"><span className="avatar" aria-hidden="true">ل</span><span className="account-copy">{user?.email || 'مدير لَبّيك'}<small>تسجيل الخروج</small></span><span className="more">↗</span></button></aside>
    <main className="main"><header className="topbar"><div><span className="crumb">لوحة الإدارة</span><span className="slash">/</span><strong>{active}</strong></div><div className="top-actions"><span className="environment"><i className="online-dot"/> جلسة مدير موثّقة</span><span className="admin-avatar">{user?.email?.slice(0,1).toUpperCase() || 'ل'}</span></div></header>
      <section className="page"><div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('ar-SY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p><h1>{active === nav[0] ? 'أهلاً في لَبّيك' : active}</h1><p className="subtitle">{active === nav[0] ? 'من هون بتتابع الطلبات والتشغيل اليومي.' : `إدارة ومتابعة ${active} ضمن نظام لَبّيك.`}</p></div></div>
        {active === 'نظرة عامة' ? <OverviewPanel onOpen={setActive}/> : active === 'الطلبات' ? <><section className="panel order-admin-panel"><div className="panel-heading"><div><h2>الطلبات الواردة</h2><p>حدد أجرة كل طلب حسب مسافة الطريق، ثم انتظر موافقة العميل قبل التوزيع.</p></div><button className="refresh-button" onClick={() => void loadOrders()} aria-label="تحديث الطلبات">↻</button></div>{orderMessage && <p className="error-line" role="alert">{orderMessage}</p>}{loadingOrders ? <div className="zone-empty">عم نحمّل الطلبات…</div> : orders.length ? <div className="admin-order-list">{orders.map(order => <article className="admin-order" key={order.id}><div className="admin-order-head"><div><span className="order-reference">#{order.id.slice(0,8)}</span><span className="status-pill is-active"><i/>{orderStates.find(x=>x.value===order.status)?.label??order.status}</span></div><time>{new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(order.created_at))}</time></div><div className="admin-order-copy"><strong>{order.category}</strong><p>{order.request_text}</p><small>العميل {order.customer_id.slice(0,8)}… · العنوان {order.address_id.slice(0,8)}…</small><small>سقف الشراء {new Intl.NumberFormat('ar-SY').format(order.budget_ceiling_minor)} قرش</small></div><div className="admin-order-actions"><span>{order.delivery_quote_set_at ? `أجرة التوصيل ${new Intl.NumberFormat('ar-SY').format(order.delivery_fee_minor)} قرش${order.delivery_quote_approved_at ? ' · وافق العميل' : ' · بانتظار موافقة العميل'}` : 'بانتظار تحديد أجرة الطريق'}</span>{['requested','quoted'].includes(order.status) && !order.delivery_quote_approved_at && <form className="admin-quote-form" onSubmit={(event) => void saveDeliveryQuote(event, order)}><label>أجرة الطريق · قرش<input type="number" min="0" max="100000000" step="1" value={quoteFees[order.id] ?? ''} onChange={(event) => setQuoteFees((current) => ({ ...current, [order.id]: event.target.value }))} required /></label><label>سبب أو ملاحظة المسافة<input value={quoteReasons[order.id] ?? ''} onChange={(event) => setQuoteReasons((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="مثال: تقدير المسار من جرمانا للمزة" minLength={5} maxLength={500} required /></label><button className="secondary-button" disabled={quoteBusy === order.id}>{quoteBusy === order.id ? 'عم نحفظ…' : order.delivery_quote_set_at ? 'تعديل الأجرة وإعادة الإرسال' : 'إرسال الأجرة للعميل'}</button></form>}{['requested','searching'].includes(order.status) && !!order.delivery_quote_approved_at && <button className="dispatch-button" onClick={() => void dispatchOrder(order.id)}>{order.status === 'searching' ? 'إعادة إرسال للسائقين ←' : 'إرسال للسائقين ←'}</button>}{(['requested','quoted','searching','accepted','assigned','awaiting_approval'].includes(order.status)||(order.status==='shopping'&&order.purchase_amount_minor===null))&&<button className="cancel-admin-button" onClick={()=>void cancelOrder(order.id)}>إلغاء الطلب</button>}</div></article>)}</div>:<div className="zone-empty"><strong>لسه ما وصل طلب</strong></div>}</section></> : active === 'السائقون' ? <DriversPanel userId={user?.id??''}/> : active === 'المستخدمون' ? <UsersPanel/> : active === 'التسعير' ? <PricingPanel/> : active === 'التسويات' ? <SettlementPanel/> : active === 'التنبيهات' ? <NotificationsPanel userId={user?.id??''}/> : active === 'الدعم والنزاعات' ? <DisputesPanel/> : active === 'المناطق' ? <><div className="zone-layout"><section className="panel zone-form-panel"><div className="panel-heading"><div><h2>أضف منطقة</h2><p>حدد موقع التوصيل ورسومه.</p></div><span className="step-mark">01</span></div><form className="zone-form" onSubmit={addZone}><label>اسم العرض<input value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: المزة" required maxLength={100}/></label><div className="field-pair"><label>المحافظة<input value={governorate} onChange={e=>setGovernorate(e.target.value)} placeholder="دمشق" required maxLength={100}/></label><label>المدينة<input value={city} onChange={e=>setCity(e.target.value)} placeholder="دمشق" required maxLength={100}/></label></div><label>الحي · اختياري<input value={neighborhood} onChange={e=>setNeighborhood(e.target.value)} placeholder="المزة" maxLength={100}/></label><label>رسوم التوصيل · قرش<input type="number" min="0" step="1" value={fee} onChange={e=>setFee(e.target.value)} required/></label><button className="primary-button create-button" disabled={saving}>{saving?'عم نحفظ…':'حفظ كمسودة'} ←</button>{formMessage&&<p className="form-feedback" role="status">{formMessage}</p>}</form></section><section className="panel zone-list-panel"><div className="panel-heading"><div><h2>مناطق التوصيل</h2><p>إدارة المناطق المنشورة للعملاء.</p></div><button className="refresh-button" onClick={()=>void loadZones()} aria-label="تحديث المناطق">↻</button></div>{zoneError&&<p className="error-line" role="alert">{zoneError}</p>}{loadingZones?<div className="zone-empty">عم نحمّل المناطق…</div>:zones.length===0?<div className="zone-empty"><strong>ابدأ بأول منطقة خدمة</strong></div>:<div className="zone-list">{zones.map(zone=><article key={zone.id} className="zone-row"><div className="zone-location"><span className="zone-pin">{zone.active?'●':'⌖'}</span><div><strong>{zone.name}</strong><p>{[zone.neighborhood,zone.city,zone.governorate].filter(Boolean).join('، ')}</p></div></div><div className="zone-status"><span className="status-pill">{zone.active?'فعّالة':'مسودة'}</span><button className="toggle-button" onClick={()=>void toggleZone(zone)} role="switch" aria-checked={zone.active} aria-label={`تفعيل منطقة ${zone.name}`}><span/></button></div></article>)}</div>}</section></div></> : active === 'الإعدادات' ? <SettingsPanel onOpen={setActive}/> : <div className="empty-panel"><h3>مرحباً في لوحة لَبّيك</h3><p>تابع الطلبات والسائقين والأسعار من القائمة.</p><button className="text-button" onClick={()=>setActive('الطلبات')}>عرض الطلبات ←</button></div>}
        <footer>لَبّيك <span>•</span> لوحة الإدارة · بيانات تشغيل فعلية</footer></section>
    </main>
  </div>
}

export default App

