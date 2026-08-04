-- ============================================================================
-- إضافة التحقق من الحساب ورقم الهاتف
-- ============================================================================

-- 1) إضافة الأعمدة لجدول البروفايلات
alter table public.profiles 
add column if not exists phone text,
add column if not exists is_verified boolean not null default false;

-- 2) تحديث دالة معالجة المستخدم الجديد لتشمل الهاتف والتحقق
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, is_verified)
  values (
    new.id, 
    new.raw_user_meta_data ->> 'full_name', 
    new.email, 
    new.raw_user_meta_data ->> 'phone',
    false -- الحسابات الجديدة غير مفعلة افتراضيًا
  );
  return new;
end;
$$;

-- 3) تحديث السياسات الأمنية (RLS)
-- التأكد من أن المستخدم لا يمكنه الوصول للبيانات إلا إذا كان حسابه مفعلًا
-- سنقوم بتحديث دالة is_subscription_active لتشمل فحص التحقق أيضًا

create or replace function is_subscription_active()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (is_verified = true or is_admin = true) -- الأدمن والنشطين فقط
      and (subscription_status in ('trial', 'active') or is_admin = true)
      and (subscription_expires_at > now() or is_admin = true)
  );
$$;

-- 4) منع المستخدمين من تعديل حالة التفعيل الخاصة بهم
create policy "users_cannot_verify_self" on profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id 
    and (is_verified = (select is_verified from profiles where id = auth.uid())) -- لا يمكن تغيير حالة التفعيل
  );

-- 5) إضافة سجلات أمنية لمحاولات الدخول غير المفعلة
create or replace function log_unverified_access()
returns trigger as $$
begin
  if not (select is_verified from profiles where id = new.id) then
    raise notice 'محاولة وصول من حساب غير مفعل: %', new.email;
  end if;
  return new;
end;
$$ language plpgsql;

