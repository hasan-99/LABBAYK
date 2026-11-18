import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { AppText as Text } from '@/components/AppText';
import { OPERATOR_NAME, SUPPORT_EMAIL } from '@/lib/legal-contact';
import { supabase } from '@/lib/supabase';
import { clearCustomerOrderDraft, clearCustomerOrdersSnapshot } from '@/lib/customer-order-draft';
import { clearDriverOrdersSnapshot } from '@/lib/driver-orders-cache';
import { unregisterPushNotifications } from '@/lib/push-notifications';

type PageName = 'privacy' | 'terms' | 'support' | 'delete-account';
type Section = { title: string; paragraphs: string[]; bullets?: string[] };

const pageContent: Record<PageName, { title: string; subtitle: string; updated: string; sections: Section[] }> = {
  privacy: {
    title: 'سياسة الخصوصية',
    subtitle: 'كيف يتعامل تطبيق لَبّيك مع معلوماتك.',
    updated: 'آخر تحديث: 17 تشرين الثاني 2026',
    sections: [
      { title: 'الجهة المشغّلة والتواصل', paragraphs: [`يشغّل خدمة لَبّيك ${OPERATOR_NAME} في دمشق وريف دمشق، سوريا. لأسئلة الخصوصية أو لممارسة حقوقك، راسل ${SUPPORT_EMAIL}.`] },
      { title: 'المعلومات التي نجمعها', paragraphs: ['نجمع ما يلزم لإنشاء الحساب وتشغيل خدمات الطلب والتوصيل. كلمة السر تُدار عبر Supabase Auth ولا نعرضها لموظفي لَبّيك.'], bullets: ['بيانات الحساب: البريد الإلكتروني، الاسم، وصورة الملف الشخصي إذا أضفتها.', 'صور إثبات التسليم: يلتقطها السائق عند تسليم الطلب، ويراها العميل والسائق المعيّن وإدارة لَبّيك فقط.', 'مبالغ الطلب: ميزانية العميل، ومبلغ المشتريات، والمبلغ المستلم عند التسليم، وملاحظة التسليم الاختيارية.', 'بلاغات الدعم: سبب البلاغ وتفاصيله، ولا يراها إلا صاحب البلاغ وإدارة لَبّيك.', 'بيانات العنوان والتواصل: رقم الهاتف، المدينة، الحي، العنوان وتفاصيل الوصول التي تدخلها.', 'بيانات الطلب: وصف الطلب وفئته والميزانية والصور الاختيارية وحالة الطلب والمحادثات/البلاغات المرتبطة به.', 'بيانات السائق: الاسم والهاتف والعمر ونوع المركبة، عند إنشاء ملف سائق.', 'التنبيهات: رمز الجهاز أو اشتراك المتصفح ومنصته لإرسال تحديثات الطلب.', 'بيانات محلية على جهازك: جلسة تسجيل الدخول وتفضيل المظهر ومسودة الطلب ونسخ مؤقتة من بعض البيانات للعمل عند ضعف الاتصال.'] },
      { title: 'لماذا نستخدمها', paragraphs: ['نستخدم المعلومات لإنشاء الحساب والتحقق منه، معالجة الطلب وتوصيله، التواصل بشأن العنوان والحالة، تشغيل الدعم وتسوية النزاعات، حماية الخدمة، وإرسال التنبيهات التي تختار تفعيلها. لا تستخدم النسخة الحالية أدوات إعلانات أو تحليلات سلوكية بحسب مراجعة الشيفرة الحالية.'] },
      { title: 'من يستلم المعلومات وأين تُخزّن', paragraphs: ['تُعالج بيانات الحساب والطلبات والصور عبر Supabase (المصادقة وقاعدة البيانات والتخزين)، ومشروع قاعدة البيانات الحالي مستضاف في المنطقة eu-central-1. قد يمر رمز الإشعار عبر Expo Push ثم Apple Push Notification service أو Firebase Cloud Messaging بحسب الجهاز. هذه الخدمات تستلم ما يلزم لتقديم وظائفها. لا نبيع بياناتك ولا نستخدمها للإعلانات.'] },
      { title: 'الصور والموقع والأذونات', paragraphs: ['يمكنك اختيار صورة للطلب أو الملف الشخصي من منتقي الصور في الجهاز. يستخدم السائق الكاميرا فقط لتصوير إثبات تسليم الطلب بعد موافقته على الإذن، ولا تُحفظ الصورة إلا عند تأكيد التسليم. لا يستخدم التطبيق تسجيل الصوت أو جهات الاتصال أو بيانات الصحة أو الموقع الدقيق في مساراته الحالية. تدخل عنوان التوصيل يدويًا.'] },
      { title: 'الاحتفاظ والحذف', paragraphs: ['يمكنك حذف حساب العميل من صفحة «حذف الحساب» داخل التطبيق بعد تسوية الطلبات المفتوحة وحل البلاغات. عند الحذف نزيل بيانات الحساب والعناوين والصور ووصف الطلب الذي قد يعرّف بك، ونفصل سجلات المبالغ والتسويات عن الحساب. قد نحتفظ بسجلات مالية أو أمنية منزوعة الهوية إذا تطلب القانون أو حل نزاع ذلك، ونحذفها عند انتهاء سبب الاحتفاظ. لا توجد مدة رقمية موحدة منشورة لهذه السجلات حاليًا. تحتاج حسابات السائق والإدارة إلى مراجعة الدعم بسبب الأرصدة والسجلات التشغيلية. ويمكن طلب الحذف الخارجي من صفحة الحذف العامة أو عبر بريد الدعم.'] },
      { title: 'حقوقك وأمان البيانات', paragraphs: ['يمكنك طلب الوصول إلى معلوماتك أو تصحيحها أو حذفها، وسنطلب ما يكفي للتحقق من ملكية الحساب. نستخدم اتصال HTTPS مع خدماتنا ونقصر الوصول التشغيلي على ما تتطلبه الوظيفة. لا توجد وسيلة نقل أو تخزين آمنة بالكامل؛ تواصل معنا فورًا إذا اشتبهت بوصول غير مصرح به إلى حسابك.'] },
      { title: 'المتصفح والتغييرات', paragraphs: ['نسخة الويب تحفظ جلسة الدخول في مساحة التخزين المحلية للمتصفح، وقد تستخدم عامل خدمة لدعم التطبيق والتنبيهات. لا نستخدم ملفات تعريف ارتباط إعلانية بحسب الشيفرة الحالية. سنحدّث هذه الصفحة عند تغيّر طريقة معالجة البيانات، ويظهر تاريخ آخر تحديث أعلاه.'] },
    ],
  },
  terms: {
    title: 'شروط الاستخدام',
    subtitle: 'الشروط الأساسية لاستخدام خدمة لَبّيك.',
    updated: 'آخر تحديث: 17 تشرين الثاني 2026',
    sections: [
      { title: 'عن الخدمة', paragraphs: ['لَبّيك خدمة لطلب شراء احتياجات يومية وتوصيلها ضمن مناطق الخدمة المتاحة في دمشق وريف دمشق. يرسل العميل وصف الطلب وعنوانه وميزانيته، ويتولى سائق معتمد تنفيذ الطلب وفق حالة الطلب والتعليمات الظاهرة في التطبيق.'] },
      { title: 'الحساب والمعلومات', paragraphs: ['قدّم معلومات صحيحة وحدّث الاسم والهاتف والعنوان عند الحاجة. أنت مسؤول عن حماية كلمة السر وعن النشاط الذي يتم من حسابك. حسابات السائقين تتطلب دعوة ومراجعة، ويشترط ملف السائق عمر 18 سنة أو أكثر.'] },
      { title: 'الأسعار والدفع', paragraphs: ['بعد إرسال الطلب، يحدد فريق الإدارة أجرة التوصيل ويُرسل الطلب إلى السائقين المتاحين، أو يعيّنه لسائق محدد. تظهر الأجرة للعميل والسائق داخل التطبيق، ويطّلع السائق عليها قبل قبول الطلب. أدخل ميزانية المشتريات بوضوح؛ يسجل السائق المبلغ الفعلي للمشتريات في الطلب، ولا يحتاج العميل إلى تأكيد إضافي عبر التطبيق بعد الشراء. الدفع في النسخة الحالية نقدًا عند الاستلام، ولا يعالج التطبيق بطاقات دفع أو اشتراكات رقمية.'] },
      { title: 'الإلغاء والمشكلات', paragraphs: ['تختلف إمكانية الإلغاء حسب مرحلة الطلب، وتظهر الخيارات المتاحة داخل التطبيق. بعد الشراء أو عند وجود خلاف، استخدم بلاغ الدعم المرتبط بالطلب أو تواصل معنا. لا تعتبر الطلبات المتنازع عليها منتهية حتى يراجعها فريق الدعم.'] },
      { title: 'الاستخدام المقبول', paragraphs: ['استخدم الخدمة لطلبات قانونية وآمنة، ولا ترسل محتوى أو صورًا تنتهك حقوق الآخرين أو تعرضهم للخطر. لا تحاول تجاوز ضوابط الحساب أو العبث بالتسعير أو الوصول إلى بيانات مستخدم آخر. قد نوقف الوصول عند إساءة الاستخدام أو وجود خطر أمني، مع توفير قناة للتواصل بشأن القرار.'] },
      { title: 'الجهة المشغّلة', paragraphs: [`تُقدَّم خدمة لَبّيك من ${OPERATOR_NAME}، في دمشق وريف دمشق، سوريا. للتواصل: ${SUPPORT_EMAIL}.`] },
      { title: 'التواصل والتغييرات', paragraphs: [`للمساعدة أو الاعتراض على مشكلة، راسل ${SUPPORT_EMAIL}. سننشر أي تعديل جوهري لهذه الشروط في هذه الصفحة قبل تطبيقه على الاستخدام اللاحق.`] },
    ],
  },
  support: {
    title: 'الدعم والمساعدة',
    subtitle: 'نساعدك في الطلبات والحساب والخصوصية.',
    updated: 'للتواصل: البريد الإلكتروني',
    sections: [
      { title: 'مشكلة في طلب', paragraphs: ['افتح «طلباتي» ثم اختر البلاغ المرتبط بالطلب النشط أو المكتمل؛ هذا يساعد فريق الدعم على معرفة رقم الطلب وحالته.'] },
      { title: 'الحساب أو الخصوصية', paragraphs: ['اكتب من البريد المرتبط بحسابك واشرح طلبك دون إرسال كلمة السر أو رمز التحقق. يمكنك طلب تصحيح بياناتك أو حذف الحساب من صفحة حذف الحساب.'] },
      { title: 'تواصل بالبريد', paragraphs: [`${SUPPORT_EMAIL}\nنحاول الرد خلال أيام العمل. لا يوجد حتى الآن زمن استجابة مضمون منشور.`] },
    ],
  },
  'delete-account': {
    title: 'حذف الحساب والبيانات',
    subtitle: 'أرسل طلب حذف الحساب من داخل التطبيق أو من هذه الصفحة العامة.',
    updated: 'لا يلزم تسجيل الدخول لفتح طلب الحذف.',
    sections: [
      { title: 'طريقة الطلب', paragraphs: ['أدخل البريد المستخدم في الحساب، ثم افتح رسالة الطلب الجاهزة وأرسلها. يجب أن ترسل الرسالة من البريد نفسه حتى نتحقق من ملكية الحساب. إذا لم يكن لديك وصول إلى البريد، اذكر ذلك وسنوضح طريقة تحقق بديلة.'] },
      { title: 'ماذا سيُحذف؟', paragraphs: ['يمكن حذف حساب العميل من داخل التطبيق بعد إكمال الطلبات المفتوحة وحل البلاغات. نزيل بيانات الملف والعناوين ورموز الإشعارات والصور ووصف الطلب، ونفصل سجلات المبالغ والتسويات عن الحساب. قد تبقى سجلات مالية أو أمنية منزوعة الهوية إذا تطلب القانون أو حل نزاع ذلك؛ لا توجد حاليًا مدة رقمية موحدة منشورة لهذه السجلات. حسابات السائق والإدارة تحتاج مراجعة الدعم بسبب الأرصدة وسجلات التشغيل.'] },
      { title: 'ما الذي يحدث بعد الإرسال؟', paragraphs: ['يفتح الموقع رسالة بريد جاهزة، ولا يُرسل الطلب حتى تضغط «إرسال» في تطبيق البريد. يتولى فريق الدعم مراجعة الطلب يدويًا بعد التحقق من ملكية الحساب، ويشرح أي طلب نشط أو سجل يجب الاحتفاظ به. لا ترسل كلمة السر أو رمز التحقق. يمكنك استخدام هذه الصفحة من دون تسجيل الدخول إلى التطبيق.'] },
    ],
  },
};

