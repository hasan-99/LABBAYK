with inserted as (
  insert into public.commission_policies(id,rate_basis_points,version,updated_by)
  values(1,4000,1,null)
  on conflict(id) do nothing
  returning id,rate_basis_points,version
)
insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
select null,'set_commission_rate','commission_policy',inserted.id::text,
  'نسبة العمولة الأولية المعتمدة من مالك المشروع: 40% من أجرة التوصيل فقط.',
  '{}'::jsonb,jsonb_build_object('rate_basis_points',inserted.rate_basis_points,'version',inserted.version)
from inserted;
