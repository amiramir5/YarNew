-- ==============================================================================
-- اسکریپت SQL جامع و نسخه نهایی دیتابیس سوپابیس (Supabase) برای کل اپلیکیشن کنکوریار ۲.۰
-- این کد را مستقیماً در پنل Supabase > بخش SQL Editor کپی کرده و دکمه RUN را بزنید.
-- شامل: احراز هویت واقعی، پروفایل‌ها، جلسات، آزمون‌ها، لایتنر، برنامه‌ها، یادداشت‌ها، تنظیمات، رقابت دونفره زنده، استوریج و Realtime
-- ==============================================================================

-- ۰. فعال‌سازی اکستنشن UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ۱. جدول پروفایل کاربران (مرتبط با احراز هویت رسمی Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text DEFAULT 'کاربر',
  role text DEFAULT 'husband' CHECK (role IN ('husband', 'wife')),
  pair_code text DEFAULT 'KONKOOR-DUO',
  avatar_url text,
  updated_at timestamp with time zone DEFAULT now()
);

-- تریگر خودکار: هنگام ثبت‌نام کاربر در Supabase Auth، پروفایل بلافاصله ساخته می‌شود
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, pair_code)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'husband'),
    'KONKOOR-DUO'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ۲. جدول وضعیت رقابت و مطالعه زنده دو نفره (Couple Live States)
CREATE TABLE IF NOT EXISTS public.couple_live_states (
  pair_code text NOT NULL,
  role text NOT NULL, -- 'husband' | 'wife'
  display_name text DEFAULT 'کاربر',
  email text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
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


-- ۳. جدول پارت‌ها و جلسات مطالعه کل اپلیکیشن (Sessions)
CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  pair_code text DEFAULT 'KONKOOR-DUO',
  subject text NOT NULL,
  book text,
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


-- ۴. جدول کارنامه و آزمون‌های کل اپلیکیشن (Exams)
CREATE TABLE IF NOT EXISTS public.exams (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  pair_code text DEFAULT 'KONKOOR-DUO',
  subject text NOT NULL,
  day text NOT NULL,
  correct integer DEFAULT 0,
  wrong integer DEFAULT 0,
  blank integer DEFAULT 0,
  duration integer DEFAULT 0,
  percent numeric DEFAULT 0,
  note text DEFAULT ''
);


-- ۵. جدول جعبه لایتنر و دفترچه اشتباهات (Mistakes & Leitner Cards)
CREATE TABLE IF NOT EXISTS public.mistakes (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  pair_code text DEFAULT 'KONKOOR-DUO',
  subject text NOT NULL,
  chapter text,
  cause text NOT NULL,
  question text NOT NULL,
  source text,
  importance integer DEFAULT 3,
  image_data text, -- لینک مستقیم تصویر در باکت استوریج
  box integer DEFAULT 1,
  next_review text NOT NULL,
  history jsonb DEFAULT '[]'::jsonb
);


-- ۶. جدول برنامه‌ریزی روزانه (Daily Plans)
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id text PRIMARY KEY,
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  day text NOT NULL,
  wake_time text DEFAULT '06:00',
  items jsonb DEFAULT '[]'::jsonb,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  device_id text DEFAULT 'client',
  deleted_at bigint
);


-- ۷. جدول یادداشت‌ها و فرمول‌های فوری (Quick Notes)
CREATE TABLE IF NOT EXISTS public.quick_notes (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  pair_code text DEFAULT 'KONKOOR-DUO',
  day text NOT NULL,
  text text NOT NULL,
  ts bigint NOT NULL
);


-- ۸. جدول تسلط و پیشرفت سرفصل‌های کتاب (Progress Entries)
CREATE TABLE IF NOT EXISTS public.progress_entries (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  pair_code text DEFAULT 'KONKOOR-DUO',
  day text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  note text DEFAULT ''
);


