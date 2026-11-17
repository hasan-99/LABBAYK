-- =====================================================================
-- حسابات تجريبية للمراجعين (عميل + سائق)
-- =====================================================================
-- 1) أنشئ المستخدمين أولاً من Supabase > Authentication > Users > Add user
--    (فعّل Auto Confirm User حتى لا يُطلب رمز البريد). أمثلة بريد تصل لصندوقك:
--      hasan.cy99+customer@gmail.com   (عميل)
--      hasan.cy99+driver@gmail.com     (سائق)
-- 2) غيّر البريدين أدناه إن لزم، ثم شغّل هذا الملف في SQL Editor.
-- 3) العميل: يسجل دخوله ويضيف عنوانه من التطبيق (الدور يُنشأ تلقائياً).
-- 4) السائق: هذا الملف يعتمده مباشرة (بدل الدعوة والموافقة) ويكمل ملفه.
-- =====================================================================

update public.profiles set display_name = 'عميل تجريبي'
  where id = (select id from auth.users where email = 'hasan.cy99+customer@gmail.com');

update public.profiles set display_name = 'سائق تجريبي'
  where id = (select id from auth.users where email = 'hasan.cy99+driver@gmail.com');

insert into public.driver_profiles (user_id, review_status, vehicle_description, approved_at, approved_by, phone_e164, age)
select u.id, 'approved', 'دراجة نارية', now(),
       (select user_id from public.user_roles where role = 'super_admin' limit 1),
       '+963900000001', 30
from auth.users u where u.email = 'hasan.cy99+driver@gmail.com'
on conflict (user_id) do update
  set review_status = 'approved', approved_at = now(),
      approved_by = excluded.approved_by, phone_e164 = excluded.phone_e164, age = excluded.age;

insert into public.user_roles (user_id, role)
select id, 'driver' from auth.users where email = 'hasan.cy99+driver@gmail.com'
on conflict (user_id, role) do nothing;

delete from public.user_roles
  where role = 'driver_pending'
    and user_id = (select id from auth.users where email = 'hasan.cy99+driver@gmail.com');

-- للتحقق:
select u.email, array_agg(r.role) as roles
from auth.users u left join public.user_roles r on r.user_id = u.id
where u.email in ('hasan.cy99+customer@gmail.com', 'hasan.cy99+driver@gmail.com')
group by u.email;
