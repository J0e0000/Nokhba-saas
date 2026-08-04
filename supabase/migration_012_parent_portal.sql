-- ============================================================================
-- Parent Portal Access Tokens
-- ============================================================================
-- هذه الجداول تدعم بوابة أولياء الأمور - تسمح للآباء برؤية تقدم أطفالهم
-- دون الحاجة لحساب كامل

create table if not exists parent_access_tokens (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 year'),
  is_active boolean not null default true
);

-- فهرس لتسريع البحث عن التوكن
create index if not exists idx_parent_access_token on parent_access_tokens(token);
create index if not exists idx_parent_access_student on parent_access_tokens(student_id);

-- دالة لإنشاء توكن جديد
create or replace function create_parent_access_token(student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_teacher_id uuid;
begin
  -- تحقق من أن المستخدم الحالي هو معلم الطالب
  select teacher_id into v_teacher_id from students where id = student_id;
  
  if v_teacher_id is null then
    raise exception 'Student not found';
  end if;
  
  if auth.uid() != v_teacher_id then
    raise exception 'You do not have permission to create access token for this student';
  end if;
  
  -- إنشاء توكن عشوائي
  v_token := encode(gen_random_bytes(32), 'hex');
  
  -- إدراج التوكن في الجدول
  insert into parent_access_tokens (student_id, teacher_id, token)
  values (student_id, v_teacher_id, v_token);
  
  return v_token;
end;
$$;

-- دالة للتحقق من صحة التوكن
create or replace function verify_parent_token(token text)
returns table (
  student_id uuid,
  student_name text,
  student_stage text,
  student_points integer,
  student_attendance_status text
)
language sql
security definer
set search_path = public
as $$
  select 
    s.id,
    s.name,
    s.stage,
    s.points,
    s.attendance_status
  from students s
  join parent_access_tokens pat on s.id = pat.student_id
  where pat.token = $1
    and pat.is_active = true
    and pat.expires_at > now();
$$;

-- دالة لإلغاء توكن
create or replace function revoke_parent_token(token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update parent_access_tokens
  set is_active = false
  where parent_access_tokens.token = token
    and teacher_id = auth.uid();
  
  return found;
end;
$$;

-- RLS Policies
alter table parent_access_tokens enable row level security;

-- المعلم يقدر يشوف والتوكنات بتوعه بس
create policy "parent_tokens_teacher_access" on parent_access_tokens
  for all using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