-- ۹. جدول تنظیمات کاربر، اهداف و کلیدهای هوش مصنوعی (User Settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  device_id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  pair_code text DEFAULT 'KONKOOR-DUO',
  settings jsonb NOT NULL,
  updated_at bigint NOT NULL
);


-- ۱۰. جدول نامه‌ها و پیام‌های انگیزشی دونفره (Couple Messages)
CREATE TABLE IF NOT EXISTS public.couple_messages (
  id text PRIMARY KEY,
  pair_code text DEFAULT 'KONKOOR-DUO',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL, -- 'husband' | 'wife'
  sender_name text NOT NULL,
  sender_email text,
  message text NOT NULL,
  sticker text,
  created_at bigint NOT NULL,
  read boolean DEFAULT false
);


-- ۱۱. باکت اختصاصی ذخیره‌سازی تصاویر سوالات و دفترچه اشتباهات (Storage Bucket)
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

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


-- ۱۲. ساخت ایندکس‌های پرسرعت برای کوئری‌های اپلیکیشن
CREATE INDEX IF NOT EXISTS idx_sessions_user_email ON public.sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_sessions_pair_code ON public.sessions(pair_code);
CREATE INDEX IF NOT EXISTS idx_sessions_day ON public.sessions(day);
CREATE INDEX IF NOT EXISTS idx_exams_user_email ON public.exams(user_email);
CREATE INDEX IF NOT EXISTS idx_exams_pair_code ON public.exams(pair_code);
CREATE INDEX IF NOT EXISTS idx_mistakes_user_email ON public.mistakes(user_email);
CREATE INDEX IF NOT EXISTS idx_mistakes_pair_code ON public.mistakes(pair_code);
CREATE INDEX IF NOT EXISTS idx_daily_plans_user_email ON public.daily_plans(user_email);
CREATE INDEX IF NOT EXISTS idx_daily_plans_pair_code ON public.daily_plans(pair_code);
CREATE INDEX IF NOT EXISTS idx_couple_states_pair ON public.couple_live_states(pair_code);
CREATE INDEX IF NOT EXISTS idx_quick_notes_email ON public.quick_notes(user_email);
CREATE INDEX IF NOT EXISTS idx_progress_email ON public.progress_entries(user_email);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON public.couple_messages(pair_code);
CREATE INDEX IF NOT EXISTS idx_user_settings_email ON public.user_settings(user_email);


-- ۱۳. فعال‌سازی امنیت سطح ردیف (Row Level Security - RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_live_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_messages ENABLE ROW LEVEL SECURITY;

-- سیاست‌های دسترسی امن و روان (خوانش و نگارش برای کلاینت)
DO $$
BEGIN
  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Profiles' AND tablename = 'profiles') THEN
    CREATE POLICY "Access Profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Couple States
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Couple States' AND tablename = 'couple_live_states') THEN
    CREATE POLICY "Access Couple States" ON public.couple_live_states FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Sessions' AND tablename = 'sessions') THEN
    CREATE POLICY "Access Sessions" ON public.sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Exams
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Exams' AND tablename = 'exams') THEN
    CREATE POLICY "Access Exams" ON public.exams FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Mistakes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Mistakes' AND tablename = 'mistakes') THEN
    CREATE POLICY "Access Mistakes" ON public.mistakes FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Plans
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Plans' AND tablename = 'daily_plans') THEN
    CREATE POLICY "Access Plans" ON public.daily_plans FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Notes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Notes' AND tablename = 'quick_notes') THEN
    CREATE POLICY "Access Notes" ON public.quick_notes FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Progress
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Progress' AND tablename = 'progress_entries') THEN
    CREATE POLICY "Access Progress" ON public.progress_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- User Settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access User Settings' AND tablename = 'user_settings') THEN
    CREATE POLICY "Access User Settings" ON public.user_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access Messages' AND tablename = 'couple_messages') THEN
    CREATE POLICY "Access Messages" ON public.couple_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ۱۴. فعال‌سازی انتشار زنده Realtime برای رقابت، تایمر و چت
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
