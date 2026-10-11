-- ==============================================================================
-- اسکریپت SQL جامع و نسخه استاندارد دیتابیس سوپابیس (Supabase) برای اپلیکیشن کنکوریار ۲.۰
-- این اسکریپت در Supabase SQL Editor اجرا می‌شود.
-- شامل: RLS امن مبتنی بر auth.uid()، زوج‌ها و اعضا، حضور و تایمر زنده با server timestamp،
-- جداول پارت‌های مطالعه، آزمون‌ها، لایتنر، برنامه‌ها، استوریج امن و Realtime
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ۱. جدول زوج‌ها (Pairs)
CREATE TABLE IF NOT EXISTS public.pairs (
  pair_code text PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- جدول اعضای زوج (Pair Members)
CREATE TABLE IF NOT EXISTS public.pair_members (
  pair_code text NOT NULL REFERENCES public.pairs(pair_code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('husband', 'wife')),
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (pair_code, user_id)
);

-- ۲. جدول پروفایل کاربران (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text DEFAULT 'کاربر',
  role text DEFAULT 'husband' CHECK (role IN ('husband', 'wife')),
  pair_code text REFERENCES public.pairs(pair_code) ON DELETE SET NULL,
  avatar_url text,
  updated_at timestamp with time zone DEFAULT now()
);

-- تریگر خودکار فقط روی INSERT کاربران در Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  assigned_pair text;
  assigned_role text;
  user_name text;
BEGIN
  assigned_role := COALESCE(new.raw_user_meta_data->>'role', 'husband');
  user_name := COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  assigned_pair := COALESCE(new.raw_user_meta_data->>'pair_code', NULL);

  -- ساخت یا درج جفت اگر ارسال شده باشد
  IF assigned_pair IS NOT NULL AND assigned_pair <> '' THEN
    INSERT INTO public.pairs (pair_code, created_by)
    VALUES (assigned_pair, new.id)
    ON CONFLICT (pair_code) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, pair_code)
  VALUES (new.id, new.email, user_name, assigned_role, assigned_pair)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = now();

  IF assigned_pair IS NOT NULL AND assigned_pair <> '' THEN
    INSERT INTO public.pair_members (pair_code, user_id, role)
    VALUES (assigned_pair, new.id, assigned_role)
    ON CONFLICT (pair_code, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ۳. جدول وضعیت رقابت و تایمر زنده (Couple Live States)
CREATE TABLE IF NOT EXISTS public.couple_live_states (
  pair_code text NOT NULL,
  role text NOT NULL CHECK (role IN ('husband', 'wife')),
  display_name text DEFAULT 'کاربر',
  email text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_studying boolean DEFAULT false,
  subject text DEFAULT 'bio',
  subject_name text DEFAULT 'زیست‌شناسی',
  timer_started_at bigint,
  accumulated_seconds integer DEFAULT 0,
  session_elapsed_seconds integer DEFAULT 0,
  today_seconds integer DEFAULT 0,
  today_tests integer DEFAULT 0,
  study_day text,
  online boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (pair_code, role)
);


-- ۴. جدول پارت‌ها و جلسات مطالعه (Sessions)
CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  pair_code text,
  subject text NOT NULL,
  book text,
  chapter text,
  goftar text,
  seconds integer NOT NULL DEFAULT 0,
  correct integer DEFAULT 0,
  wrong integer DEFAULT 0,
  blank integer DEFAULT 0,
  note text DEFAULT '',
  day text NOT NULL,
  type text DEFAULT 'آموزش و مطالعه'
);


-- ۵. جدول کارنامه و آزمون‌ها (Exams)
CREATE TABLE IF NOT EXISTS public.exams (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  pair_code text,
  subject text NOT NULL,
  day text NOT NULL,
  correct integer DEFAULT 0,
  wrong integer DEFAULT 0,
  blank integer DEFAULT 0,
  duration integer DEFAULT 0,
  percent numeric(5, 2) DEFAULT 0,
  note text DEFAULT ''
);


