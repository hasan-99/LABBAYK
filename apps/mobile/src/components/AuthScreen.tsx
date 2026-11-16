import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { AppText as Text } from '@/components/AppText';
import { useAppToast, useToastMessage } from '@/components/Toast';

type AuthMode = 'login' | 'signup' | 'code' | 'reset' | 'recovery-code';

export function PasswordRecoveryScreen({ onDone, theme }: { onDone: () => void; theme: 'dark' | 'light' }) {
  const s = useMemo(() => authStyles(theme), [theme]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useToastMessage();
  const showToast = useAppToast();
  const [messageError, setMessageError] = useState(false);
  const save = async () => {
    if (!supabase) return;
    if (password.length < 8) { setMessageError(true); setMessage('كلمة السر لازم تكون 8 أحرف على الأقل.'); return; }
    setBusy(true); setMessage(''); setMessageError(false);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setMessageError(true); setMessage('ما قدرنا نحدّث كلمة السر. اطلب رمز استعادة جديد.'); return; }
      showToast('تم تغيير كلمة السر.', 'success'); onDone();
    } catch { setMessageError(true); setMessage('تعذر الاتصال. تحقق من الإنترنت وحاول مرة ثانية.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={s.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollContent}><View accessibilityRole="main" style={s.content}><View style={s.formCard}><Text style={s.title}>كلمة سر جديدة</Text><Text style={s.copy}>اختر كلمة سر من 8 أحرف على الأقل.</Text><Text style={s.label}>كلمة السر</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" style={s.input} accessibilityLabel="كلمة السر الجديدة"/><Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[s.button,busy&&s.disabled]}>{busy?<ActivityIndicator color="#0B1411"/>:<Text style={s.buttonText}>حفظ كلمة السر</Text>}</Pressable>{message ? <Text accessibilityRole={messageError ? 'alert' : 'text'} style={[s.message,messageError&&s.messageError]}>{message}</Text> : null}</View></View></ScrollView></SafeAreaView>;
}

export function AuthScreen({ inviteToken, theme }: { inviteToken?: string; theme: 'dark' | 'light' }) {
  const s = useMemo(() => authStyles(theme), [theme]);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessageState] = useState('');
  const showToast = useAppToast();
  const setMessage = (text: string) => setMessageState(text);
  const [messageTone, setMessageTone] = useState<'error' | 'success' | 'info'>('info');
  const normalized = email.trim().toLowerCase();

  const showMessage = (text: string, tone: 'error' | 'success' | 'info' = 'info') => {
    setMessageState(text);
    if (text) showToast(text, tone);
    setMessageTone(tone);
  };

  const submit = async () => {
    if (!supabase) return;
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { showMessage('تأكد من كتابة بريد إلكتروني صحيح.', 'error'); return; }
    if ((mode === 'login' || mode === 'signup') && !password) { showMessage('اكتب كلمة السر أولاً.', 'error'); return; }
    setBusy(true); setMessage('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
        if (error) { showMessage('البريد أو كلمة السر غير صحيحة. إذا ما عندك حساب، أنشئ حساب جديد.', 'error'); return; }
        setMessage(''); return;
      }
      if (mode === 'signup') {
        if (password.length < 8) { showMessage('كلمة السر لازم تكون 8 أحرف على الأقل.', 'error'); return; }
        const baseUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? new URL('/', window.location.origin).toString() : Linking.createURL('/');
        const separator = baseUrl.includes('?') ? '&' : '?';
        const emailRedirectTo = `${baseUrl}${inviteToken ? `${separator}invite=${encodeURIComponent(inviteToken)}` : ''}`;
        const { data, error } = await supabase.auth.signUp({ email: normalized, password, options: { emailRedirectTo } });
        if (error) {
          const alreadyRegistered = /already registered|already been registered|user exists/i.test(error.message);
          showMessage(alreadyRegistered ? 'إيميلك مسجل من قبل. سجّل دخولك.' : 'ما قدرنا ننشئ الحساب. تأكد من البريد وجرب مرة ثانية.', 'error'); return;
        }
        if (data.user && data.user.identities?.length === 0) { showMessage('إيميلك مسجل من قبل. سجّل دخولك.', 'error'); return; }
        if (data.session) { showMessage('تم إنشاء الحساب ودخولك بنجاح.', 'success'); return; }
        setMode('code'); showMessage(`بعتنا رمز تأكيد إلى ${normalized}. أدخله مرة واحدة لتفعيل حسابك.`, 'success'); return;
      }
      if (mode === 'code' || mode === 'recovery-code') {
        if (!code.trim()) { showMessage('أدخل الرمز اللي وصلك على الإيميل.', 'error'); return; }
        const { error } = await supabase.auth.verifyOtp({ email: normalized, token: code.trim(), type: mode === 'code' ? 'signup' : 'recovery' });
        if (error) { showMessage('الرمز غير صحيح أو انتهت صلاحيته. جرّب مرة ثانية.', 'error'); return; }
        showMessage(mode === 'recovery-code' ? 'تم تأكيد الرمز. اختر كلمة سر جديدة.' : 'تم تأكيد بريدك وإنشاء الحساب.', 'success'); return;
      }
      const baseUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? new URL('/', window.location.origin).toString() : Linking.createURL('/');
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo: baseUrl });
      if (error) { showMessage('ما قدرنا نبعت رمز استعادة كلمة السر. تحقق من البريد وجرب مرة ثانية.', 'error'); return; }
      setMode('recovery-code'); showMessage(`إذا كان البريد مسجلاً، رح يصلك رمز تغيير كلمة السر إلى ${normalized}.`, 'success');
    } catch {
      showMessage('تعذر الاتصال. تحقق من الإنترنت وحاول مرة ثانية.', 'error');
    } finally { setBusy(false); }
  };

  const resendCode = async () => {
    if (!supabase || !normalized || busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: normalized });
      showMessage(error ? 'ما قدرنا نعيد إرسال الرمز. انتظر شوي وجرب مرة ثانية.' : `أعدنا إرسال رمز التأكيد إلى ${normalized}.`, error ? 'error' : 'success');
    } catch { showMessage('تعذر الاتصال. حاول إعادة إرسال الرمز بعد شوي.', 'error'); }
    finally { setBusy(false); }
  };

  const resendRecoveryCode = async () => {
    if (!supabase || !normalized || busy) return;
    const baseUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? new URL('/', window.location.origin).toString() : Linking.createURL('/');
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo: baseUrl });
      showMessage(error ? 'ما قدرنا نعيد إرسال رمز التغيير. انتظر شوي وجرب مرة ثانية.' : `أعدنا إرسال رمز تغيير كلمة السر إلى ${normalized}.`, error ? 'error' : 'success');
    } catch { showMessage('تعذر الاتصال. حاول إعادة إرسال الرمز بعد شوي.', 'error'); }
    finally { setBusy(false); }
  };

  const title = mode === 'login' ? 'أهلاً فيك' : mode === 'signup' ? 'حساب جديد' : mode === 'code' ? 'تأكيد البريد' : mode === 'recovery-code' ? 'رمز تغيير كلمة السر' : 'نسيت كلمة السر؟';
  return <SafeAreaView style={s.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollContent}><View accessibilityRole="main" style={s.content}>
    <View style={s.topline}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={{width:58,height:54,borderRadius:12,backgroundColor:'#fff'}} contentFit="contain" accessibilityLabel="شعار لَبّيك"/><View style={s.brandCopy}><Text style={s.brand}>لَبّيك</Text><Text style={s.tag}>اطلب، والباقي علينا.</Text></View></View>
    <View style={s.hero}><View style={s.heroText}><Text style={s.eyebrow}>خدمة يومك تبدأ من هون</Text><Text style={s.heroTitle}>احتياجاتك،{'\n'}بطلب واحد.</Text><Text style={s.heroCopy}>اكتب طلبك وخلي علينا الباقي.</Text></View><View style={s.art} accessibilityElementsHidden><View style={s.artOrbit}><View style={s.artTile}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.artLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك"/></View><View style={s.artPin}><Text style={s.artPinGlyph}>⌖</Text></View><View style={s.artSpark}/></View></View></View>
    <View style={s.formCard}><Text style={s.title}>{title}</Text><Text style={s.copy}>{mode === 'login' ? 'سجّل دخولك بالبريد وكلمة السر.' : mode === 'signup' ? 'أنشئ حسابك. رح نطلب رمز البريد مرة واحدة لتأكيده.' : mode === 'code' ? `أدخل الرمز اللي وصل إلى ${normalized}.` : mode === 'recovery-code' ? `أدخل رمز تغيير كلمة السر الذي وصل إلى ${normalized}.` : 'أدخل بريدك لنرسل لك رمز تغيير كلمة السر.'}</Text>
    {mode !== 'code' && <><Text style={s.label}>البريد الإلكتروني</Text><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textAlign="left" autoComplete="email" placeholder="name@example.com" placeholderTextColor="#839188" style={s.input} accessibilityLabel="البريد الإلكتروني"/></>}
    {(mode === 'login' || mode === 'signup') && <><Text style={s.label}>كلمة السر</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="8 أحرف على الأقل" placeholderTextColor="#839188" style={s.input} accessibilityLabel="كلمة السر"/></>}
    {(mode === 'code' || mode === 'recovery-code') && <><Text style={s.label}>{mode === 'code' ? 'رمز التأكيد' : 'رمز تغيير كلمة السر'}</Text><TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" textAlign="center" maxLength={8} placeholder="12345678" placeholderTextColor="#839188" style={s.input} accessibilityLabel={mode === 'code' ? 'رمز تأكيد البريد' : 'رمز تغيير كلمة السر'} accessibilityHint="أدخل الرمز المكوّن من 8 أرقام الذي وصلك بالبريد"/></>}
    <Pressable disabled={busy} onPress={() => void submit()} style={[s.button,busy&&s.disabled]} accessibilityRole="button">{busy?<ActivityIndicator color="#0B1411"/>:<Text style={s.buttonText}>{mode === 'login' ? 'تسجيل الدخول' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'recovery-code' || mode === 'code' ? 'تأكيد الرمز' : 'إرسال رمز التغيير'} <Text style={s.arrow}>←</Text></Text>}</Pressable>
    {mode === 'login' && <Pressable accessibilityRole="button" onPress={() => { setMode('signup'); setMessage(''); }} style={s.back}><Text style={s.backText}>إنشاء حساب جديد</Text></Pressable>}
    {mode === 'login' && <Pressable accessibilityRole="button" onPress={() => { setMode('reset'); setMessage(''); }} style={s.back}><Text style={s.backText}>نسيت كلمة السر؟</Text></Pressable>}
    {mode === 'code' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resendCode()} style={s.back}><Text style={s.backText}>إعادة إرسال الرمز</Text></Pressable>}
    {mode === 'recovery-code' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resendRecoveryCode()} style={s.back}><Text style={s.backText}>إعادة إرسال رمز التغيير</Text></Pressable>}
    {(mode === 'signup' || mode === 'reset' || mode === 'code' || mode === 'recovery-code') && <Pressable accessibilityRole="button" onPress={() => { setMode('login'); setMessage(''); }} style={s.back}><Text style={s.backText}>رجوع لتسجيل الدخول</Text></Pressable>}
    {message ? <Text accessibilityRole={messageTone === 'error' ? 'alert' : 'text'} style={[s.message, messageTone === 'error' ? s.messageError : messageTone === 'success' ? s.messageSuccess : s.messageInfo]}>{message}</Text> : null}
    </View>
  </View></ScrollView></SafeAreaView>;
}

