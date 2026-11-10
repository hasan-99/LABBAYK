import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Metadata } from 'expo-router/server';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@labbayk/design-tokens';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@labbayk/shared/database.types';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { clearCustomerOrderDraft, loadCustomerOrderDraft, saveCustomerOrderDraft } from '@/lib/customer-order-draft';
import { AuthScreen, PasswordRecoveryScreen } from '@/components/AuthScreen';
import { AppText as Text } from '@/components/AppText';

const c = tokens.color;
const categories = ['خضرة', 'لحمة', 'أغراض البيت', 'غيره'];
export function generateMetadata(): Metadata {
  return { title: 'لَبّيك | اطلب، والباقي علينا.', description: 'خدمة يومك تبدأ من هون. احتياجاتك، بطلب واحد.' };
}
type Address = Database['public']['Tables']['addresses']['Row'];
type ServiceZone = Pick<Database['public']['Tables']['service_zones']['Row'], 'id'|'name'|'governorate'|'city'|'neighborhood'|'delivery_surcharge_minor'|'currency'>;
type CustomerOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'delivery_quote_set_at'|'delivery_quote_approved_at'|'budget_ceiling_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'>;
type DriverOfferCard = { id: string; expires_at: string; order: Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'budget_ceiling_minor'> };
type DriverActiveOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'budget_ceiling_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'address_id'> & { address: Pick<Address, 'label'|'street'|'city'|'neighborhood'|'contact_phone'|'building'|'landmark'> | null };
const newRequestKey = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.random() * 16 | 0; return (char === 'x' ? value : (value & 3 | 8)).toString(16); });
const orderStatus: Record<string, string> = { requested:'بانتظار التوزيع', quoted:'أجرة التوصيل جاهزة', searching:'عم ندور على سائق', accepted:'قبل السائق الطلب', assigned:'تم تعيين سائق', shopping:'عم نجهز طلبك', awaiting_approval:'بانتظار موافقتك', purchased:'تم الشراء', delivering:'بالطريق لعندك', delivered:'تم التوصيل', settled:'تمت التسوية', disputed:'قيد مراجعة الدعم', cancelled:'ملغي' };

function AddressBook({ userId, onBack }: { userId: string; onBack: () => void }) {
  const online = useInternetAvailable();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!supabase || !online) return;
    const [{ data: addressRows, error: addressError }, { data: zoneRows, error: zoneError }] = await Promise.all([
      supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('updated_at', { ascending: false }),
      supabase.from('service_zones').select('id,name,governorate,city,neighborhood,delivery_surcharge_minor,currency').eq('active', true).order('name'),
    ]);
    if (addressError || zoneError) { setMessage('ما قدرنا نحمّل العناوين. تأكد من الاتصال وجرب مرة ثانية.'); return; }
    setAddresses(addressRows ?? []); setZones(zoneRows ?? []);
  };
  useEffect(() => { void refresh(); }, [online, userId]);

  const save = async () => {
    if (!supabase) return;
    const zone = zones.find((item) => item.id === selectedZone);
    if (!zone) { setMessage('اختار منطقة توصيل أولاً.'); return; }
    if (label.trim().length < 1 || street.trim().length < 1 || contactPhone.trim().length < 7) { setMessage('كمّل اسم العنوان والشارع ورقم تواصل صحيح.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.from('addresses').insert({
      user_id: userId, zone_id: zone.id, label: label.trim(), governorate: zone.governorate,
      city: zone.city, neighborhood: zone.neighborhood ?? zone.name, street: street.trim(),
      landmark: landmark.trim() || null, building: building.trim() || null, floor: floor.trim() || null,
      contact_phone: contactPhone.trim(), is_default: addresses.length === 0,
    });
    setBusy(false);
    if (error) { setMessage('ما انحفظ العنوان. تأكد أن المنطقة بعدها فعالة وجرب مرة ثانية.'); return; }
    setLabel(''); setStreet(''); setLandmark(''); setBuilding(''); setFloor(''); setContactPhone('');
    setMessage('انحفظ العنوان.'); await refresh();
  };

  const remove = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('addresses').delete().eq('id', id);
    setMessage(error ? 'ما قدرنا نحذف العنوان.' : 'انحذف العنوان.');
    if (!error) await refresh();
  };

  return <View style={s.addressPage}>
    <Pressable onPress={onBack} style={s.backLink} accessibilityRole="button"><Text style={s.backArrow}>→</Text><Text style={s.backText}>رجوع للرئيسية</Text></Pressable>
    <Text style={s.pageTitle}>عناويني</Text><Text style={s.pageDescription}>احفظ مكانك المفضل ليسهل عليك الطلب.</Text>
    {addresses.map((address) => <View key={address.id} style={s.savedAddress}><View style={s.savedPin}><Text style={s.pin}>⌖</Text></View><View style={s.savedCopy}><Text style={s.savedLabel}>{address.label}{address.is_default ? ' · أساسي' : ''}</Text><Text style={s.savedDetail}>{address.governorate}، {address.city}، {address.neighborhood}</Text><Text style={s.savedDetail}>{address.street}{address.building ? `، بناء ${address.building}` : ''}</Text></View><Pressable onPress={() => void remove(address.id)} accessibilityRole="button" accessibilityLabel={`حذف ${address.label}`} style={s.deleteAddress}><Text style={s.deleteText}>حذف</Text></Pressable></View>)}
    <View style={s.formCard}><Text style={s.sectionTitle}>أضف عنواناً جديداً</Text>
      {zones.length ? <><Text style={s.label}>منطقة التوصيل</Text><View style={s.zoneList}>{zones.map((zone) => <Pressable key={zone.id} onPress={() => setSelectedZone(zone.id)} accessibilityRole="button" accessibilityState={{ selected: selectedZone === zone.id }} style={[s.zoneOption, selectedZone === zone.id && s.zoneSelected]}><Text style={[s.zoneName, selectedZone === zone.id && s.zoneNameSelected]}>{zone.name}</Text><Text style={s.zoneMeta}>{zone.city}، {zone.governorate}</Text></Pressable>)}</View>
        <Text style={s.label}>اسم العنوان</Text><TextInput value={label} onChangeText={setLabel} placeholder="البيت، الشغل..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="اسم العنوان"/>
        <Text style={s.label}>الشارع والوصف</Text><TextInput value={street} onChangeText={setStreet} placeholder="اسم الشارع ورقم البناء" placeholderTextColor="#839188" style={s.field} accessibilityLabel="الشارع والوصف"/>
        <Text style={s.label}>علامة مميزة <Text style={s.optional}>اختياري</Text></Text><TextInput value={landmark} onChangeText={setLandmark} placeholder="قرب صيدلية، مقابل الحديقة..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="علامة مميزة"/>
        <View style={s.inlineFields}><View style={s.inline}><Text style={s.label}>البناء</Text><TextInput value={building} onChangeText={setBuilding} placeholder="اختياري" placeholderTextColor="#839188" style={s.field} accessibilityLabel="البناء"/></View><View style={s.inline}><Text style={s.label}>الطابق</Text><TextInput value={floor} onChangeText={setFloor} placeholder="اختياري" placeholderTextColor="#839188" style={s.field} accessibilityLabel="الطابق"/></View></View>
        <Text style={s.label}>رقم للتواصل</Text><TextInput value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" textAlign="left" placeholder="+963 ..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="رقم للتواصل"/>
        <Pressable disabled={busy} onPress={() => void save()} style={[s.saveAddress,busy&&s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{busy?'عم نحفظ…':'حفظ العنوان'} <Text style={s.submitArrow}>←</Text></Text></Pressable>
      </> : <View style={s.noZones}><Text style={s.noZonesTitle}>لسه ما في منطقة مفعّلة</Text><Text style={s.emptyCopy}>ما فينا نحفظ عنوان قبل ما يحدد فريق لَبّيك مناطق الخدمة.</Text></View>}
      {message ? <Text accessibilityRole="alert" style={s.formMessage}>{message}</Text> : null}
    </View>
  </View>;
}

function NotificationInbox({ userId }: { userId: string }) {
  const online = useInternetAvailable();
  type Notification = Pick<Database['public']['Tables']['notifications']['Row'],'id'|'title'|'body'|'created_at'|'read_at'|'order_id'>
  const [items,setItems]=useState<Notification[]>([]); const [message,setMessage]=useState(''); const [loading,setLoading]=useState(true)
  const refresh=async()=>{
    if(!supabase || !online)return
    const {data,error}=await supabase.from('notifications').select('id,title,body,created_at,read_at,order_id').order('created_at',{ascending:false}).limit(12)
    if(error)setMessage('ما قدرنا نحمّل التنبيهات.')
    else {setItems(data??[]);setMessage('')}
    setLoading(false)
  }
  useEffect(()=>{
    void refresh()
    if(!supabase || !online)return
    const channel=supabase.channel('user-notifications-'+userId).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_id=eq.'+userId},()=>{void refresh()}).subscribe()
    return ()=>{void supabase?.removeChannel(channel)}
  },[online,userId])
  const markRead=async(id:number)=>{
    if(!supabase)return
    const {error}=await supabase.rpc('mark_notification_read',{p_notification_id:id})
    if(error){setMessage('ما قدرنا نحدّث حالة التنبيه.');return}
    setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item))
  }
  return <View style={s.orderCard}><View style={s.orderTop}><Text style={s.sectionTitle}>تنبيهاتك</Text><Pressable onPress={()=>void refresh()} accessibilityRole="button" accessibilityLabel="تحديث التنبيهات"><Text style={s.orderFee}>تحديث ↻</Text></Pressable></View>{message?<Text accessibilityRole="alert" style={s.formMessage}>{message}</Text>:null}{loading?<ActivityIndicator color={c.primary}/>:items.length?items.map(item=><Pressable key={item.id} disabled={!!item.read_at} onPress={()=>void markRead(item.id)} accessibilityRole="button" accessibilityLabel={item.title+', '+item.body} style={{paddingVertical:10,borderTopWidth:1,borderTopColor:c.border,opacity:item.read_at?0.65:1}}><Text style={s.orderCategory}>{item.read_at?'':'• '}{item.title}</Text><Text style={s.offerExpiry}>{item.body}</Text><Text style={s.orderDate}>{new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}{item.order_id?' · طلب #'+item.order_id.slice(0,8):''}</Text></Pressable>):<Text style={s.offerExpiry}>ما في تنبيهات جديدة.</Text>}</View>
}