export function LegalPage({ page }: { page: PageName }) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState<{ id: string; email: string } | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void AsyncStorage.getItem('labbayk-theme').then((value) => { if (value === 'light') setTheme('light'); }).catch(() => {}); }, []);
  useEffect(() => {
    if (page !== 'delete-account' || !supabase) return;
    let active = true;
    setCheckingAccount(true);
    const sb = supabase;
    void (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (!active) return;
        const user = data.session?.user;
        if (!user) { setAccount(null); setRoles([]); return; }
        setAccount({ id: user.id, email: user.email ?? '' });
        const { data: roleRows } = await sb.from('user_roles').select('role').eq('user_id', user.id);
        if (active) setRoles(roleRows?.map((row) => row.role as string) ?? []);
      } catch {
        if (active) { setAccount(null); setRoles([]); }
      } finally {
        if (active) setCheckingAccount(false);
      }
    })();
    return () => { active = false; };
  }, [page]);
  const s = useMemo(() => stylesFor(theme), [theme]);
  const content = pageContent[page];
  const isSupportManaged = roles.some((role) => role === 'driver' || role === 'driver_pending' || role === 'super_admin');
  useEffect(() => {
    if (Platform.OS === 'web') document.title = `${content.title} | لَبّيك`;
    return () => { if (Platform.OS === 'web') document.title = 'لَبّيك | اطلب، والباقي علينا.'; };
  }, [content.title]);
  const deleteSignedInAccount = async () => {
    if (!supabase || !account) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) {
        let userMessage = 'تعذر حذف الحساب الآن. حاول مرة أخرى أو تواصل مع الدعم.';
        const response = (error as { context?: Response }).context;
        if (response) {
          try {
            const payload = await response.clone().json() as { error?: unknown };
            if (typeof payload.error === 'string') userMessage = payload.error;
          } catch { /* Use the safe fallback message. */ }
        }
        setMessage(userMessage);
        return;
      }
      await Promise.allSettled([
        clearCustomerOrderDraft(account.id),
        clearCustomerOrdersSnapshot(account.id),
        clearDriverOrdersSnapshot(account.id),
        unregisterPushNotifications(account.id),
      ]);
      await supabase.auth.signOut({ scope: 'local' });
      setAccount(null);
      setMessage('تم حذف حسابك وبياناته الشخصية. قد تبقى سجلات مالية منزوعة الهوية إذا تطلبها القانون.');
    } catch {
      setMessage('تعذر حذف الحساب الآن. حاول مرة أخرى أو تواصل مع الدعم.');
    } finally { setBusy(false); }
  };
  const openDriverDeletionSupport = async () => {
    const subject = 'طلب حذف حساب سائق - لَبّيك';
    const identifier = account?.email ? `البريد المرتبط بالحساب: ${account.email}` : 'سجّل الدخول من حساب السائق قبل الإرسال.';
    const body = `مرحبًا فريق لَبّيك،\n\nأطلب حذف حساب السائق الخاص بي وبياناتي الشخصية.\n${identifier}\n\nأعلم أن حساب السائق يتطلب مراجعة الأرصدة والتسويات قبل الحذف، وأرجو إتمام ذلك وإخباري بأي سجلات مالية يجب الاحتفاظ بها قانونيًا.\n\nلا أرسل كلمة السر أو رمز التحقق.`;
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
      setMessage('فُتحت رسالة بريد جاهزة بطلب حذف حساب السائق. اضغط «إرسال» في تطبيق البريد لإيصالها للدعم.');
    } catch {
      setMessage(`تعذر فتح تطبيق البريد. أرسل طلبك يدويًا إلى ${SUPPORT_EMAIL} من بريد حسابك.`);
    }
  };
  const requestDeletion = async () => {
    if (account) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (window.confirm('سيُحذف حساب العميل وعناوينه وصوره ووصف طلباته. لن يمكن التراجع عن ذلك. هل تريد المتابعة؟')) void deleteSignedInAccount();
        return;
      }
      Alert.alert('تأكيد حذف الحساب', 'سيُحذف حساب العميل وعناوينه وصوره ووصف طلباته. لن يمكن التراجع عن ذلك.', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف الحساب', style: 'destructive', onPress: () => { void deleteSignedInAccount(); } },
      ]);
      return;
    }
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setMessage('اكتب بريدًا إلكترونيًا صحيحًا مرتبطًا بالحساب.'); return; }
    setBusy(true); setMessage('');
    const subject = 'طلب حذف حساب لَبّيك';
    const body = `مرحبًا فريق لَبّيك،\n\nأطلب حذف الحساب المرتبط بهذا البريد: ${normalized}\n\nأرجو تأكيد استلام الطلب وإخباري بأي بيانات يجب الاحتفاظ بها وسبب ذلك.\n\nلا أرسل كلمة السر أو رمز التحقق.`;
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
      setMessage('راجع رسالة البريد التي فُتحت واضغط إرسال لإيصال الطلب. إذا لم يفتح تطبيق البريد، راسلنا مباشرة من بريد الحساب.');
    } catch { setMessage(`تعذر فتح تطبيق البريد. أرسل طلبك يدويًا إلى ${SUPPORT_EMAIL} من بريد الحساب.`); }
    finally { setBusy(false); }
  };
  const contactSupport = () => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('تواصل مع دعم لَبّيك')}`).catch(() => setMessage(`تعذر فتح تطبيق البريد. راسلنا على ${SUPPORT_EMAIL}.`));
  };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.scroll}>
    <View style={s.page}>
      <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} accessibilityRole="button" style={s.back}><Text style={s.backText}>← العودة إلى لَبّيك</Text></Pressable>
      <View style={s.hero}><Text style={s.brand}>لَبّيك</Text><Text accessibilityRole="header" style={s.title}>{content.title}</Text><Text style={s.subtitle}>{content.subtitle}</Text><Text style={s.updated}>{content.updated}</Text></View>
      {page === 'support' && <Pressable onPress={contactSupport} accessibilityRole="link" style={s.button}><Text style={s.buttonText}>راسل فريق الدعم · {SUPPORT_EMAIL}</Text></Pressable>}
      {page === 'delete-account' && content.sections.map((section) => <View key={section.title} style={s.card}><Text accessibilityRole="header" style={s.sectionTitle}>{section.title}</Text>{section.paragraphs.map((paragraph, index) => <Text key={index} selectable style={s.copy}>{paragraph}</Text>)}</View>)}
      {page === 'delete-account' && <View style={s.deleteForm}><Text style={s.deleteNotice}>حذف الحساب نهائي ولا يمكن التراجع عنه. حسابات السائق والإدارة تتطلب مراجعة فريق الدعم.</Text>{checkingAccount ? <ActivityIndicator color={theme === 'dark' ? '#B7FF30' : '#287A55'} /> : account ? (isSupportManaged ? <><Text style={s.label}>الحساب الحالي: {account.email || 'حسابك المسجّل'}</Text><Text style={s.copy}>حساب السائق أو الإدارة يتطلب مراجعة الدعم بسبب الأرصدة والسجلات التشغيلية. افتح طلب حذف جاهزًا عبر البريد.</Text><Pressable onPress={() => void openDriverDeletionSupport()} accessibilityRole="button" style={s.deleteButton}><Text style={s.deleteButtonText}>طلب حذف الحساب عبر الدعم</Text></Pressable></> : <><Text style={s.label}>الحساب الحالي: {account.email || 'حسابك المسجّل'}</Text><Pressable disabled={busy} onPress={() => void requestDeletion()} accessibilityRole="button" style={[s.deleteButton,busy&&{opacity:.6}]}>{busy ? <ActivityIndicator color="#FFFFFF"/> : <Text style={s.deleteButtonText}>حذف حسابي وبياناتي</Text>}</Pressable></>) :<><Text style={s.label}>البريد المرتبط بالحساب</Text><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textAlign="left" autoComplete="email" placeholder="name@example.com" placeholderTextColor={theme === 'dark' ? '#839188' : '#65746A'} style={s.input} accessibilityLabel="البريد المرتبط بالحساب"/><Pressable disabled={busy} onPress={() => void requestDeletion()} accessibilityRole="button" style={[s.deleteButton,busy&&{opacity:.6}]}>{busy ? <ActivityIndicator color="#FFFFFF"/> : <Text style={s.deleteButtonText}>إرسال طلب حذف الحساب</Text>}</Pressable></>}{message ? <Text accessibilityRole="status" style={s.formMessage}>{message}</Text> : null}</View>}
      {page === 'support' && message ? <Text accessibilityRole="status" style={s.formMessage}>{message}</Text> : null}
      {page !== 'delete-account' && content.sections.map((section) => <View key={section.title} style={s.card}><Text accessibilityRole="header" style={s.sectionTitle}>{section.title}</Text>{section.paragraphs.map((paragraph, index) => <Text key={index} selectable style={s.copy}>{paragraph}</Text>)}{section.bullets?.map((item) => <View key={item} style={s.bulletRow}><Text style={s.bullet}>•</Text><Text selectable style={s.bulletCopy}>{item}</Text></View>)}</View>)}
      <View style={s.links}><PageLink href="/privacy" label="سياسة الخصوصية" s={s}/><PageLink href="/terms" label="شروط الاستخدام" s={s}/><PageLink href="/support" label="الدعم" s={s}/><PageLink href="/delete-account" label="حذف الحساب" s={s}/></View>
    </View>
  </ScrollView></SafeAreaView>;
}

function PageLink({ href, label, s }: { href: '/privacy' | '/terms' | '/support' | '/delete-account'; label: string; s: ReturnType<typeof stylesFor> }) {
  return <Link href={href} asChild><Pressable accessibilityRole="link" style={s.link}><Text style={s.linkText}>{label}</Text></Pressable></Link>;
}

function stylesFor(theme: 'dark' | 'light') {
  const dark = theme === 'dark';
  const background = dark ? '#0B1411' : '#F5F7F2';
  const surface = dark ? '#142119' : '#FFFFFF';
  const raised = dark ? '#17251C' : '#EFF5E8';
  const border = dark ? '#2C4034' : '#DCE4D8';
  const text = dark ? '#F3F7F3' : '#20241F';
  const muted = dark ? '#A9B9B0' : '#5D645B';
  const accent = dark ? '#B7FF30' : '#287A55';
  const danger = dark ? '#F0787F' : '#B42318';
  const dangerSurface = dark ? '#291C1D' : '#FBE9E7';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: background }, scroll: { flexGrow: 1, paddingBottom: 28 }, page: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
    back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 10 }, backText: { color: accent, fontSize: 13, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
    hero: { padding: 20, marginTop: 8, marginBottom: 15, borderRadius: 22, backgroundColor: surface, borderWidth: 1, borderColor: border }, brand: { color: accent, fontSize: 13, fontWeight: '900', fontFamily: 'Tajawal_900Black', textAlign: 'right' }, title: { color: text, fontSize: 27, fontWeight: '900', fontFamily: 'Tajawal_900Black', textAlign: 'right', marginTop: 5 }, subtitle: { color: muted, fontSize: 14, lineHeight: 22, fontFamily: 'Tajawal_400Regular', textAlign: 'right', marginTop: 5 }, updated: { color: muted, fontSize: 11, fontFamily: 'Tajawal_500Medium', textAlign: 'right', marginTop: 10 },
    card: { padding: 17, marginBottom: 10, borderRadius: 18, backgroundColor: surface, borderWidth: 1, borderColor: border }, sectionTitle: { color: text, fontSize: 16, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold', textAlign: 'right', marginBottom: 7 }, copy: { color: muted, fontSize: 13, lineHeight: 22, fontFamily: 'Tajawal_400Regular', textAlign: 'right', marginTop: 5 }, bulletRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, marginTop: 7 }, bullet: { color: accent, fontSize: 16 }, bulletCopy: { flex: 1, color: muted, fontSize: 13, lineHeight: 22, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
    form: { padding: 17, marginBottom: 12, borderRadius: 18, backgroundColor: surface, borderWidth: 1, borderColor: border }, deleteForm: { padding: 17, marginBottom: 12, borderRadius: 18, backgroundColor: dangerSurface, borderWidth: 1, borderColor: danger }, deleteNotice: { color: danger, fontSize: 13, lineHeight: 21, textAlign: 'right', fontWeight: '700', fontFamily: 'Tajawal_700Bold', marginBottom: 14 }, label: { color: text, textAlign: 'right', fontSize: 13, fontWeight: '700', fontFamily: 'Tajawal_700Bold', marginBottom: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: border, borderRadius: 12, backgroundColor: raised, paddingHorizontal: 12, color: text, fontSize: 15, fontFamily: 'Tajawal_400Regular' }, button: { minHeight: 50, borderRadius: 13, backgroundColor: '#B7FF30', alignItems: 'center', justifyContent: 'center', marginTop: 11, paddingHorizontal: 12 }, buttonText: { color: '#0B1411', fontSize: 14, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' }, deleteButton: { minHeight: 50, borderRadius: 13, backgroundColor: danger, alignItems: 'center', justifyContent: 'center', marginTop: 11, paddingHorizontal: 12 }, deleteButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' }, formMessage: { color: accent, fontSize: 12, lineHeight: 19, textAlign: 'right', fontFamily: 'Tajawal_500Medium', marginTop: 10 },
    links: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }, link: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: raised, borderWidth: 1, borderColor: border }, linkText: { color: accent, fontSize: 12, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  });
}
