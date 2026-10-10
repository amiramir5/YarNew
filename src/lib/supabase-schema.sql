-- ==============================================================================
-- اسکریپت راه‌اندازی و اتصال پایگاه‌داده سوپابیس (Supabase) برای رقابت زنده دونفره
-- پروژه: fsyfdwgtteeyxtoumltz.supabase.co
-- این اسکریپت را در بخش SQL Editor پنل Supabase کپی و Run کنید.
-- ==============================================================================

-- ۱. فعال‌سازی اکستنشن UUID
create extension if not exists "uuid-ossp";

-- ۲. ساخت جدول وضعیت زنده تایمر دونفره (Couple Live States)
-- با کلید ترکیبی (pair_code, role) تا شما و همسرتان بدون نیاز به ورود و ثبت‌نام پیچیده
-- با یک کد مشترک (مثلا KONKOOR-DUO یا کد دلخواهتان) تایمرهای زنده‌تان همگام شود.
create table if not exists public.couple_live_states (
  id uuid default gen_random_uuid() primary key,
  pair_code text not null default 'KONKOOR-DUO',
  role text not null check (role in ('husband', 'wife')),
  display_name text not null default '',
  is_studying boolean not null default false,
  subject text default 'bio',
  subject_name text default 'زیست‌شناسی',
  session_elapsed_seconds integer not null default 0,
  today_seconds integer not null default 0,
  today_tests integer not null default 0,
  study_day text not null default to_char(current_date, 'YYYY-MM-DD'),
  online boolean not null default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_couple_state unique (pair_code, role)
);

-- ایندکس برای جستجوی فوق‌سریع بر اساس کد دونفره
create index if not exists idx_couple_pair_role on public.couple_live_states(pair_code, role);

-- ۳. جدول ثبت جلسات و سوابق مطالعه (Sessions)
create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  pair_code text not null default 'KONKOOR-DUO',
  role text not null default 'husband',
  subject text not null,
  chapter text default '',
  seconds integer not null default 0,
  correct integer default 0,
  wrong integer default 0,
  blank integer default 0,
  note text default '',
  day text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_sessions_pair_day on public.sessions(pair_code, day);

-- ۴. فعال‌سازی قابلیت Realtime در Supabase برای همگام‌سازی آنی تایمر
alter publication supabase_realtime add table public.couple_live_states;

-- ۵. تنظیم دسترسی‌های عمومی و امن (Row Level Security)
-- فعال‌سازی RLS و صدور دسترسی خواندن/نوشتن برای کلاینت برنامه (anon key)
alter table public.couple_live_states enable row level security;
alter table public.sessions enable row level security;

-- حذف سیاست‌های قبلی در صورت وجود
drop policy if exists "Allow anon read couple_live_states" on public.couple_live_states;
drop policy if exists "Allow anon insert/update couple_live_states" on public.couple_live_states;
drop policy if exists "Allow anon read sessions" on public.sessions;
drop policy if exists "Allow anon insert sessions" on public.sessions;

-- اجازه مشاهده و دریافت تغییرات زنده برای همه دارندگان anon key
create policy "Allow anon read couple_live_states"
  on public.couple_live_states for select
  using (true);

-- اجازه ذخیره و بروزرسانی لحظه‌ای وضعیت تایمر
create policy "Allow anon insert/update couple_live_states"
  on public.couple_live_states for all
  using (true)
  with check (true);

create policy "Allow anon read sessions"
  on public.sessions for select
  using (true);

create policy "Allow anon insert sessions"
  on public.sessions for all
  using (true)
  with check (true);

-- ==============================================================================
-- پایان اسکریپت؛ با اجرای این کد، پایگاه‌داده کاملاً آماده تبادل زنده تایمرها می‌شود.
-- ==============================================================================