const authStyleDefinitions = {
  safe:{flex:1,backgroundColor:'#0B1411'},scrollContent:{flexGrow:1},content:{width:'100%',maxWidth:500,alignSelf:'center',paddingHorizontal:22,paddingTop:18,paddingBottom:24},
  topline:{flexDirection:'row-reverse',alignItems:'center',gap:11,justifyContent:'flex-start'},brandCopy:{gap:0},brand:{color:'#fff',fontSize:18,fontWeight:'800'},tag:{color:'#A9B9B0',fontSize:11,marginTop:-2},
  hero:{height:218,marginTop:24,borderRadius:24,backgroundColor:'#B7FF30',overflow:'hidden',justifyContent:'center',paddingHorizontal:19},heroText:{width:'56%',marginLeft:'auto',zIndex:2},eyebrow:{color:'#455832',fontSize:11,fontWeight:'700'},heroTitle:{color:'#101912',fontSize:27,lineHeight:34,fontWeight:'800',marginTop:9},heroCopy:{color:'#435431',fontSize:13,marginTop:7},art:{position:'absolute',left:-17,top:0,bottom:0,width:'39%',alignItems:'center',justifyContent:'center'},artOrbit:{width:132,height:132,borderRadius:66,borderWidth:1,borderColor:'rgba(11,20,17,.18)',alignItems:'center',justifyContent:'center',transform:[{rotate:'-15deg'}]},artTile:{width:84,height:84,borderRadius:28,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',transform:[{rotate:'15deg'}],shadowColor:'#243819',shadowOpacity:.16,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:4},artLogo:{width:70,height:64,borderRadius:13},artPin:{position:'absolute',right:0,top:9,width:35,height:35,borderRadius:12,backgroundColor:'#18251A',alignItems:'center',justifyContent:'center',transform:[{rotate:'15deg'}]},artPinGlyph:{fontSize:19,color:'#B7FF30'},artSpark:{position:'absolute',left:5,top:26,width:10,height:10,borderRadius:4,backgroundColor:'#F8FFE9'},
  formCard:{marginTop:19,padding:19,borderRadius:21,borderWidth:1,borderColor:'#2C4034',backgroundColor:'#142119'},title:{color:'#fff',fontSize:22,fontWeight:'800',textAlign:'right'},copy:{color:'#A9B9B0',fontSize:13,textAlign:'right',lineHeight:21,marginTop:5,marginBottom:21},label:{fontSize:12,fontWeight:'700',color:'#E4EEE7',marginBottom:8,textAlign:'right',marginTop:11},input:{fontFamily:'Tajawal_400Regular',height:52,borderWidth:1,borderColor:'#405449',borderRadius:13,backgroundColor:'#0F1A13',paddingHorizontal:14,color:'#fff',fontSize:16},button:{height:53,backgroundColor:'#B7FF30',borderRadius:13,alignItems:'center',justifyContent:'center',marginTop:13},buttonText:{fontSize:14,fontWeight:'800',color:'#0B1411'},arrow:{fontSize:17},disabled:{opacity:.55},back:{minHeight:44,paddingVertical:10,justifyContent:'center'},backText:{color:'#D3EFA4',textAlign:'center',fontSize:13},message:{fontSize:13,lineHeight:20,textAlign:'right',marginTop:15,padding:12,borderRadius:12,borderWidth:1},messageError:{color:'#FFD1D1',borderColor:'#9A4242',backgroundColor:'#451E21'},messageSuccess:{color:'#DFFFAE',borderColor:'#557744',backgroundColor:'#263820'},messageInfo:{color:'#F6D795',borderColor:'#6F5B31',backgroundColor:'#352D1D'},
};
const authLightColors: Record<string,string> = {'#0B1411':'#F3F6F2','#142119':'#FFFFFF','#0F1A13':'#F3F6F2','#17251C':'#EDF3ED','#fff':'#18251C','#A9B9B0':'#58675D','#B8C8BE':'#58675D','#E4EEE7':'#24352A','#839188':'#65746A','#DFFFAD':'#365600','#DFFFAE':'#365600','#D3EFA4':'#365600','#2C4034':'#D5DFD6','#405449':'#C5D2C7','#F6D795':'#755A00','#FFD1D1':'#A33420','#451E21':'#FBE9E7','#263820':'#EAF3DF','#352D1D':'#FFF4D6'};
function authStyles(theme: 'dark' | 'light'): Record<string, any> {
  if (theme === 'dark') return StyleSheet.create(authStyleDefinitions as never) as Record<string, any>;
  const styles = Object.fromEntries(Object.entries(authStyleDefinitions).map(([name, style]) => [name, Object.fromEntries(Object.entries(style).map(([key,value]) => [key, typeof value === 'string' && /color/i.test(key) ? (key === 'color' && value === '#0B1411' ? '#18251C' : authLightColors[value] ?? (key === 'borderColor' ? '#D5DFD6' : value)) : value]))]));
  return StyleSheet.create(styles as never) as Record<string, any>;
}
