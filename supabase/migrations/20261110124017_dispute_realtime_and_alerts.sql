create index if not exists order_disputes_resolved_by_idx on public.order_disputes(resolved_by) where resolved_by is not null;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_disputes') then
    execute 'alter publication supabase_realtime add table public.order_disputes';
  end if;
end $$;

create function private.notify_admin_support_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if new.event_type not in ('order_disputed','dispute_resolved') then return new; end if;
  select * into v_order from public.orders where id=new.order_id;
  insert into public.notifications(recipient_id,order_id,source_event_id,event_type,title,body)
  select ur.user_id,new.order_id,new.id,new.event_type,
    case new.event_type when 'order_disputed' then 'قضية دعم جديدة' else 'تم تحديث قضية دعم' end,
    case new.event_type when 'order_disputed' then 'وصل بلاغ جديد على الطلب #'||left(new.order_id::text,8)||'. راجعه من صفحة الدعم.'
      else 'تم حل قضية الطلب #'||left(new.order_id::text,8)||'.' end
  from public.user_roles ur where ur.role='super_admin' and ur.user_id is distinct from new.actor_id
  on conflict(recipient_id,source_event_id) where source_event_id is not null do nothing;
  return new;
end;
$$;
revoke all on function private.notify_admin_support_event() from public,anon,authenticated;
create trigger order_event_admin_support_notification after insert on public.order_events
  for each row when (new.event_type in ('order_disputed','dispute_resolved'))
  execute function private.notify_admin_support_event();