function SupportIssueForm({orderId,status}:{orderId:string;status:string}) {
  const [expanded,setExpanded]=useState(false);const [reason,setReason]=useState('');const [details,setDetails]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [idempotencyKey]=useState(newRequestKey());const [submitted,setSubmitted]=useState(false)
  const submit=async()=>{
    if(!supabase)return
    if(!reason||details.trim().length<5){setMessage('اختار نوع المشكلة واكتب تفاصيل أكثر.');return}
    setBusy(true);setMessage('')
    const {error}=await supabase.rpc('open_order_dispute',{p_order_id:orderId,p_reason:reason,p_details:details.trim(),p_idempotency_key:idempotencyKey})
    setBusy(false)
    if(error){setMessage(error.message.includes('active')?'في بلاغ مفتوح على هالطلب. تواصل مع الدعم من التنبيهات.':'ما قدرنا نسجل البلاغ. أعد المحاولة بنفس التفاصيل.');return}
    setSubmitted(true);setMessage('وصل البلاغ لفريق لَبّيك، والطلب صار قيد المراجعة.')
  }
  if(status==='disputed')return <Text accessibilityRole="status" style={s.offerExpiry}>بلاغك قيد مراجعة فريق الدعم. تابع التنبيهات للمستجدات.</Text>
  if(!['accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled'].includes(status)) return null
  return <View style={{marginTop:10}}>{submitted?<Text accessibilityRole="status" style={s.offerExpiry}>{message}</Text>:!expanded?<Pressable onPress={()=>setExpanded(true)} accessibilityRole="button"><Text style={s.orderFee}>في مشكلة بهالطلب؟ تواصل مع الدعم</Text></Pressable>:<View style={s.dropoff}><Text style={s.dropoffTitle}>إرسال بلاغ للدعم</Text><View style={s.zoneList}>{['مشكلة بالمشتريات','تأخير أو مشكلة بالتوصيل','مبلغ أو تحصيل غير صحيح','مشكلة ثانية'].map(item=><Pressable key={item} onPress={()=>setReason(item)} accessibilityRole="button" accessibilityState={{selected:reason===item}} style={[s.zoneOption,reason===item&&s.zoneSelected]}><Text style={[s.zoneName,reason===item&&s.zoneNameSelected]}>{item}</Text></Pressable>)}</View><TextInput value={details} onChangeText={setDetails} multiline textAlignVertical="top" maxLength={2000} placeholder="اشرح المشكلة لفريق الدعم" placeholderTextColor="#839188" style={[s.field,{minHeight:85}]} accessibilityLabel="تفاصيل المشكلة"/><Pressable disabled={busy} onPress={()=>void submit()} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>{busy?'عم نرسل البلاغ…':'إرسال البلاغ'}</Text></Pressable><Pressable onPress={()=>{setExpanded(false);setMessage('')}} accessibilityRole="button"><Text style={s.offerExpiry}>إغلاق</Text></Pressable>{message?<Text accessibilityRole="alert" style={s.formMessage}>{message}</Text>:null}</View>}</View>
}

