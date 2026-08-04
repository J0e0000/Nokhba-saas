-- ============================================================================
-- نظام النخبة — Migration 013: إصلاحات الأدمن ودالة مسح البيانات
-- ============================================================================

-- 1) دالة لمسح كل بيانات النظام (للأدمن فقط)
-- دي دالة خطيرة جداً، بتشيل كل الطلاب والدرجات والغياب لكل المدرسين
create or replace function admin_wipe_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'غير مسموح: للأدمن فقط';
  end if;

  -- مسح البيانات بالترتيب الصحيح عشان الـ foreign keys
  delete from behavior_logs;
  delete from attendance_records;
  delete from exam_scores;
  delete from exams;
  delete from students;
  delete from session_logs;
  delete from teacher_settings;
  delete from feature_unlocks;
  delete from broadcast_messages;
  delete from admin_activity_log;
  
  -- ملاحظة: مش بنمسح الـ profiles ولا الـ users عشان الحسابات تفضل موجودة
end;
$$;

-- 2) دالة لمسح بيانات مدرس معين (للأدمن)
create or replace function admin_wipe_teacher_data(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'غير مسموح: للأدمن فقط';
  end if;

  delete from behavior_logs where teacher_id = target_id;
  delete from attendance_records where teacher_id = target_id;
  delete from exam_scores where teacher_id = target_id;
  delete from exams where teacher_id = target_id;
  delete from students where teacher_id = target_id;
  delete from session_logs where teacher_id = target_id;
  delete from teacher_settings where teacher_id = target_id;
  delete from feature_unlocks where teacher_id = target_id;
end;
$$;

-- 3) التأكد من وجود كل الجداول والسياسات المطلوبة
-- (تكرار الحماية لضمان إن الأدمن يقدر يعدل أي بروفايل)
drop policy if exists "profiles_admin_update" on profiles;
create policy "profiles_admin_update" on profiles
  for update using (is_admin_user());

grant execute on function admin_wipe_all_data() to authenticated;
grant execute on function admin_wipe_teacher_data(uuid) to authenticated;
