# نشر لَبّيك على Google Play (أندرويد)

الأوامر تُشغَّل على جهازك (الجلسة السحابية لا تملك حساب Expo ولا Supabase).

## 1) رابط ثابت لسياسة الخصوصية
```bash
git pull origin master && pnpm install
cd apps/mobile
npx expo export --platform web
eas deploy --prod        # يُنشر على رابط ثابت غالباً: https://labbayk.expo.app
```
تحقق أن الصفحات تعمل: `/privacy` و`/terms` و`/support` و`/delete-account`، وضع `/privacy` رابطاً لسياسة الخصوصية في Play Console و`/delete-account` رابط حذف الحساب.

## 2) حسابات تجريبية للمراجعين
1. Supabase > Authentication > Users > Add user (فعّل Auto Confirm) للعميل والسائق.
2. شغّل `supabase/pending/create_test_accounts.sql` (يعتمد السائق ويضبط الأدوار).
3. من التطبيق: أضف عنواناً للعميل، وفعّل التوفر للسائق، وجهّز طلباً تجريبياً.
4. في Play Console > App content > App access: اكتب بريد وكلمة مرور العميل والسائق.

## 3) البناء الإنتاجي (AAB)
```bash
cd apps/mobile
eas env:list production            # يجب أن تحتوي EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
eas build -p android --profile production
eas submit -p android --latest     # أو ارفع ملف AAB من Play Console يدوياً
```
- `autoIncrement` مفعّل: يزيد رقم الإصدار تلقائياً مع كل بناء.
- أول بناء يسألك عن إنشاء مفتاح التوقيع: دع EAS يديره.

## 4) قبل الإرسال
- طبّق هجرات Supabase المعلّقة (`supabase/pending/apply_pending_migrations.sql`).
- تأكد من بيانات المشغّل والبريد في `apps/mobile/src/lib/legal-contact.ts`.
- نموذج Data safety: البريد، الاسم، الهاتف، العنوان، صور الطلب والتسليم، المبالغ، بلاغات الدعم، رمز الإشعارات.
- الحسابات الشخصية الجديدة قد تحتاج اختباراً مغلقاً (12 مختبراً × 14 يوماً) قبل النشر العام؛ تحقق من الشرط الحالي في Play Console.
