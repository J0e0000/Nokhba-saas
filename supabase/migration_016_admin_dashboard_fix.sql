-- ============================================================================
-- إصلاح شامل لوحة الإدارة والأذونات
-- ============================================================================

-- 1) التأكد من أن حساب الأدمن الرئيسي مفعل دائماً
update public.profiles 
set 
  is_admin = true, 
  is_verified = true,
  subscription_status = 'active',
  subscription_expires_at = '9999-12-31 23:59:59'
where email = 'joussefsoliman87@gmail.com';

-- 2) إنشاء دالة محسّنة للتحقق من صلاحيات الأدمن
create or replace function public.is_admin_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

-- 3) إنشاء دالة للتحقق من الاشتراك (تسمح للأدمن دائماً)
create or replace function public.is_subscription_active()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        is_admin = true -- الأدمن يدخل دائماً
        or (
          is_verified = true 
          and subscription_status in ('trial', 'active') 
          and subscription_expires_at > now()
        )
      )
  );
$$;

-- 4) حذف السياسات القديمة وإعادة إنشاء سياسات جديدة صحيحة
drop policy if exists "profiles_admin_read" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_self_access" on public.profiles;

-- 5) سياسة القراءة: الأدمن يقرأ كل شيء، والمستخدم يقرأ نفسه فقط
create policy "profiles_read" on public.profiles
  for select
  using (
    auth.uid() = id 
    or is_admin_user()
  );

-- 6) سياسة التحديث: الأدمن يحدث أي شيء، والمستخدم يحدث نفسه فقط (بدون تغيير الحالة)
create policy "profiles_update" on public.profiles
  for update
  using (
    is_admin_user() 
    or auth.uid() = id
  )
  with check (
    is_admin_user() 
    or (auth.uid() = id and is_verified = (select is_verified from public.profiles where id = auth.uid()))
  );

-- 7) سياسة الإدراج: الأدمن فقط
create policy "profiles_insert" on public.profiles
  for insert
  with check (is_admin_user());

-- 8) سياسة الحذف: الأدمن فقط
create policy "profiles_delete" on public.profiles
  for delete
  using (is_admin_user());

-- 9) التأكد من تفعيل RLS على جدول البروفايلات
alter table public.profiles enable row level security;

-- 10) إنشاء جدول لتسجيل عمليات الأدمن (للأمان والتدقيق)
create table if not exists public.admin_logs (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_id uuid,
  target_type text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone default now()
);

-- 11) تفعيل RLS على جدول السجلات
alter table public.admin_logs enable row level security;

-- 12) سياسات جدول السجلات
create policy "admin_logs_read" on public.admin_logs
  for select
  using (is_admin_user());

create policy "admin_logs_insert" on public.admin_logs
  for insert
  with check (is_admin_user() and admin_id = auth.uid());

-- 13) إنشاء دالة لتسجيل عمليات الأدمن تلقائياً
create or replace function public.log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin_user() then
    insert into public.admin_logs (admin_id, action, target_id, target_type, old_data, new_data)
    values (
      auth.uid(),
      tg_op,
      case when tg_op = 'DELETE' then old.id else new.id end,
      tg_table_name,
      case when tg_op = 'DELETE' then row_to_json(old) else null end,
      case when tg_op != 'DELETE' then row_to_json(new) else null end
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 14) تطبيق التسجيل على جدول البروفايلات
drop trigger if exists profiles_admin_log on public.profiles;
create trigger profiles_admin_log
  after update on public.profiles
  for each row
  when (is_admin_user())
  execute function log_admin_action();

-- 15) التأكد من أن جميع الجداول الأخرى لديها RLS صحيح
alter table public.students enable row level security;
alter table public.exams enable row level security;
alter table public.exam_scores enable row level security;
alter table public.attendance_records enable row level security;

-- 16) إعادة تعيين الأذونات للجداول الأخرى
drop policy if exists "students_read" on public.students;
create policy "students_read" on public.students
  for select
  using (
    teacher_id = auth.uid() 
    or (select is_admin from public.profiles where id = auth.uid()) = true
  );

drop policy if exists "students_write" on public.students;
create policy "students_write" on public.students
  for all
  using (
    teacher_id = auth.uid() 
    or (select is_admin from public.profiles where id = auth.uid()) = true
  );

-- 17) إنشاء دالة مساعدة للتحقق من وجود المستخدم
create or replace function public.get_current_user()
returns table (
  id uuid,
  email text,
  full_name text,
  is_admin boolean,
  is_verified boolean
)
language sql
security definer
set search_path = public
as $$
  select id, email, full_name, is_admin, is_verified
  from public.profiles
  where id = auth.uid();
$$;

-- 18) منح الأذونات على الدوال
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_subscription_active() to authenticated;
grant execute on function public.get_current_user() to authenticated;