-- ۶. جدول دفترچه اشتباهات و جعبه لایتنر (Mistakes)
CREATE TABLE IF NOT EXISTS public.mistakes (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  pair_code text,
  subject text NOT NULL,
  chapter text,
  cause text NOT NULL,
  question text NOT NULL,
  source text,
  importance integer DEFAULT 3,
  image_data text,
  box integer DEFAULT 1,
  next_review text NOT NULL,
  history jsonb DEFAULT '[]'::jsonb
);


-- ۷. جدول برنامه‌ریزی روزانه (Daily Plans)
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  user_email text,
  pair_code text,
  day text NOT NULL,
  target_hours numeric(4, 2) DEFAULT 8.0,
  target_tests integer DEFAULT 100,
  tasks jsonb DEFAULT '[]'::jsonb
);


-- ۸. جدول یادداشت‌های سریع (Quick Notes)
CREATE TABLE IF NOT EXISTS public.quick_notes (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  user_email text,
  pair_code text,
  title text NOT NULL,
  content text NOT NULL,
  color text DEFAULT 'blue'
);


-- ۹. جدول ثبت پیشرفت مباحث دروس (Progress Entries)
CREATE TABLE IF NOT EXISTS public.progress_entries (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  user_email text,
  pair_code text,
  subject text NOT NULL,
  chapter text NOT NULL,
  status text DEFAULT 'not_started',
  confidence integer DEFAULT 0
);


-- ۱۰. جدول چک‌لیست روزانه (Daily Checklists)
CREATE TABLE IF NOT EXISTS public.user_checklists (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  user_email text,
  pair_code text,
  day text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb
);


-- ۱۱. جدول تنظیمات کاربر (User Settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  pair_code text,
  user_email text,
  settings jsonb NOT NULL,
  updated_at bigint NOT NULL
);


-- ۱۲. جدول پیام‌های انگیزشی زوج (Couple Messages)
CREATE TABLE IF NOT EXISTS public.couple_messages (
  id text PRIMARY KEY,
  pair_code text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('husband', 'wife')),
  sender_name text NOT NULL,
  sender_email text,
  message text NOT NULL,
  sticker text,
  created_at bigint NOT NULL,
  read boolean DEFAULT false
);