function DriverOperations({ userId }: { userId: string }) {
  const online = useInternetAvailable();
  const [profile, setProfile] = useState<{ is_online: boolean; service_zone_id: string | null }>({ is_online: false, service_zone_id: null });
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [offers, setOffers] = useState<DriverOfferCard[]>([]);
  const [activeOrders, setActiveOrders] = useState<DriverActiveOrder[]>([]);
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string,string>>({});
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const refresh = useCallback(async () => {
    if (!supabase || !online) return;
    setLoading(true);
    const [driver, zoneRows, offerRows, assigned] = await Promise.all([
      supabase.from('driver_profiles').select('is_online,service_zone_id').eq('user_id', userId).single(),
      supabase.from('service_zones').select('id,name,governorate,city,neighborhood,delivery_surcharge_minor,currency').eq('active', true).order('name'),
      supabase.from('order_offers').select('id,order_id,expires_at').eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('expires_at'),
      supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at,address_id').eq('driver_id', userId).neq('status', 'delivered').neq('status', 'settled').neq('status', 'cancelled').order('created_at', { ascending: false }),
    ]);
    const { data: walletRows } = await supabase.rpc('get_driver_wallet_balances');
    setWalletBalance(walletRows?.find((row) => row.driver_id === userId)?.balance_minor ?? 0);
    if (driver.data) setProfile(driver.data);
    setZones(zoneRows.data ?? []);
    if (assigned.data?.length) {
      const { data: addressRows } = await supabase.from('addresses').select('id,label,street,city,neighborhood,contact_phone,building,landmark').in('id', assigned.data.map((order) => order.address_id));
      const addressMap = new Map((addressRows ?? []).map((address) => [address.id, address]));
      setActiveOrders(assigned.data.map((order) => ({ ...order, address: addressMap.get(order.address_id) ?? null })));
    } else setActiveOrders([]);
    if (offerRows.data?.length) {
      const { data: orderRows } = await supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,budget_ceiling_minor').in('id', offerRows.data.map((offer) => offer.order_id));
      const orderMap = new Map((orderRows ?? []).map((order) => [order.id, order]));
      setOffers(offerRows.data.flatMap((offer) => { const order = orderMap.get(offer.order_id); return order ? [{ id: offer.id, expires_at: offer.expires_at, order }] : []; }));
    } else setOffers([]);
    setLoading(false);
  }, [online, userId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(`driver-orders-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: `driver_id=eq.${userId}` }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${userId}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, refresh, userId]);
  const setAvailability = async (updates: { is_online: boolean; service_zone_id: string | null }) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('driver_profiles').update(updates).eq('user_id', userId);
    setBusy(false);
    if (error) { setMessage('ما قدرنا نحدّث التوفر. حاول مرة ثانية.'); return; }
    setProfile(updates);
  };
  const accept = async (offerId: string) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('accept_order_offer', { p_offer_id: offerId });
    setBusy(false);
    if (error) { setMessage('العرض انتهى أو قبله سائق تاني. حدّث القائمة.'); await refresh(); return; }
    setMessage('تم قبول الطلب من السيرفر.'); await refresh();
  };
  const decline = async (offerId: string) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('decline_order_offer', { p_offer_id: offerId });
    setBusy(false);
    if (error) { setMessage('انتهى العرض أو ما عاد متاح. حدّث القائمة.'); await refresh(); return; }
    setMessage('اعتذرت عن العرض.'); await refresh();
  };
  const startShopping = async (orderId: string) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('start_order_shopping', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نبدأ التسوق. حدّث حالة الطلب وحاول مرة ثانية.'); return; }
    setMessage('تم تأكيد بدء التسوق.'); await refresh();
  };
  const recordPurchase = async (orderId: string) => {
    if (!supabase) return;
    const amount = Number(purchaseDrafts[orderId]);
    if (!Number.isSafeInteger(amount) || amount < 0) { setMessage('أدخل قيمة المشتريات بالقروش كرقم صحيح.'); return; }
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('record_order_purchase', { p_order_id: orderId, p_purchase_amount_minor: amount });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نسجل المشتريات. تأكد من حالة الطلب.'); return; }
    setMessage(data === 'awaiting_approval' ? 'المبلغ أعلى من ميزانية الزبون؛ ناطرين موافقته قبل ما تشتري.' : 'السعر ضمن الميزانية. اشتري الأغراض وبعدها أكد إتمام الشراء.');
    await refresh();
  };
  const confirmPurchase = async (orderId: string) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('confirm_order_purchase', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نأكد الشراء. إذا المبلغ فوق الميزانية لازم موافقة الزبون أولاً.'); return; }
    setMessage('تأكد شراء الأغراض من السيرفر.'); await refresh();
  };
  const startDelivery = async (orderId: string) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('start_order_delivery', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نبدأ التوصيل. تأكد أن المشتريات مسجلة وموافق عليها.'); return; }
    setMessage('بدأ التوصيل. اطلب من الزبون رمز التأكيد عند التسليم.'); await refresh();
  };
  const confirmDelivery = async (orderId: string) => {
    if (!supabase) return;
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('confirm_order_delivery', { p_order_id: orderId, p_code: deliveryDrafts[orderId] ?? '' });
    setBusy(false);
    if (error || !data) { setMessage('رمز التسليم غير صحيح أو منتهي. خليه يطلع رمز جديد من حساب الزبون.'); return; }
    setMessage('تأكد التسليم من السيرفر.'); await refresh();
  };
  return <View style={s.driverPanel}><NotificationInbox userId={userId}/><View style={s.driverPanelTop}><View><Text style={s.driverApplyTitle}>جاهز للطلبات؟</Text><Text style={s.driverApplyCopy}>اختار منطقة خدمتك وفعّل التوفر.</Text></View><Pressable disabled={busy} onPress={() => void refresh()} style={s.driverRefresh} accessibilityRole="button" accessibilityLabel="تحديث طلبات السائق"><Text style={s.driverRefreshGlyph}>↻</Text></Pressable></View>
    <View style={s.dropoff}><Text style={s.dropoffTitle}>رصيد محفظتك</Text><Text style={s.dropoffText}>{new Intl.NumberFormat('ar-SY').format(walletBalance)} قرش · يُخصم منه رسم العمولة بعد التسوية</Text></View>
    <Text style={s.label}>منطقة الخدمة</Text>{zones.length ? <View style={s.zoneList}>{zones.map((zone) => <Pressable key={zone.id} onPress={() => void setAvailability({ is_online: false, service_zone_id: zone.id })} style={[s.zoneOption, profile.service_zone_id === zone.id && s.zoneSelected]} accessibilityRole="button" accessibilityState={{ selected: profile.service_zone_id === zone.id }}><Text style={[s.zoneName, profile.service_zone_id === zone.id && s.zoneNameSelected]}>{zone.name}</Text><Text style={s.zoneMeta}>{zone.city}، {zone.governorate}</Text></Pressable>)}</View> : <Text style={s.driverApplyCopy}>ما في مناطق خدمة فعّالة حالياً.</Text>}
    <Pressable disabled={busy || (!profile.service_zone_id && !profile.is_online)} onPress={() => void setAvailability({ ...profile, is_online: !profile.is_online })} style={[s.availabilityButton, profile.is_online && s.availabilityOn, (busy || !profile.service_zone_id) && s.disabled]} accessibilityRole="switch" accessibilityState={{ checked: profile.is_online }}><View style={[s.availabilityDot, profile.is_online && s.availabilityDotOn]}/><Text style={[s.availabilityText, profile.is_online && s.availabilityTextOn]}>{profile.is_online ? 'متصل — عم تستقبل طلبات' : 'غير متصل'}</Text></Pressable>
    {message ? <Text accessibilityRole="alert" style={s.formMessage}>{message}</Text> : null}
    <View style={s.driverOffersHead}><Text style={s.sectionTitle}>عروض قريبة منك</Text><Text style={s.offerCount}>{offers.length}</Text></View>
    {loading ? <ActivityIndicator color={c.primary}/> : offers.length ? offers.map((offer) => <View key={offer.id} style={s.offerCard}><View style={s.orderTop}><Text style={s.orderCategory}>{offer.order.category}</Text><Text style={s.orderFee}>{new Intl.NumberFormat('ar-SY').format(offer.order.delivery_fee_minor)} قرش توصيل</Text></View><Text style={s.orderRequest}>{offer.order.request_text}</Text><Text style={s.offerExpiry}>انتهاؤه {new Intl.DateTimeFormat('ar-SY',{timeStyle:'short'}).format(new Date(offer.expires_at))}</Text><Pressable disabled={busy || !profile.is_online} onPress={() => void accept(offer.id)} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>قبول الطلب <Text style={s.submitArrow}>←</Text></Text></Pressable><Pressable disabled={busy} onPress={() => void decline(offer.id)} style={[s.declineOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.declineOfferText}>اعتذار عن العرض</Text></Pressable></View>) : <View style={s.noOffers}><Text style={s.noOffersGlyph}>⌁</Text><Text style={s.noOffersTitle}>ما في عروض حالياً</Text><Text style={s.noOffersCopy}>لما يوصلك عرض جديد بيظهر هون. فيك تحدّث القائمة بأي وقت.</Text></View>}
    {!!activeOrders.length && <><Text style={s.sectionTitle}>طلباتك النشطة</Text>{activeOrders.map((order) => <View key={order.id} style={s.offerCard}><Text style={s.orderCategory}>{order.category} · {orderStatus[order.status] ?? order.status}</Text><Text style={s.orderRequest}>{order.request_text}</Text><Text style={s.offerExpiry}>ميزانية الزبون: {new Intl.NumberFormat('ar-SY').format(order.budget_ceiling_minor)} قرش</Text><SupportIssueForm orderId={order.id} status={order.status}/>{order.address && <View style={s.dropoff}><Text style={s.dropoffTitle}>عنوان التوصيل</Text><Text style={s.dropoffText}>{order.address.label} · {order.address.street}{order.address.building ? `، بناء ${order.address.building}` : ''}</Text><Text style={s.dropoffText}>{order.address.neighborhood}، {order.address.city}{order.address.landmark ? ` · ${order.address.landmark}` : ''}</Text><Text style={s.dropoffPhone} selectable>{order.address.contact_phone}</Text></View>}{['accepted','assigned'].includes(order.status) && <Pressable disabled={busy} onPress={() => void startShopping(order.id)} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>بدء التسوق ←</Text></Pressable>}{order.status === 'shopping' && <><Text style={s.label}>المبلغ المتوقع عند الصندوق · قرش</Text><TextInput value={purchaseDrafts[order.id] ?? ''} onChangeText={(value) => setPurchaseDrafts((current) => ({...current,[order.id]:value}))} keyboardType="number-pad" textAlign="left" placeholder="مثال: 25000" placeholderTextColor="#839188" style={s.field} accessibilityLabel="قيمة المشتريات"/><Pressable disabled={busy} onPress={() => void recordPurchase(order.id)} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>تسجيل قيمة المشتريات ←</Text></Pressable>{order.purchase_amount_minor !== null && (order.purchase_amount_minor <= order.budget_ceiling_minor || order.purchase_approved_at !== null) && <Pressable disabled={busy} onPress={() => void confirmPurchase(order.id)} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>تأكيد الشراء بعد الدفع ←</Text></Pressable>}</>}{order.status === 'awaiting_approval' && <Text style={s.offerExpiry}>المبلغ المقترح {new Intl.NumberFormat('ar-SY').format(order.purchase_amount_minor ?? 0)} قرش · ناطرين موافقة الزبون.</Text>}{order.status === 'purchased' && <><Text style={s.offerExpiry}>مشتريات: {new Intl.NumberFormat('ar-SY').format(order.purchase_amount_minor ?? 0)} قرش</Text><Pressable disabled={busy} onPress={() => void startDelivery(order.id)} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>بدء التوصيل ←</Text></Pressable></>}{order.status === 'delivering' && <><Text style={s.label}>رمز التأكيد من الزبون · 8 أرقام</Text><TextInput value={deliveryDrafts[order.id] ?? ''} onChangeText={(value) => setDeliveryDrafts((current) => ({...current,[order.id]:value.replace(/\D/g,'').slice(0,8)}))} keyboardType="number-pad" textAlign="left" maxLength={8} placeholder="••••••••" placeholderTextColor="#839188" style={s.field} accessibilityLabel="رمز تأكيد التسليم"/><Pressable disabled={busy || (deliveryDrafts[order.id] ?? '').length !== 8} onPress={() => void confirmDelivery(order.id)} style={[s.acceptOffer,busy&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>تأكيد التسليم ←</Text></Pressable></>}</View>)}</>}
  </View>;
}

function DriverApplicationFlow({ userId, initialToken }: { userId: string; initialToken?: string }) {
  const online = useInternetAvailable();
  const [status, setStatus] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(initialToken ?? '');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!supabase || !online) return;
    supabase.from('driver_profiles').select('review_status').eq('user_id', userId).maybeSingle().then(({ data }) => { setStatus(data?.review_status ?? null); setChecked(true); });
  }, [online, userId]);
  useEffect(() => { if (initialToken) setInviteCode(initialToken); }, [initialToken]);
  const apply = async () => {
    if (!supabase) return;
    const token = inviteCode.replace(/\s/g, '').toLowerCase();
    if (token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) { setMessage('رمز الدعوة لازم يكون كامل وصالح.'); return; }
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('redeem_driver_invite', { p_token: token, p_vehicle_description: vehicle.trim() || undefined });
    setBusy(false);
    if (error) { setMessage('الدعوة غير صالحة أو منتهية أو مستخدمة من قبل. راجع الرمز مع فريق لَبّيك.'); return; }
    setStatus(data); setInviteCode(''); setMessage('وصل طلب انضمامك لفريق لَبّيك. رح نراجع معلوماتك.');
  };
  if (!checked) return <View style={s.driverApplyCard}><ActivityIndicator color={c.primary}/></View>;
  if (status === 'approved') return <DriverOperations userId={userId}/>;
  return <View style={s.driverApplyCard}><View style={s.driverApplyMark}><Text style={s.driverApplyIcon}>♙</Text></View><Text style={s.driverApplyTitle}>انضم لفريق السائقين</Text>{status ? <><Text style={s.driverApplyCopy}>{status === 'pending' ? 'طلبك قيد المراجعة. رح يتواصل معك الفريق بعد التحقق.' : status === 'approved' ? 'تم اعتماد حسابك. واجهة السائق قيد التجهيز.' : status === 'suspended' ? 'حساب السائق موقوف حالياً. تواصل مع فريق لَبّيك.' : 'تمت مراجعة الطلب. تواصل مع الفريق إذا بدك تعرف التفاصيل.'}</Text><Text style={s.driverStatus}>{status === 'pending' ? 'بانتظار المراجعة' : status === 'approved' ? 'سائق معتمد' : status === 'suspended' ? 'موقوف' : 'مرفوض'}</Text></> : <><Text style={s.driverApplyCopy}>إذا وصلك رمز دعوة من فريق لَبّيك، دخّله حتى نبدأ مراجعة طلبك.</Text><Text style={s.label}>رمز الدعوة</Text><TextInput value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" autoCorrect={false} textAlign="left" placeholder="64 حرفاً" placeholderTextColor="#839188" style={s.field} accessibilityLabel="رمز دعوة السائق"/><Text style={s.label}>نوع المركبة <Text style={s.optional}>اختياري</Text></Text><TextInput value={vehicle} onChangeText={setVehicle} placeholder="دراجة، سيارة..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="نوع المركبة" maxLength={160}/><Pressable disabled={busy} onPress={() => void apply()} style={[s.saveAddress,busy&&s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{busy?'عم نتحقق…':'إرسال طلب الانضمام'} <Text style={s.submitArrow}>←</Text></Text></Pressable>{message ? <Text accessibilityRole="alert" style={s.formMessage}>{message}</Text> : null}</>}</View>;
}

function CustomerHome({ onSignOut, userId, inviteToken }: { onSignOut: () => void; userId: string; inviteToken?: string }) {
  const online = useInternetAvailable();
  const [request, setRequest] = useState('');
  const [category, setCategory] = useState('');
  const [budgetCeiling, setBudgetCeiling] = useState('');
  const [tab, setTab] = useState('home');
  const [addressSummary, setAddressSummary] = useState('ما تحدد لسه');
  const [addressId, setAddressId] = useState('');
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [deliveryCodes, setDeliveryCodes] = useState<Record<string,string>>({});
  const [orderActionBusy, setOrderActionBusy] = useState('');
  const [orderActionMessage, setOrderActionMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const requestKey = useRef(newRequestKey());
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const draftDirty = useRef(false);
  useEffect(() => { if (inviteToken) setTab('profile'); }, [inviteToken]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.from('driver_profiles').select('user_id').eq('user_id', userId).maybeSingle().then(({ data }) => {
      if (active && data) setTab((current) => current === 'home' ? 'profile' : current);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    let active = true;
    draftDirty.current = false;
    setDraftReady(false);
    void loadCustomerOrderDraft(userId).then((draft) => {
      if (!active) return;
      if (draft && !draftDirty.current) {
        setRequest(draft.request);
        setCategory(draft.category);
        setBudgetCeiling(draft.budgetCeiling);
        setAddressId(draft.addressId);
        requestKey.current = draft.idempotencyKey;
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!draftReady) return;
    setDraftSaveError(false);
    const timeout = setTimeout(() => {
      void saveCustomerOrderDraft(userId, { request, category, budgetCeiling, addressId, idempotencyKey: requestKey.current })
        .catch(() => setDraftSaveError(true));
    }, 250);
    return () => clearTimeout(timeout);
  }, [userId, draftReady, request, category, budgetCeiling, addressId]);
  useEffect(() => {
    if (tab !== 'home' || !supabase || !online) return;
    supabase.from('addresses').select('id,label,city,neighborhood,is_default').order('is_default', { ascending: false }).order('updated_at', { ascending: false })
      .then(({ data }) => { const rows = data ?? []; const address = rows.find((row) => row.id === addressId) ?? rows[0]; if (addressId && addressId !== address?.id) requestKey.current = newRequestKey(); setAddressId(address?.id ?? ''); setAddressSummary(address ? `${address.label} · ${address.neighborhood}، ${address.city}` : 'ما تحدد لسه'); });
  }, [online, tab, userId, addressId]);
  useEffect(() => {
    if (tab !== 'orders' || !supabase || !online) return;
    supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setOrders(data ?? []));
    const channel = supabase.channel(`customer-orders-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` }, () => {
      void supabase?.from('orders').select('id,status,category,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at').order('created_at', { ascending: false }).limit(30).then(({ data }) => setOrders(data ?? []));
    }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, tab, userId]);
  const submitOrder = async () => {
    const budget = Number(budgetCeiling);
    if (!draftReady) { setRequestMessage('عم نسترجع مسودتك المحفوظة. جرّب بعد لحظة.'); return; }
    if (!supabase || !addressId || !category || !request.trim()) { setRequestMessage('اختار العنوان والقسم واكتب تفاصيل طلبك.'); return; }
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100000000) { setRequestMessage('حدد سقف ميزانية صحيح بالقروش حتى ما يضطر السائق يدفع مبلغ غير متفق عليه.'); return; }
    setSending(true); setRequestMessage('');
    const { error } = await supabase.rpc('create_customer_order', { p_idempotency_key: requestKey.current, p_address_id: addressId, p_category: category, p_request_text: request.trim(), p_budget_ceiling_minor: budget });
    setSending(false);
    if (error) { setRequestMessage(error.message.includes('inactive') ? 'منطقة عنوانك ما عادت متاحة للتوصيل. حدّث العنوان.' : 'ما قدرنا نرسل الطلب. تأكد من العنوان والاتصال وحاول مرة ثانية.'); return; }
    await clearCustomerOrderDraft(userId);
    requestKey.current = newRequestKey(); setRequest(''); setCategory(''); setBudgetCeiling(''); setRequestMessage('وصلنا طلبك! الإدارة رح تقدّر أجرة الطريق وتبعتها إلك للموافقة قبل توزيع السائق.'); setTab('orders');
  };
  const respondPurchase = async (orderId: string, approved: boolean) => {
    if (!supabase) return;
    setOrderActionBusy(orderId); setOrderActionMessage('');
    const { error } = await supabase.rpc('respond_purchase_approval', { p_order_id: orderId, p_approved: approved });
    setOrderActionBusy('');
    if (error) { setOrderActionMessage('ما انحفظ قرارك. حدّث الطلب وجرب مرة تانية.'); return; }
    setOrderActionMessage(approved ? 'وافقت على المبلغ. السائق فيو يكمل.' : 'رفضت المبلغ؛ ما انحسبت المشتريات.');
    await supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at').order('created_at', { ascending: false }).limit(30).then(({data}) => setOrders(data ?? []));
  };
  const respondDeliveryQuote = async (orderId: string, approved: boolean) => {
    if (!supabase) return;
    setOrderActionBusy(orderId); setOrderActionMessage('');
    const { error } = await supabase.rpc('respond_delivery_quote', { p_order_id: orderId, p_approved: approved });
    setOrderActionBusy('');
    if (error) { setOrderActionMessage('ما انحفظ قرارك. حدّث الطلب وجرب مرة تانية.'); return; }
    setOrderActionMessage(approved ? 'وافقت على أجرة الطريق. صار طلبك جاهزاً للتوزيع.' : 'رفضت أجرة الطريق وانلغى الطلب.');
    await supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at').order('created_at', { ascending: false }).limit(30).then(({data}) => setOrders(data ?? []));
  };
  const showDeliveryCode = async (orderId: string) => {
    if (!supabase) return;
    setOrderActionBusy(orderId); setOrderActionMessage('');
    const { data, error } = await supabase.rpc('issue_delivery_code', { p_order_id: orderId });
    setOrderActionBusy('');
    const codeResult = data?.[0];
    if (error || !codeResult) { setOrderActionMessage('ما قدرنا نطلع رمز التسليم. تأكد أن السائق بدأ التوصيل.'); return; }
    setDeliveryCodes((current) => ({...current,[orderId]:codeResult.code}));
    setOrderActionMessage('أعطي هالرمز للسائق بعد ما تستلم كامل طلبك.');
  };
  const cancelOrder = async (orderId: string) => {
    if (!supabase) return;
    setOrderActionBusy(orderId); setOrderActionMessage('');
    const { error } = await supabase.rpc('cancel_customer_order', { p_order_id: orderId, p_reason: 'إلغاء بطلب العميل من التطبيق' });
    setOrderActionBusy('');
    if (error) { setOrderActionMessage('ما قدرنا نلغي الطلب بهالمرحلة. تواصل مع الدعم إذا بلش الشراء.'); return; }
    setOrderActionMessage('انلغى الطلب قبل إتمام الشراء.');
    await supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at').order('created_at', { ascending: false }).limit(30).then(({data}) => setOrders(data ?? []));
  };
  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.header}><View style={s.brand}><View style={s.brandMark}><Text style={s.brandMarkText}>ل</Text></View><View><Text style={s.brandName}>لَبّيك</Text><Text style={s.brandTag}>اطلب، والباقي علينا.</Text></View></View><View style={s.bell}><Text style={s.bellText}>♧</Text></View></View>
      {tab === 'addresses' ? <AddressBook userId={userId} onBack={() => setTab('profile')} /> : tab === 'home' ? <>
      <Pressable style={s.address} onPress={() => setTab('addresses')} accessibilityRole="button"><Text style={s.pin}>⌖</Text><View style={s.addressCopy}><Text style={s.muted}>عنوان التوصيل</Text><Text style={s.addressName}>{addressSummary}</Text><Text style={s.addressHint}>إدارة العناوين المحفوظة</Text></View><Text style={s.addressChevron}>←</Text></Pressable>
      <View style={s.hero}>
        <View style={s.heroCopy}><Text style={s.heroEyebrow}>لَبّيك لاحتياجات يومك</Text><Text style={s.heroTitle}>كل شي ناقصك، بطلب واحد.</Text><Text style={s.heroDescription}>اكتب طلبك ومنهتم بالباقي.</Text></View>
        <View style={s.heroArt} accessibilityElementsHidden><View style={s.heroOrbit}><View style={s.heroCore}><Text style={s.heroMark}>ل</Text></View><View style={s.heroPin}><Text style={s.heroPinText}>⌖</Text></View><View style={s.heroSpark}/><View style={s.heroDot}/></View></View>
        <View style={s.heroFoot}><View style={s.heroDash}/><Text style={s.heroFootText}>من حارتك لباب بيتك</Text></View>
      </View>
      <View style={s.formCard}><Text style={s.draftNotice}>طلب جديد · الدفع كاش عند الاستلام</Text>{draftSaveError ? <Text style={s.formMessage}>تعذّر حفظ المسودة على هذا الجهاز.</Text> : null}
        <Text style={s.label}>طلبك</Text>
        <TextInput editable={draftReady} value={request} onChangeText={(value) => { draftDirty.current = true; setRequest(value); }} multiline textAlignVertical="top" placeholder="مثلاً: خبز، حليب، وبندورة..." placeholderTextColor="#809087" style={s.input} accessibilityLabel="اكتب أغراض طلبك" />
        <View style={s.chips}>{categories.map((item) => <Pressable key={item} disabled={!draftReady} onPress={() => { draftDirty.current = true; setCategory(item); if (!request) setRequest(item + ': '); }} style={[s.chip, category === item && s.chipActive]} accessibilityRole="button" accessibilityState={{ selected: category === item }}><Text style={[s.chipText, category === item && s.chipTextActive]}>{item}</Text></Pressable>)}</View>
        <Text style={s.label}>أعلى ميزانية للمشتريات · قرش</Text><TextInput editable={draftReady} value={budgetCeiling} onChangeText={(value) => { draftDirty.current = true; setBudgetCeiling(value.replace(/\D/g,'')); }} keyboardType="number-pad" textAlign="left" placeholder="مثال: 50000" placeholderTextColor="#809087" style={s.input} accessibilityLabel="سقف ميزانية المشتريات" />
        <View style={s.divider}/>
        <View style={s.attachment}><Text style={s.attachmentIcon}>＋</Text><Text style={s.attachmentText}>إرفاق الصور <Text style={s.optional}>قريباً</Text></Text></View>
      </View>
      <View style={s.note}><Text style={s.noteIcon}>ⓘ</Text><Text style={s.noteText}>الدفع كاش عند الاستلام. الإدارة بتقدّر أجرة التوصيل حسب مسافة الطريق وتعرضها عليك قبل إرسال الطلب للسائق.</Text></View>
      <Pressable disabled={sending || !draftReady} onPress={() => void submitOrder()} style={[s.submit, (sending || !draftReady)&&s.disabled]} accessibilityRole="button"><Text style={s.submitText}>{sending?'عم نرسل الطلب…':'إرسال الطلب'} <Text style={s.submitArrow}>←</Text></Text></Pressable>
      {requestMessage ? <Text accessibilityRole="alert" style={s.requestMessage}>{requestMessage}</Text> : null}
      </> : tab === 'orders' ? <View style={s.orderPage}><Text style={s.pageTitle}>طلباتي</Text><Text style={s.pageDescription}>تابع حالة طلباتك أول بأول.</Text><NotificationInbox userId={userId}/>{orderActionMessage ? <Text accessibilityRole="status" style={s.formMessage}>{orderActionMessage}</Text> : null}{orders.length ? orders.map((order) => <View key={order.id} style={s.orderCard}><View style={s.orderTop}><Text style={s.orderCategory}>{order.category}</Text><Text style={s.orderStatus}>{order.status === 'requested' && !order.delivery_quote_set_at ? 'بانتظار تحديد أجرة الطريق' : orderStatus[order.status] ?? order.status}</Text></View><Text style={s.orderRequest} numberOfLines={3}>{order.request_text}</Text><View style={s.orderBottom}><Text style={s.orderDate}>{new Intl.DateTimeFormat('ar-SY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(order.created_at))}</Text><Text style={s.orderFee}>{order.delivery_quote_set_at ? `التوصيل: ${new Intl.NumberFormat('ar-SY').format(order.delivery_fee_minor)} قرش` : 'أجرة التوصيل حسب مسافة الطريق'}</Text></View><Text style={s.offerExpiry}>سقف المشتريات: {new Intl.NumberFormat('ar-SY').format(order.budget_ceiling_minor)} قرش{order.purchase_amount_minor !== null ? ` · المقترح/الفعلي: ${new Intl.NumberFormat('ar-SY').format(order.purchase_amount_minor)} قرش` : ''}</Text>{order.status === 'quoted' && <View style={s.reviewActions}><Pressable disabled={orderActionBusy===order.id} onPress={() => void respondDeliveryQuote(order.id,true)} accessibilityRole="button" style={[s.approvePurchase,orderActionBusy===order.id&&s.disabled]}><Text style={s.acceptOfferText}>موافقة على أجرة التوصيل</Text></Pressable><Pressable disabled={orderActionBusy===order.id} onPress={() => void respondDeliveryQuote(order.id,false)} accessibilityRole="button" style={[s.rejectPurchase,orderActionBusy===order.id&&s.disabled]}><Text style={s.rejectPurchaseText}>رفض وإلغاء</Text></Pressable></View>}{order.status === 'awaiting_approval' && <View style={s.reviewActions}><Pressable disabled={orderActionBusy===order.id} onPress={() => void respondPurchase(order.id,true)} accessibilityRole="button" style={[s.approvePurchase,orderActionBusy===order.id&&s.disabled]}><Text style={s.acceptOfferText}>موافقة</Text></Pressable><Pressable disabled={orderActionBusy===order.id} onPress={() => void respondPurchase(order.id,false)} accessibilityRole="button" style={[s.rejectPurchase,orderActionBusy===order.id&&s.disabled]}><Text style={s.rejectPurchaseText}>رفض</Text></Pressable></View>}{order.status === 'delivering' && <><Pressable disabled={orderActionBusy===order.id} onPress={() => void showDeliveryCode(order.id)} accessibilityRole="button" style={[s.acceptOffer,orderActionBusy===order.id&&s.disabled]}><Text style={s.acceptOfferText}>{deliveryCodes[order.id] ? 'تجديد رمز التسليم' : 'إظهار رمز التسليم'} ←</Text></Pressable>{deliveryCodes[order.id] && <Text selectable style={s.deliveryCode}>{deliveryCodes[order.id]}</Text>}</>}{(['requested','quoted','searching','accepted','assigned','awaiting_approval'].includes(order.status) || (order.status === 'shopping' && order.purchase_amount_minor === null)) && <Pressable disabled={orderActionBusy === order.id} onPress={() => void cancelOrder(order.id)} style={[s.cancelOrder, orderActionBusy === order.id && s.disabled]} accessibilityRole="button"><Text style={s.cancelOrderText}>إلغاء الطلب</Text></Pressable>}<SupportIssueForm orderId={order.id} status={order.status}/></View>) : <View style={s.empty}><Text style={s.emptyMark}>≋</Text><Text style={s.emptyTitle}>ما عندك طلبات حالياً</Text><Text style={s.emptyCopy}>أول طلب إلك رح يظهر هون.</Text><Pressable onPress={() => setTab('home')} style={s.profileAction} accessibilityRole="button"><Text style={s.profileActionText}>ابدأ طلب جديد <Text style={s.submitArrow}>←</Text></Text></Pressable></View>}</View> : <View style={s.profilePage}><View style={s.empty}><Text style={s.emptyMark}>ل</Text><Text style={s.emptyTitle}>ملفك الشخصي</Text><Text style={s.emptyCopy}>إدارة حسابك وعناوينك المحفوظة.</Text><Pressable onPress={() => setTab('addresses')} style={s.profileAction} accessibilityRole="button"><Text style={s.profileActionText}>إدارة عناويني <Text style={s.submitArrow}>←</Text></Text></Pressable><Pressable onPress={onSignOut} style={s.signOut} accessibilityRole="button"><Text style={s.signOutText}>تسجيل الخروج</Text></Pressable></View><DriverApplicationFlow userId={userId} initialToken={inviteToken}/></View>}
      <View style={s.footer}>{[['home','الرئيسية'],['orders','طلباتي'],['profile','حسابي']].map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={s.footerButton}><Text style={[s.footerItem, tab === key && s.footerActive]}>{label}</Text></Pressable>)}</View>
    </ScrollView>
  </SafeAreaView>;
}

function useInternetAvailable() {
  const network = useNetworkState();
  return network.isConnected !== false && network.isInternetReachable !== false;
}

function NetworkStatusBanner() {
  const online = useInternetAvailable();
  const offline = !online;
  if (!offline) return null;
  return <View accessibilityRole="alert" style={{ backgroundColor: '#3A2D18', borderBottomWidth: 1, borderBottomColor: '#745C2C', paddingHorizontal: 16, paddingVertical: 10 }}>
    <Text style={{ color: '#FFE2A0', textAlign: 'center', fontSize: 12, lineHeight: 19 }}>الاتصال بالإنترنت منقطع. الإجراءات تحتاج اتصال وما رح تنرسل تلقائياً؛ مسودة الطلب محفوظة على هالجهاز.</Text>
  </View>;
}

export default function HomeScreen() {
  const { invite: rawInvite } = useLocalSearchParams<{ invite?: string | string[] }>();
  const router = useRouter();
  const inviteFromLink = Array.isArray(rawInvite) ? rawInvite[0] : rawInvite;
  const [inviteToken, setInviteToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!inviteFromLink) return;
    if (/^[a-f0-9]{64}$/i.test(inviteFromLink)) setInviteToken(inviteFromLink.toLowerCase());
    void router.replace('/');
  }, [inviteFromLink, router]);
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    const readyTimeout = setTimeout(() => { if (active) setReady(true); }, 5000);
    void supabase.auth.getSession()
      .then(({ data }) => { if (active) setSession(data.session); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { clearTimeout(readyTimeout); if (active) setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => { if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true); setSession(value); });
    return () => { active = false; clearTimeout(readyTimeout); subscription.unsubscribe(); };
  }, []);
  const screen = !supabaseConfigured
    ? <AuthScreen inviteToken={inviteToken || undefined} />
    : !ready
      ? <SafeAreaView style={s.safe}><ActivityIndicator color={c.primary} /></SafeAreaView>
      : passwordRecovery
        ? <PasswordRecoveryScreen onDone={() => setPasswordRecovery(false)} />
      : !session
        ? <AuthScreen inviteToken={inviteToken || undefined} />
        : <CustomerHome userId={session.user.id} inviteToken={inviteToken || undefined} onSignOut={() => { void supabase?.auth.signOut(); }} />;
  return <View style={{ flex: 1, backgroundColor: c.background }}><NetworkStatusBanner />{screen}</View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background }, content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 38 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { fontSize: 25, fontWeight: '800', color: c.background }, brandName: { color: c.text, fontSize: 17, fontWeight: '800' }, brandTag: { color: c.muted, fontSize: 11, marginTop: 1 }, bell: { height: 42, width: 42, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, bellText: { color: c.text, fontSize: 20 },
  address: { flexDirection: 'row', alignItems: 'center', marginTop: 25, padding: 14, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border }, pin: { color: c.primary, fontSize: 22, marginRight: 11 }, addressCopy: { flex: 1 }, muted: { color: c.muted, fontSize: 11 }, addressName: { color: c.text, fontSize: 14, fontWeight: '700', marginTop: 3 }, addressHint: { color: c.muted, fontSize: 10, marginTop: 3 }, addressChevron:{color:c.muted,fontSize:18,paddingHorizontal:6},
  hero: { minHeight: 206, borderRadius: 24, backgroundColor: '#B7FF30', marginTop: 23, marginBottom: 19, padding: 20, overflow: 'hidden', justifyContent: 'center' }, heroCopy: { width: '57%', marginLeft: 'auto', zIndex: 2 }, heroEyebrow: { color: '#43552C', fontSize: 12, fontWeight: '700' }, heroTitle: { color: '#0B1411', fontSize: 23, lineHeight: 31, fontWeight: '800', marginTop: 10 }, heroDescription: { color: '#2F3F27', fontSize: 13, marginTop: 7 }, heroFoot: { position: 'absolute', right: 20, bottom: 17, flexDirection: 'row', alignItems: 'center', gap: 7 }, heroDash: { width: 18, height: 2, backgroundColor: '#526936', borderRadius: 2 }, heroFootText: { color: '#3F512A', fontSize: 11, fontWeight: '700' }, heroArt: { position: 'absolute', left: -7, top: 1, bottom: 0, width: '40%', alignItems: 'center', justifyContent: 'center' }, heroOrbit: { width: 134, height: 134, borderRadius: 67, borderWidth: 1, borderColor: 'rgba(11,20,17,.14)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] }, heroCore: { width: 84, height: 84, borderRadius: 28, backgroundColor: '#E7FFB6', transform: [{ rotate: '14deg' }], alignItems: 'center', justifyContent: 'center', shadowColor: '#31451B', shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroMark: { fontSize: 51, lineHeight: 66, color: '#18251A', fontWeight: '800' }, heroPin: { position: 'absolute', right: 3, top: 9, height: 35, width: 35, borderRadius: 12, backgroundColor: '#18251A', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '14deg' }] }, heroPinText: { fontSize: 19, color: '#B7FF30' }, heroSpark: { position: 'absolute', left: 5, top: 26, height: 10, width: 10, borderRadius: 4, backgroundColor: '#F7FFE9', transform: [{ rotate: '30deg' }] }, heroDot: { position: 'absolute', right: 24, bottom: 10, height: 8, width: 8, borderRadius: 4, backgroundColor: '#4D622D' },
  formCard: { padding: 17, borderRadius: 18, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }, draftNotice: { color: '#b6c3ba', fontSize: 10, marginBottom: 13, textAlign: 'left' }, label: { color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 11 }, input: { fontFamily: 'Tajawal_400Regular', minHeight: 98, borderWidth: 1, borderColor: '#405449', borderRadius: 12, backgroundColor: '#17231c', padding: 13, color: c.text, fontSize: 15, lineHeight: 23 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, chip: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#405348', backgroundColor: '#223128' }, chipActive: { backgroundColor: '#344629', borderColor: c.primary }, chipText: { fontSize: 12, color: '#d4ddd7' }, chipTextActive: { color: '#e1ffc0', fontWeight: '700' }, divider: { height: 1, backgroundColor: c.border, marginTop: 16 }, attachment: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 }, attachmentIcon: { color: c.primary, fontSize: 21 }, attachmentText: { color: c.text, fontSize: 13, fontWeight: '600' }, optional: { color: c.muted, fontSize: 11, fontWeight: '400' }, endArrow: { color: c.muted, marginLeft: 'auto' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 15, paddingHorizontal: 2 }, noteIcon: { color: '#99bd75', fontSize: 15 }, noteText: { color: c.muted, fontSize: 12, lineHeight: 19, flex: 1 }, submit: { height: 54, marginTop: 20, backgroundColor: '#526043', borderRadius: 14, alignItems: 'center', justifyContent: 'center', opacity: 0.75 }, submitText: { color: '#d9e7c2', fontSize: 15, fontWeight: '800' }, submitArrow: { fontSize: 17 }, pending: { color: '#819087', textAlign: 'center', fontSize: 10, lineHeight: 16, marginTop: 9 }, footer: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: c.border, marginTop: 27, paddingTop: 10 }, footerButton: { minWidth: 75, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, footerActive: { color: c.primary, fontSize: 12, fontWeight: '700' }, footerItem: { color: c.muted, fontSize: 12 }, empty: { minHeight: 320, marginTop: 26, borderWidth: 1, borderColor: c.border, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 24 }, emptyMark: { color: c.primary, backgroundColor: '#344629', overflow: 'hidden', borderRadius: 16, padding: 10, fontSize: 26, fontWeight: '800' }, emptyTitle: { color: c.text, fontWeight: '700', fontSize: 16, marginTop: 18 }, emptyCopy: { color: c.muted, fontSize: 12, marginTop: 7 }, signOut: { marginTop: 22, borderWidth: 1, borderColor: c.danger, borderRadius: 10, paddingHorizontal: 18, minHeight: 42, justifyContent: 'center' }, signOutText: { color: c.danger, fontWeight: '700', fontSize: 13 },
  addressPage:{marginTop:24},backLink:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,alignSelf:'flex-start'},backArrow:{fontSize:18,color:c.primary},backText:{fontSize:12,color:'#D3EFA4',fontWeight:'700'},pageTitle:{color:c.text,fontSize:25,fontWeight:'800',textAlign:'right',marginTop:10},pageDescription:{color:c.muted,fontSize:13,textAlign:'right',marginTop:5,marginBottom:17},savedAddress:{flexDirection:'row',alignItems:'center',gap:11,padding:14,marginBottom:10,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},savedPin:{width:36,height:36,borderRadius:12,backgroundColor:'#344629',alignItems:'center',justifyContent:'center'},savedCopy:{flex:1},savedLabel:{color:c.text,fontSize:14,fontWeight:'700'},savedDetail:{color:c.muted,fontSize:11,marginTop:3},deleteAddress:{paddingHorizontal:8,paddingVertical:9},deleteText:{color:c.danger,fontSize:11,fontWeight:'700'},sectionTitle:{color:c.text,fontWeight:'800',fontSize:16,marginBottom:17},zoneList:{gap:8,marginBottom:17},zoneOption:{padding:12,borderWidth:1,borderColor:'#405348',borderRadius:12,backgroundColor:'#1A2920'},zoneSelected:{borderColor:c.primary,backgroundColor:'#283922'},zoneName:{color:c.text,fontWeight:'700',fontSize:13},zoneNameSelected:{color:'#DFFFAD'},zoneMeta:{color:c.muted,fontSize:11,marginTop:4},field:{fontFamily:'Tajawal_400Regular',minHeight:48,borderWidth:1,borderColor:'#405449',borderRadius:12,backgroundColor:'#17231c',paddingHorizontal:12,color:c.text,fontSize:14,marginBottom:14},inlineFields:{flexDirection:'row',gap:10},inline:{flex:1},saveAddress:{minHeight:50,borderRadius:13,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',marginTop:5},disabled:{opacity:0.6},saveAddressText:{color:c.background,fontWeight:'800',fontSize:14},noZones:{padding:18,borderRadius:14,backgroundColor:'#17251C',borderWidth:1,borderColor:c.border,alignItems:'center'},noZonesTitle:{color:c.text,fontWeight:'700',fontSize:14},formMessage:{color:'#F6C76A',textAlign:'right',fontSize:12,marginTop:12,lineHeight:19},profileAction:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:'#1A2920',paddingHorizontal:15,justifyContent:'center',marginTop:20},profileActionText:{color:'#DFFFAE',fontSize:13,fontWeight:'700'},
  requestMessage:{color:'#DFFFAD',fontSize:12,textAlign:'center',lineHeight:20,marginTop:11},orderPage:{marginTop:23},orderCard:{borderRadius:15,padding:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,marginBottom:10},orderTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},orderCategory:{color:c.text,fontWeight:'800',fontSize:14},orderStatus:{color:'#DFFFAD',fontSize:11,fontWeight:'700'},orderRequest:{color:'#C1CEC5',fontSize:12,lineHeight:19,marginTop:10},orderBottom:{borderTopWidth:1,borderTopColor:c.border,marginTop:12,paddingTop:10,flexDirection:'row',justifyContent:'space-between',gap:8},orderDate:{color:c.muted,fontSize:10},orderFee:{color:'#B7D58D',fontSize:10},reviewActions:{flexDirection:'row',gap:9,marginTop:12},approvePurchase:{flex:1,minHeight:42,borderRadius:11,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},rejectPurchase:{flex:1,minHeight:42,borderRadius:11,borderWidth:1,borderColor:'#755544',backgroundColor:'#28221e',alignItems:'center',justifyContent:'center'},rejectPurchaseText:{color:'#ffc6a9',fontSize:12,fontWeight:'700'},deliveryCode:{color:c.primary,fontSize:28,fontWeight:'800',letterSpacing:8,textAlign:'center',paddingVertical:8,marginTop:8,backgroundColor:'#263621',borderRadius:12},profilePage:{marginTop:23,gap:13},driverApplyCard:{borderRadius:18,padding:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverApplyMark:{width:38,height:38,borderRadius:12,backgroundColor:'#344629',alignItems:'center',justifyContent:'center',marginBottom:12},driverApplyIcon:{color:c.primary,fontSize:19},driverApplyTitle:{color:c.text,fontSize:16,fontWeight:'800',textAlign:'right'},driverApplyCopy:{color:c.muted,fontSize:12,lineHeight:20,textAlign:'right',marginTop:6,marginBottom:16},driverStatus:{alignSelf:'flex-start',marginTop:13,borderRadius:20,overflow:'hidden',paddingHorizontal:12,paddingVertical:6,backgroundColor:'#2d4028',color:'#DFFFAD',fontSize:11,fontWeight:'700'},
  driverPanel:{borderRadius:18,padding:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverPanelTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:16},driverRefresh:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#233229'},driverRefreshGlyph:{fontSize:20,color:c.primary},availabilityButton:{minHeight:50,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,borderRadius:13,backgroundColor:'#243329',borderWidth:1,borderColor:'#425348',marginBottom:18},availabilityOn:{backgroundColor:'#283b22',borderColor:'#8fb558'},availabilityDot:{width:8,height:8,borderRadius:4,backgroundColor:'#87978b'},availabilityDotOn:{backgroundColor:'#B7FF30'},availabilityText:{fontSize:13,fontWeight:'700',color:'#B9C7BE'},availabilityTextOn:{color:'#DFFFAD'},driverOffersHead:{flexDirection:'row',alignItems:'center',gap:9,marginTop:8,marginBottom:12},offerCount:{color:c.primary,fontSize:11,fontWeight:'800'},offerCard:{borderRadius:15,padding:14,backgroundColor:'#17241C',borderWidth:1,borderColor:'#34473A',marginBottom:11},offerExpiry:{color:'#F0CC83',fontSize:10,marginTop:8},acceptOffer:{minHeight:44,borderRadius:11,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',marginTop:12},acceptOfferText:{color:c.background,fontWeight:'800',fontSize:13},declineOffer:{minHeight:36,borderRadius:10,borderWidth:1,borderColor:'#5a4a3c',alignItems:'center',justifyContent:'center',marginTop:7},declineOfferText:{color:'#e8c3a9',fontSize:11,fontWeight:'700'},cancelOrder:{minHeight:38,borderRadius:10,borderWidth:1,borderColor:'#63443a',alignItems:'center',justifyContent:'center',marginTop:10,backgroundColor:'#261d1a'},cancelOrderText:{color:'#ffc6a9',fontSize:11,fontWeight:'700'},noOffers:{minHeight:150,borderRadius:14,backgroundColor:'#17241C',borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',padding:18,marginBottom:15},noOffersGlyph:{color:c.primary,fontSize:23},noOffersTitle:{color:c.text,fontWeight:'800',fontSize:13,marginTop:7},noOffersCopy:{color:c.muted,textAlign:'center',fontSize:11,lineHeight:18,marginTop:5},dropoff:{borderTopWidth:1,borderTopColor:c.border,marginTop:12,paddingTop:11},dropoffTitle:{color:'#DFFFAD',fontSize:11,fontWeight:'800'},dropoffText:{color:'#C4D0C8',fontSize:11,lineHeight:18,marginTop:4},dropoffPhone:{color:c.primary,fontSize:12,fontWeight:'800',marginTop:6,textAlign:'left'},
});
