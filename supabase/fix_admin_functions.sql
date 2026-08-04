-- ============================================================================
-- نظام النخبة — Fix Admin Functions
-- ============================================================================

-- 1) دالة لإعادة تعيين كلمة المرور مباشرة من قبل الأدمن
-- تُشغل بصلاحيات كاملة (security definer) لتتمكن من تعديل جدول auth.users
create or replace function admin_reset_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- التأكد أن من ينفذ الأمر هو أدمن
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'غير مسموح: يجب أن تكون أدمن لتنفيذ هذا الأمر.';
  end if;

  -- تحديث كلمة المرور في جدول auth.users
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;
end;
$$;

-- 2) دالة لمسح كل بيانات المدرّس (Reset Data) بشكل آمن وسريع
create or replace function admin_reset_teacher_data(target_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- التأكد أن من ينفذ الأمر هو صاحب البيانات أو أدمن
  if not (auth.uid() = target_teacher_id or (select is_admin from profiles where id = auth.uid())) then
    raise exception 'غير مسموح.';
  end if;

  -- مسح البيانات من كل الجداول المتعلقة بالمدرّس
  delete from public.attendance_records where teacher_id = target_teacher_id;
  delete from public.behavior_logs where teacher_id = target_teacher_id;
  delete from public.exam_scores where teacher_id = target_teacher_id;
  delete from public.exams where teacher_id = target_teacher_id;
  delete from public.students where teacher_id = target_teacher_id;
  delete from public.session_logs where teacher_id = target_teacher_id;
  delete from public.group_schedule where teacher_id = target_teacher_id;
  delete from public.groups where teacher_id = target_teacher_id;
  delete from public.feature_unlocks where teacher_id = target_teacher_id;
  -- لا نمسح الـ profile نفسه ولا الإعدادات الأساسية إلا لو أردنا تصحيحها
  update public.teacher_settings 
  set groups = array['المجموعة الافتراضية'],
      report_fields = array['rank', 'position', 'points', 'warnings', 'attendance', 'homework', 'session', 'logs']
  where teacher_id = target_teacher_id;
end;
$$;

-- منح صلاحية التنفيذ للمستخدمين المسجلين (سيتم التحقق من الأدمن داخل الدالة)
grant execute on function admin_reset_password(uuid, text) to authenticated;
grant execute on function admin_reset_teacher_data(uuid) to authenticated;