-- ۱۳. باکت تصاویر سوالات (Private Storage با امضای امن)
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'User Folder Storage Access' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "User Folder Storage Access" ON storage.objects
      FOR ALL
      USING (
        bucket_id = 'question-images' AND
        (auth.role() = 'authenticated') AND
        (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'question-images' AND
        (auth.role() = 'authenticated') AND
        (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;


-- ۱۴. ایندکس‌های بهینه‌سازی کوئری‌ها
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_day ON public.sessions(day);
CREATE INDEX IF NOT EXISTS idx_sessions_pair ON public.sessions(pair_code);
CREATE INDEX IF NOT EXISTS idx_exams_user ON public.exams(user_id);
CREATE INDEX IF NOT EXISTS idx_exams_day ON public.exams(day);
CREATE INDEX IF NOT EXISTS idx_mistakes_user ON public.mistakes(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_plans_user ON public.daily_plans(user_id, day);
CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON public.quick_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_user ON public.progress_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_couple_states_pair ON public.couple_live_states(pair_code);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON public.couple_messages(pair_code);


-- ۱۵. فعال‌سازی RLS و سیاست‌های امنیتی دسترسی
ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pair_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_live_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_messages ENABLE ROW LEVEL SECURITY;

-- تابع کمکی برای بررسی عضویت در جفت
CREATE OR REPLACE FUNCTION public.is_pair_member(target_pair text)
RETURNS boolean AS $$
BEGIN
  IF target_pair IS NULL OR target_pair = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.pair_members pm
    WHERE pm.pair_code = target_pair AND pm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.pair_code = target_pair
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- توابع سیاست‌ها
DO $$
BEGIN
  -- Profiles: هر کاربر خودش را ببیند و شریک زوجش را
  DROP POLICY IF EXISTS "Profiles Self and Partner" ON public.profiles;
  CREATE POLICY "Profiles Self and Partner" ON public.profiles
    FOR SELECT USING (
      auth.uid() = id OR public.is_pair_member(pair_code)
    );
  DROP POLICY IF EXISTS "Profiles Update Self" ON public.profiles;
  CREATE POLICY "Profiles Update Self" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

  -- Pairs & Pair Members
  DROP POLICY IF EXISTS "Pairs Access" ON public.pairs;
  CREATE POLICY "Pairs Access" ON public.pairs
    FOR ALL USING (public.is_pair_member(pair_code) OR auth.uid() = created_by);

  DROP POLICY IF EXISTS "Pair Members Access" ON public.pair_members;
  CREATE POLICY "Pair Members Access" ON public.pair_members
    FOR ALL USING (public.is_pair_member(pair_code) OR auth.uid() = user_id);

  -- Couple Live States: مشاهده برای اعضای زوج، ویرایش برای خود کاربر
  DROP POLICY IF EXISTS "Couple States Read" ON public.couple_live_states;
  CREATE POLICY "Couple States Read" ON public.couple_live_states
    FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = user_id);

  DROP POLICY IF EXISTS "Couple States Write" ON public.couple_live_states;
  CREATE POLICY "Couple States Write" ON public.couple_live_states
    FOR ALL USING (auth.uid() = user_id OR public.is_pair_member(pair_code))
    WITH CHECK (auth.uid() = user_id OR public.is_pair_member(pair_code));

  -- Sessions: خواندن خود کاربر و شریک، نوشتن خود کاربر
  DROP POLICY IF EXISTS "Sessions Read" ON public.sessions;
  CREATE POLICY "Sessions Read" ON public.sessions
    FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

  DROP POLICY IF EXISTS "Sessions Write" ON public.sessions;
  CREATE POLICY "Sessions Write" ON public.sessions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Exams: خواندن خود و شریک، نوشتن خود کاربر
  DROP POLICY IF EXISTS "Exams Read" ON public.exams;
  CREATE POLICY "Exams Read" ON public.exams
    FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

  DROP POLICY IF EXISTS "Exams Write" ON public.exams;
  CREATE POLICY "Exams Write" ON public.exams
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Mistakes
  DROP POLICY IF EXISTS "Mistakes Self" ON public.mistakes;
  CREATE POLICY "Mistakes Self" ON public.mistakes
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Plans
  DROP POLICY IF EXISTS "Plans Access" ON public.daily_plans;
  CREATE POLICY "Plans Access" ON public.daily_plans
    FOR ALL USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)))
    WITH CHECK (auth.uid() = user_id);

  -- Quick Notes
  DROP POLICY IF EXISTS "Notes Self" ON public.quick_notes;
  CREATE POLICY "Notes Self" ON public.quick_notes
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Progress
  DROP POLICY IF EXISTS "Progress Self" ON public.progress_entries;
  CREATE POLICY "Progress Self" ON public.progress_entries
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Checklists
  DROP POLICY IF EXISTS "Checklists Self" ON public.user_checklists;
  CREATE POLICY "Checklists Self" ON public.user_checklists
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- User Settings
  DROP POLICY IF EXISTS "Settings Self" ON public.user_settings;
  CREATE POLICY "Settings Self" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Couple Messages
  DROP POLICY IF EXISTS "Messages Pair" ON public.couple_messages;
  CREATE POLICY "Messages Pair" ON public.couple_messages
    FOR ALL USING (public.is_pair_member(pair_code))
    WITH CHECK (public.is_pair_member(pair_code) AND auth.uid() = user_id);
END $$;


-- ۱۶. فعال‌سازی انتشار زنده Realtime
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
