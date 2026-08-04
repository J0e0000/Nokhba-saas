-- ============================================================================
-- نظام النخبة — Migration 010: اشتراك منفصل للألعاب التعليمية
-- ============================================================================
-- الألعاب مقفولة افتراضيًا لأي مدرّس، والأدمن بس اللي يقدر يفعّلها له.
-- ============================================================================

alter table profiles add column if not exists games_addon_status text
  not null default 'inactive' check (games_addon_status in ('inactive', 'active'));
alter table profiles add column if not exists games_addon_expires_at timestamptz;
