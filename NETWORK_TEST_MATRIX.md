# مصفوفة اختبارات الشبكة والأجهزة

**الحالة الآن:** حالات الـnetwork profiles أدناه **NOT RUN**. القيم من الملف المرفق هي حمل اصطناعي للبدء وليست وصفًا عامًا لشبكات سوريا. لم يتوفر iPhone أو جهاز Android فعلي أو مختبر داخل سوريا في هذه المراجعة. نجح الاختبار المحلي الموجه (13 فحصًا للشبكة والمهلة والإلغاء وتقليل البيانات واستعادة المسودة)؛ راجع `NETWORK_FIX_PLAN.md`.

## حزم التدفق المطلوبة في كل صف

- **العميل C:** cold start، الدخول/OTP عند الحاجة، قراءة ملف وعناوين وطلبات/تنبيهات، إنشاء مسودة دون اتصال واستعادتها، إنشاء طلب مرة واحدة، واستكمال رفع الصور بعد الانقطاع.
- **السائق D:** cold start والدخول، توفر/عروض/طلبات/رصيد، قبول/اعتذار، تحديث حالة التسوق والشراء والتوصيل، إظهار البيانات القديمة ووقت آخر sync دون السماح بأفعال live على snapshot قديمة.
- **مشترك S:** تغير Wi-Fi/خلوي، foreground/background/restart، رسائل عربية واضحة، Retry/Cancel، عدم التكرار، وقراءة cache بعد reconnect.

## المنصات × الملفات × التدفقات الأساسية

| الملف | المنصة والجهاز المرجعي المطلوب | التدفقات الواجب تمريرها | النتيجة المتوقعة | نتيجة اليوم |
|---|---|---|---|---|
| Baseline · 5 Mbps / 100ms / 0% loss | iOS: iPhone يدعم الحد الأدنى للتطبيق؛ Android: هاتف متوسط يدعم API المستهدف | C + D + S؛ مسح requests/bytes/latency/cold-start خلال جلسة 10 دقائق | الوظائف تعمل؛ تسجيل baseline لكل request/صورة ومن دون تكرار | NOT RUN — لا جهاز/trace |
| Slow · 1 Mbps / 300ms / 1% loss | iOS reference iPhone؛ Android متوسط | C + D + S؛ upload صورة وفتح order history | النص والعناصر الرئيسية تسبق الصور؛ لا انتظار غير محدود؛ يظهر تقدم upload | NOT RUN |
| Very slow · 256 Kbps / 700ms / 3% loss | iOS reference iPhone؛ Android متوسط | C: home/orders/draft ثم C order؛ D: offers/orders والمهام؛ S | قراءة النص/cache متاحة؛ الوسائط اختيارية/مخفضة؛ لا تتكرر الكتابة | NOT RUN |
| Extreme · 128 Kbps / 1200ms / 5% loss | iOS reference iPhone؛ Android متوسط | C + D + S؛ طلب API واحد يظل معلّقًا ثم timeout | لا spinner غير منتهٍ؛ البيانات القديمة معلّمة؛ Cancel/Retry آمنان | NOT RUN |
| Intermittent · 2 Mbps / 400ms / 10% loss | iOS reference iPhone؛ Android متوسط | C: submit + 3 uploads; D: accept offer/update state; app restart/retry | الطلب الواحد لا يتكرر؛ الملفات المكتملة لا ترفع مجددًا؛ الفشل الجزئي واضح | NOT RUN |
| Offline · 0 / N/A / 100% loss | iOS reference iPhone؛ Android متوسط | C: مسودة وطلبات cached؛ D: snapshot؛ منع كل فعل live، ثم restart | قراءة النص المحفوظ؛ عدم عرض السعر/الرصيد القديم كقيمة حالية؛ لا نجاح وهمي | NOT RUN |
| Switch · Wi-Fi → offline → cellular، متغير | iOS reference iPhone؛ Android متوسط | C + D + S مع تبديل أثناء الطلب/الرفع، خلفية/مقدمة، واستعادة auth token | حالة الاتصال تهدأ؛ يعود refresh أماميًا؛ لا duplicate channel/write/login loop | NOT RUN |

## سجلات يجب أخذها لكل تجربة

`platform | model | OS/build | city (اختياري عام) | carrier/fixed ISP | network profile | UTC time | screen/action | request count | bytes in/out | duration | status | retry count | cache age | result`

- لا تسجل email أو phone أو token أو عنوانًا أو تفاصيل طلب أو صورة ضمن سجل الاختبار.
- اختبر SMS/email والـpush وDNS/TLS من داخل سوريا على حسابات تجريبية فقط؛ لا تستخدم بيانات عميل حقيقية.
- ابدأ بقياس النجاح والأخطاء؛ لا تعتمد على “connected” من شريط النظام كدليل وصول API.
- سجّل الصور بعد ضغطها بالأبعاد/bytes، وميز نقل JSON عن assets وحزم Expo.
- أعد صفوف offline/restart والكتابات ذات الأثر على staging مع idempotency server-side، لا على طلبات عملاء حقيقية.

## شروط قبول مؤقتة قبل إنهاء هذه المصفوفة

- كل الصفوف تمر على iOS وAndroid مع محضر جهاز/OS/شبكة، أو تُعلّم صراحةً غير قابلة للاختبار.
- شاشة مخزنة تصل للمستخدم خلال أقل من ثانيتين offline على أجهزة المرجع، مع وقت sync وحالة stale.
- 256 Kbps يبقي النص الأساسي واضحًا ولا يحمّل الصور الاختيارية تلقائيًا.
- timeout يعرض الخطأ/زر retry دون مسح مسودة محفوظة؛ draft restore ينجح بعد إنهاء التطبيق.
- order RPC المعاد لا ينشئ سجلًا ثانيًا؛ الرفع الجزئي لا يكرر ملفًا مكتملًا ولا يسقط الملف المتبقي بصمت.
- لا تعرض لقطة رصيد/سعر/توفر قديمة كأنها حية، ولا تُرسل أفعال مالية في طابور offline.
