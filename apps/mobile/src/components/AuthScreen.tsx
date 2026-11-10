import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { AppText as Text } from '@/components/AppText';

type AuthMode = 'login' | 'signup' | 'code' | 'reset';

export function PasswordRecoveryScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async () => {
    if (!supabase) return;
    if (password.length < 8) { setMessage('كلمة السر لازم تكون 8 أحرف على الأقل.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نحدّث كلمة السر. اطلب رابط استعادة جديد.'); return; }
    onDone();
  };
  return <SafeAreaView style={s.safe}><View style={s.content}><View style={s.formCard}><Text style={s.title}>كلمة سر جديدة</Text><Text style={s.copy}>اختر كلمة سر من 8 أحرف على الأقل.</Text><Text style={s.label}>كلمة السر</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" style={s.input} accessibilityLabel="كلمة السر الجديدة"/><Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[s.button,busy&&s.disabled]}>{busy?<ActivityIndicator color="#0B1411"/>:<Text style={s.buttonText}>حفظ كلمة السر</Text>}</Pressable>{message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}</View></View></SafeAreaView>;
}

export function AuthScreen({ inviteToken }: { inviteToken?: string }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const normalized = email.trim().toLowerCase();

  const submit = async () => {
    if (!supabase) return;
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setMessage('تأكد من كتابة بريد إلكتروني صحيح.'); return; }
    setBusy(true); setMessage('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
      setBusy(false);
      setMessage(error ? 'البريد أو كلمة السر غير صحيحة. جرّب مرة ثانية.' : '');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 8) { setBusy(false); setMessage('كلمة السر لازم تكون 8 أحرف على الأقل.'); return; }
      const baseUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? new URL('/', window.location.origin).toString() : Linking.createURL('/');
      const separator = baseUrl.includes('?') ? '&' : '?';
      const emailRedirectTo = `${baseUrl}${inviteToken ? `${separator}invite=${encodeURIComponent(inviteToken)}` : ''}`;
      const { data, error } = await supabase.auth.signUp({ email: normalized, password, options: { emailRedirectTo } });
      setBusy(false);
      if (error) { setMessage(error.message.includes('already registered') ? 'هذا البريد مسجل من قبل. سجّل دخولك.' : 'ما قدرنا ننشئ الحساب. تأكد من البريد وجرب مرة ثانية.'); return; }
      if (data.session) { setMessage('تم إنشاء الحساب ودخولك بنجاح.'); return; }
      setMode('code'); setMessage(`بعتنا رمز تأكيد إلى ${normalized}. أدخله مرة واحدة لتفعيل حسابك.`); return;
    }
    if (mode === 'code') {
      const { error } = await supabase.auth.verifyOtp({ email: normalized, token: code.trim(), type: 'signup' });
      setBusy(false);
      setMessage(error ? 'الرمز غير صحيح أو انتهت صلاحيته. جرّب مرة ثانية.' : '');
      return;
    }
    const baseUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? new URL('/', window.location.origin).toString() : Linking.createURL('/');
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo: baseUrl });
    setBusy(false);
    setMessage(error ? 'ما قدرنا نبعت رسالة استعادة كلمة السر.' : 'إذا كان البريد مسجلاً، رح توصلك رسالة لتغيير كلمة السر.');
  };

  const resendCode = async () => {
    if (!supabase || !normalized) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.resend({ type: 'signup', email: normalized });
    setBusy(false);
    setMessage(error ? 'ما قدرنا نعيد إرسال الرمز. انتظر شوي وجرب مرة ثانية.' : `أعدنا إرسال رمز التأكيد إلى ${normalized}.`);
  };

  const title = mode === 'login' ? 'أهلاً فيك' : mode === 'signup' ? 'حساب جديد' : mode === 'code' ? 'تأكيد البريد' : 'نسيت كلمة السر؟';
  return <SafeAreaView style={s.safe}><View style={s.content}>
    <View style={s.topline}><View style={s.mark}><Text style={s.markText}>ل</Text></View><View style={s.brandCopy}><Text style={s.brand}>لَبّيك</Text><Text style={s.tag}>اطلب، والباقي علينا.</Text></View><View style={s.topChip}><View style={s.statusDot}/><Text style={s.topChipText}>دخول آمن</Text></View></View>
    <View style={s.hero}><View style={s.heroText}><Text style={s.eyebrow}>خدمة يومك تبدأ من هون</Text><Text style={s.heroTitle}>احتياجاتك،{'\n'}بطلب واحد.</Text><Text style={s.heroCopy}>اكتب طلبك وخلي علينا الباقي.</Text></View><View style={s.art} accessibilityElementsHidden><View style={s.artOrbit}><View style={s.artTile}><Text style={s.artLetter}>ل</Text></View><View style={s.artPin}><Text style={s.artPinGlyph}>⌖</Text></View><View style={s.artSpark}/></View></View></View>
    <View style={s.formCard}><Text style={s.title}>{title}</Text><Text style={s.copy}>{mode === 'login' ? 'سجّل دخولك بالبريد وكلمة السر.' : mode === 'signup' ? 'أنشئ حسابك. رح نطلب رمز البريد مرة واحدة لتأكيده.' : mode === 'code' ? `أدخل الرمز اللي وصل إلى ${normalized}.` : 'أدخل بريدك لنرسل لك رابط تغيير كلمة السر.'}</Text>
    {mode !== 'code' && <><Text style={s.label}>البريد الإلكتروني</Text><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textAlign="left" autoComplete="email" placeholder="name@example.com" placeholderTextColor="#839188" style={s.input} accessibilityLabel="البريد الإلكتروني"/> </>}
    {(mode === 'login' || mode === 'signup') && <><Text style={s.label}>كلمة السر</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="8 أحرف على الأقل" placeholderTextColor="#839188" style={s.input} accessibilityLabel="كلمة السر"/></>}
    {mode === 'code' && <><Text style={s.label}>رمز التأكيد</Text><TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" textAlign="center" maxLength={8} placeholder="12345678" placeholderTextColor="#839188" style={s.input} accessibilityLabel="رمز تأكيد البريد" accessibilityHint="أدخل الرمز المكوّن من 8 أرقام الذي وصلك بالبريد"/></>}
    <Pressable disabled={busy} onPress={() => void submit()} style={[s.button,busy&&s.disabled]} accessibilityRole="button">{busy?<ActivityIndicator color="#0B1411"/>:<Text style={s.buttonText}>{mode === 'login' ? 'تسجيل الدخول' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'code' ? 'تأكيد الرمز' : 'إرسال رابط الاستعادة'} <Text style={s.arrow}>←</Text></Text>}</Pressable>
    {mode === 'login' && <Pressable accessibilityRole="button" onPress={() => { setMode('signup'); setMessage(''); }} style={s.back}><Text style={s.backText}>إنشاء حساب جديد</Text></Pressable>}
    {mode === 'login' && <Pressable accessibilityRole="button" onPress={() => { setMode('reset'); setMessage(''); }} style={s.back}><Text style={s.backText}>نسيت كلمة السر؟</Text></Pressable>}
    {mode === 'code' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resendCode()} style={s.back}><Text style={s.backText}>إعادة إرسال الرمز</Text></Pressable>}
    {(mode === 'signup' || mode === 'reset' || mode === 'code') && <Pressable accessibilityRole="button" onPress={() => { setMode('login'); setMessage(''); }} style={s.back}><Text style={s.backText}>رجوع لتسجيل الدخول</Text></Pressable>}
    {message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
    </View><Text style={s.legal}>رمز البريد مطلوب عند إنشاء الحساب فقط.</Text>
  </View></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#0B1411'},content:{width:'100%',maxWidth:500,alignSelf:'center',paddingHorizontal:22,paddingTop:18,paddingBottom:24},
  topline:{flexDirection:'row',alignItems:'center',gap:11},mark:{width:44,height:44,borderRadius:15,backgroundColor:'#B7FF30',alignItems:'center',justifyContent:'center'},markText:{fontSize:29,fontWeight:'800',color:'#0B1411'},brandCopy:{gap:0},brand:{color:'#fff',fontSize:18,fontWeight:'800'},tag:{color:'#A9B9B0',fontSize:11,marginTop:-2},topChip:{marginRight:'auto',height:30,paddingHorizontal:10,borderRadius:18,backgroundColor:'#17251C',flexDirection:'row',alignItems:'center',gap:6},statusDot:{width:6,height:6,borderRadius:3,backgroundColor:'#52D5A0'},topChipText:{color:'#B8C8BE',fontSize:10,fontWeight:'600'},
  hero:{height:218,marginTop:24,borderRadius:24,backgroundColor:'#B7FF30',overflow:'hidden',justifyContent:'center',paddingHorizontal:19},heroText:{width:'56%',marginLeft:'auto',zIndex:2},eyebrow:{color:'#455832',fontSize:11,fontWeight:'700'},heroTitle:{color:'#101912',fontSize:27,lineHeight:34,fontWeight:'800',marginTop:9},heroCopy:{color:'#435431',fontSize:13,marginTop:7},art:{position:'absolute',left:-17,top:0,bottom:0,width:'39%',alignItems:'center',justifyContent:'center'},artOrbit:{width:132,height:132,borderRadius:66,borderWidth:1,borderColor:'rgba(11,20,17,.18)',alignItems:'center',justifyContent:'center',transform:[{rotate:'-15deg'}]},artTile:{width:84,height:84,borderRadius:28,backgroundColor:'#E8FFBF',alignItems:'center',justifyContent:'center',transform:[{rotate:'15deg'}],shadowColor:'#243819',shadowOpacity:.16,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:4},artLetter:{fontSize:51,lineHeight:66,fontWeight:'800',color:'#18251A'},artPin:{position:'absolute',right:0,top:9,width:35,height:35,borderRadius:12,backgroundColor:'#18251A',alignItems:'center',justifyContent:'center',transform:[{rotate:'15deg'}]},artPinGlyph:{fontSize:19,color:'#B7FF30'},artSpark:{position:'absolute',left:5,top:26,width:10,height:10,borderRadius:4,backgroundColor:'#F8FFE9'},
  formCard:{marginTop:19,padding:19,borderRadius:21,borderWidth:1,borderColor:'#2C4034',backgroundColor:'#142119'},title:{color:'#fff',fontSize:22,fontWeight:'800',textAlign:'right'},copy:{color:'#A9B9B0',fontSize:13,textAlign:'right',lineHeight:21,marginTop:5,marginBottom:21},label:{fontSize:12,fontWeight:'700',color:'#E4EEE7',marginBottom:8,textAlign:'right',marginTop:11},input:{fontFamily:'Tajawal_400Regular',height:52,borderWidth:1,borderColor:'#405449',borderRadius:13,backgroundColor:'#0F1A13',paddingHorizontal:14,color:'#fff',fontSize:16},button:{height:53,backgroundColor:'#B7FF30',borderRadius:13,alignItems:'center',justifyContent:'center',marginTop:13},buttonText:{fontSize:14,fontWeight:'800',color:'#0B1411'},arrow:{fontSize:17},disabled:{opacity:.55},back:{minHeight:44,paddingVertical:10,justifyContent:'center'},backText:{color:'#D3EFA4',textAlign:'center',fontSize:13},message:{color:'#F6C76A',fontSize:12,lineHeight:19,textAlign:'right',marginTop:15},legal:{color:'#839188',fontSize:11,lineHeight:18,textAlign:'center',marginTop:16},
});
