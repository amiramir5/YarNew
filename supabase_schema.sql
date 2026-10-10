-- ==============================================================================
-- اسکریپت SQL جامع و کامل دیتابیس سوپابیس (Supabase) برای اپلیکیشن کنکور دو نفره
-- این کد را مستقیماً در پنل Supabase > بخش SQL Editor کپی کرده و Run کنید.
-- شامل جداول جلسات، آزمون‌ها، لایتنر، برنامه‌ها، یادداشت‌ها، پیشرفت، چت دو نفره و باکت‌های ذخیره‌سازی عکس
-- ==============================================================================

-- ۰. فعال‌سازی اکستنشن UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ۱. جدول وضعیت رقابت و مطالعه زنده دو نفره (Couple Live States)
CREATE TABLE IF NOT EXISTS public.couple_live_states (
  pair_code text NOT NULL,
  role text NOT NULL, -- 'husband' | 'wife'
  display_name text DEFAULT 'کاربر',
  email text,
  is_studying boolean DEFAULT false,
  subject text DEFAULT 'bio',
  subject_name text DEFAULT 'زیست‌شناسی',
  session_elapsed_seconds integer DEFAULT 0,
  today_seconds integer DEFAULT 0,
  today_tests integer DEFAULT 0,
  study_day text,
  online boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (pair_code, role)
);

-- ۲. جدول پارت‌ها و جلسات مطالعه (Sessions)
CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  subject text NOT NULL,
  chapter text,
  goftar text,
  seconds integer NOT NULL DEFAULT 0,
  correct integer DEFAULT 0,
  wrong integer DEFAULT 0,
  blank integer DEFAULT 0,
  note text DEFAULT '',
  day text NOT NULL, -- YYYY-MM-DD
  type text DEFAULT 'آموزش و مطالعه'
);

-- ۳. جدول کارنامه و آزمون‌ها (Exams)
CREATE TABLE IF NOT EXISTS public.exams (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  subject text NOT NULL,
  day text NOT NULL,
  correct integer DEFAULT 0,
  wrong integer DEFAULT 0,
  blank integer DEFAULT 0,
  duration integer DEFAULT 0,
  percent numeric DEFAULT 0,
  note text DEFAULT ''
);

-- ۴. جدول جعبه لایتنر و دفترچه اشتباهات (Mistakes & Question Images)
CREATE TABLE IF NOT EXISTS public.mistakes (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  subject text NOT NULL,
  chapter text,
  cause text NOT NULL,
  question text NOT NULL,
  source text,
  importance integer DEFAULT 3,
  image_data text, -- لینک مستقیم تصویر آپلود شده در استوریج یا base64
  box integer DEFAULT 1,
  next_review text NOT NULL,
  history jsonb DEFAULT '[]'::jsonb
);

-- ۵. جدول برنامه‌ریزی روزانه (Daily Plans)
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id text PRIMARY KEY,
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  day text NOT NULL,
  wake_time text DEFAULT '06:00',
  items jsonb DEFAULT '[]'::jsonb,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  device_id text DEFAULT 'client',
  deleted_at bigint
);

-- ۶. جدول یادداشت‌ها و فرمول‌های فوری (Quick Notes)
CREATE TABLE IF NOT EXISTS public.quick_notes (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  day text NOT NULL,
  text text NOT NULL,
  ts bigint NOT NULL
);

-- ۷. جدول تسلط و پیشرفت سرفصل‌های کتاب (Progress Entries)
CREATE TABLE IF NOT EXISTS public.progress_entries (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  day text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  note text DEFAULT ''
);

-- ۸. جدول نامه‌ها و پیام‌های انگیزشی دونفره (Couple Messages)
CREATE TABLE IF NOT EXISTS public.couple_messages (
  id text PRIMARY KEY,
  pair_code text DEFAULT 'KONKOOR-DUO',
  sender_role text NOT NULL, -- 'husband' | 'wife'
  sender_name text NOT NULL,
  sender_email text,
  message text NOT NULL,
  sticker text,
  created_at bigint NOT NULL,
  read boolean DEFAULT false
);

-- ۹. جدول تنظیمات کاربر، اهداف و کلیدهای هوش مصنوعی (User Settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  device_id text PRIMARY KEY,
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_email text,
  settings jsonb NOT NULL,
  updated_at bigint NOT NULL
);

-- ۱۰. ساخت باکت اختصاصی ذخیره‌سازی تصاویر در Supabase Storage (برای جلوگیری از پر شدن حافظه مرورگر)
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- ۱۰. سیاست دسترسی همگانی به آپلود و دانلود عکس‌ها در باکت question-images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Access for question-images' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Public Access for question-images" ON storage.objects
      FOR ALL
      USING (bucket_id = 'question-images')
      WITH CHECK (bucket_id = 'question-images');
  END IF;
END $$;

-- ۱۱. ساخت ایندکس‌های سریع برای کارایی بالا
CREATE INDEX IF NOT EXISTS idx_sessions_pair_code ON public.sessions(pair_code);
CREATE INDEX IF NOT EXISTS idx_sessions_day ON public.sessions(day);
CREATE INDEX IF NOT EXISTS idx_exams_pair_code ON public.exams(pair_code);
CREATE INDEX IF NOT EXISTS idx_mistakes_pair_code ON public.mistakes(pair_code);
CREATE INDEX IF NOT EXISTS idx_daily_plans_pair_code ON public.daily_plans(pair_code);
CREATE INDEX IF NOT EXISTS idx_couple_states_pair ON public.couple_live_states(pair_code);
CREATE INDEX IF NOT EXISTS idx_quick_notes_pair ON public.quick_notes(pair_code);
CREATE INDEX IF NOT EXISTS idx_progress_pair ON public.progress_entries(pair_code);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON public.couple_messages(pair_code);

-- ۱۲. فعال‌سازی امنیت سطح ردیف (Row Level Security - RLS)
ALTER TABLE public.couple_live_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- ایجاد دسترسی آزاد برای خواندن و نوشتن (Anon و Authenticated)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Couple States' AND tablename = 'couple_live_states') THEN
    CREATE POLICY "Public Access Couple States" ON public.couple_live_states FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access User Settings' AND tablename = 'user_settings') THEN
    CREATE POLICY "Public Access User Settings" ON public.user_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Sessions' AND tablename = 'sessions') THEN
    CREATE POLICY "Public Access Sessions" ON public.sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Exams' AND tablename = 'exams') THEN
    CREATE POLICY "Public Access Exams" ON public.exams FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Mistakes' AND tablename = 'mistakes') THEN
    CREATE POLICY "Public Access Mistakes" ON public.mistakes FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Plans' AND tablename = 'daily_plans') THEN
    CREATE POLICY "Public Access Plans" ON public.daily_plans FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Notes' AND tablename = 'quick_notes') THEN
    CREATE POLICY "Public Access Notes" ON public.quick_notes FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Progress' AND tablename = 'progress_entries') THEN
    CREATE POLICY "Public Access Progress" ON public.progress_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Messages' AND tablename = 'couple_messages') THEN
    CREATE POLICY "Public Access Messages" ON public.couple_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ۱۳. فعال‌سازی انتشار زنده Realtime برای جداول مورد نیاز
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.couple_live_states;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.couple_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
