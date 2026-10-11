-- ==============================================================================
-- اسکریپت SQL جامع، بهینه‌سازی‌شده و ایمن برای اپلیکیشن کنکوریار ۲.۰
-- این اسکریپت کاملاً Idempotent است و هم روی دیتابیس‌های موجود و هم دیتابیس جدید با موفقیت اجرا می‌شود.
-- شامل:
-- ۱. پاکسازی کامل کلیه Policyهای قدیمی و permissive (از جمله USING(true))
-- ۲. سیستم جفت‌سازی امن دونفره بر مبنای توابع RPC رمزنگاری‌شده (create_pair, join_pair, leave_pair)
-- ۳. کدهای دعوت یک‌بارمصرف با انقضای ۴۸ ساعته و محدودیت اکید حداکثر ۲ عضو در هر اتاق
-- ۴. تطابق ۱۰۰٪ ستون‌ها با کلاینت (daily_plans, quick_notes, progress_entries, sessions)
-- ۵. RLS اختصاصی با تفکیک کامل دسترسی زوجین و جلوگیری از رونویسی غیرمجاز وضعیت شریک
-- ۶. باکت اختصاصی Storage خصوصی با دسترسی فقط براساس شناسه کاربر
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- گام ۱: حذف Policyهای قدیمی و ناامن برای بستن کامل رخنه‌های امنیتی
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- حذف پالیسی‌های آسیب‌پذیر اولیه
  DROP POLICY IF EXISTS "Access Profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Access Couple States" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Access Sessions" ON public.sessions;
  DROP POLICY IF EXISTS "Access Exams" ON public.exams;
  DROP POLICY IF EXISTS "Access Mistakes" ON public.mistakes;
  DROP POLICY IF EXISTS "Access Plans" ON public.daily_plans;
  DROP POLICY IF EXISTS "Access Notes" ON public.quick_notes;
  DROP POLICY IF EXISTS "Access Progress" ON public.progress_entries;
  DROP POLICY IF EXISTS "Access User Settings" ON public.user_settings;
  DROP POLICY IF EXISTS "Access Messages" ON public.couple_messages;
  DROP POLICY IF EXISTS "Public Couple" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Public Sessions" ON public.sessions;
  DROP POLICY IF EXISTS "Public Exams" ON public.exams;
  DROP POLICY IF EXISTS "Public Mistakes" ON public.mistakes;
  DROP POLICY IF EXISTS "Public Plans" ON public.daily_plans;
  DROP POLICY IF EXISTS "Public Access for question-images" ON storage.objects;

  -- حذف پالیسی‌های تکراری نسخه قبلی جهت بازتعریف بدون تداخل
  DROP POLICY IF EXISTS "Profiles Read" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles Update" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles Self and Partner" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles Update Self" ON public.profiles;
  DROP POLICY IF EXISTS "Pairs Read" ON public.pairs;
  DROP POLICY IF EXISTS "Pairs Access" ON public.pairs;
  DROP POLICY IF EXISTS "Pair Members Read" ON public.pair_members;
  DROP POLICY IF EXISTS "Pair Members Access" ON public.pair_members;
  DROP POLICY IF EXISTS "Couple States Read" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Couple States Write" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Couple States Insert" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Couple States Update" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Couple States Delete" ON public.couple_live_states;
  DROP POLICY IF EXISTS "Sessions Read" ON public.sessions;
  DROP POLICY IF EXISTS "Sessions Write" ON public.sessions;
  DROP POLICY IF EXISTS "Exams Read" ON public.exams;
  DROP POLICY IF EXISTS "Exams Write" ON public.exams;
  DROP POLICY IF EXISTS "Mistakes Self" ON public.mistakes;
  DROP POLICY IF EXISTS "Plans Read" ON public.daily_plans;
  DROP POLICY IF EXISTS "Plans Write" ON public.daily_plans;
  DROP POLICY IF EXISTS "Plans Access" ON public.daily_plans;
  DROP POLICY IF EXISTS "Notes Self" ON public.quick_notes;
  DROP POLICY IF EXISTS "Progress Self" ON public.progress_entries;
  DROP POLICY IF EXISTS "Checklists Self" ON public.user_checklists;
  DROP POLICY IF EXISTS "Settings Self" ON public.user_settings;
  DROP POLICY IF EXISTS "Messages Read" ON public.couple_messages;
  DROP POLICY IF EXISTS "Messages Insert" ON public.couple_messages;
  DROP POLICY IF EXISTS "Messages Pair" ON public.couple_messages;
  DROP POLICY IF EXISTS "User Folder Storage Access" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ------------------------------------------------------------------------------
-- گام ۲: ساخت و به‌روزرسانی جداول با ستون‌های دقیق و تطبیق‌یافته
-- ------------------------------------------------------------------------------

-- جدول اتاق‌های زوج (Pairs)
CREATE TABLE IF NOT EXISTS public.pairs (
  pair_code text PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code text UNIQUE,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.pairs ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;
ALTER TABLE public.pairs ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + interval '48 hours');

-- جدول اعضای زوج (Pair Members)
CREATE TABLE IF NOT EXISTS public.pair_members (
  pair_code text NOT NULL REFERENCES public.pairs(pair_code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('husband', 'wife')),
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (pair_code, user_id)
);

-- جدول پروفایل‌ها (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text DEFAULT 'کاربر',
  role text DEFAULT 'husband' CHECK (role IN ('husband', 'wife')),
  pair_code text REFERENCES public.pairs(pair_code) ON DELETE SET NULL,
  avatar_url text,
  updated_at timestamp with time zone DEFAULT now()
);

-- جدول وضعیت زنده تایمر و رقابت (Couple Live States)
CREATE TABLE IF NOT EXISTS public.couple_live_states (
  pair_code text NOT NULL REFERENCES public.pairs(pair_code) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('husband', 'wife')),
  display_name text DEFAULT 'کاربر',
  email text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

ALTER TABLE public.couple_live_states ADD COLUMN IF NOT EXISTS timer_started_at bigint;
ALTER TABLE public.couple_live_states ADD COLUMN IF NOT EXISTS accumulated_seconds integer DEFAULT 0;

-- جدول جلسات مطالعه (Sessions)
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

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS book text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS goftar text;

-- جدول آزمون‌ها و کارنامه‌ها (Exams)
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
  title text NOT NULL,
  total_questions integer NOT NULL DEFAULT 0,
  correct integer NOT NULL DEFAULT 0,
  wrong integer NOT NULL DEFAULT 0,
  blank integer NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  duration_minutes integer DEFAULT 0,
  day text NOT NULL,
  note text DEFAULT ''
);

-- جدول تحلیل اشتباهات آزمون و تست (Mistakes / Leitner Box)
CREATE TABLE IF NOT EXISTS public.mistakes (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  subject text NOT NULL,
  question_number text DEFAULT '',
  topic text NOT NULL,
  reason text NOT NULL,
  custom_reason text DEFAULT '',
  lesson text NOT NULL,
  importance text DEFAULT 'medium',
  leitner_box integer DEFAULT 1,
  leitner_next_review_day text NOT NULL,
  leitner_review_history jsonb DEFAULT '[]'::jsonb,
  image_url text,
  day text NOT NULL
);

-- جدول برنامه‌ریزی روزانه (Daily Plans) - تطبیق کامل با کد کلاینت
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  pair_code text,
  day text NOT NULL,
  wake_time text DEFAULT '06:00',
  items jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS wake_time text DEFAULT '06:00';
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS device_id text DEFAULT 'client';

-- جدول یادداشت‌های سریع (Quick Notes) - تطبیق کامل با کد کلاینت
CREATE TABLE IF NOT EXISTS public.quick_notes (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  pair_code text,
  day text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  ts bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS day text DEFAULT '';
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS text text DEFAULT '';
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS ts bigint DEFAULT 0;
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS device_id text DEFAULT 'client';

-- جدول ثبت پیشرفت مباحث دروس (Progress Entries) - تطبیق کامل با کد کلاینت
CREATE TABLE IF NOT EXISTS public.progress_entries (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  device_id text DEFAULT 'client',
  user_email text,
  pair_code text,
  day text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  chapter text NOT NULL DEFAULT '',
  note text DEFAULT ''
);

ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS day text DEFAULT '';
ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS device_id text DEFAULT 'client';

-- جدول چک‌لیست‌های روزانه (User Checklists)
CREATE TABLE IF NOT EXISTS public.user_checklists (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  user_email text,
  pair_code text,
  day text NOT NULL,
  items jsonb DEFAULT '{}'::jsonb
);

-- جدول تنظیمات کاربر (User Settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  pair_code text,
  user_email text,
  settings jsonb NOT NULL,
  updated_at bigint NOT NULL
);

-- جدول پیام‌های دونفره (Couple Messages)
CREATE TABLE IF NOT EXISTS public.couple_messages (
  id text PRIMARY KEY,
  pair_code text NOT NULL REFERENCES public.pairs(pair_code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('husband', 'wife')),
  sender_name text NOT NULL,
  sender_email text,
  message text NOT NULL,
  sticker text,
  created_at bigint NOT NULL,
  read boolean DEFAULT false
);


-- ------------------------------------------------------------------------------
-- گام ۳: توابع کمکی امن، تریگرهای سرور و RPCهای رمزنگاری‌شده جفت‌سازی
-- ------------------------------------------------------------------------------

-- تابع بررسی عضویت واقعی در جفت (صرفاً از جدول امن pair_members، بدون تکیه بر profiles)
CREATE OR REPLACE FUNCTION public.is_pair_member(target_pair text)
RETURNS boolean AS $$
BEGIN
  IF target_pair IS NULL OR target_pair = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.pair_members pm
    WHERE pm.pair_code = target_pair AND pm.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- تریگر به‌روزرسانی دقیق updated_at بر اساس ساعت سرور
CREATE OR REPLACE FUNCTION public.set_server_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_couple_live_states_updated_at ON public.couple_live_states;
CREATE TRIGGER trg_couple_live_states_updated_at
  BEFORE INSERT OR UPDATE ON public.couple_live_states
  FOR EACH ROW EXECUTE PROCEDURE public.set_server_updated_at();

-- تریگر خودکار فقط روی INSERT کاربر جدید در Auth (بدون پذیرش pair_code آزاد از متادیتا)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_name text;
BEGIN
  user_name := COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  INSERT INTO public.profiles (id, email, full_name, role, pair_code)
  VALUES (new.id, new.email, user_name, 'husband', NULL)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = now();

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- قفل کردن فیلدهای pair_code و role در جدول profiles در برابر UPDATE مستقیم کلاینت
CREATE OR REPLACE FUNCTION public.protect_profile_pair_code()
RETURNS trigger AS $$
BEGIN
  -- اگر توسط تابع معمولی کلاینت صدا زده شد، pair_code یا role تغییر نکند مگر از طریق RPC مجاز
  IF current_setting('konkoor.internal_pair_update', true) IS DISTINCT FROM 'true' THEN
    IF NEW.pair_code IS DISTINCT FROM OLD.pair_code THEN
      RAISE EXCEPTION 'تغییر اتاق دونفره فقط از طریق دعوتنامه و RPC امکان‌پذیر است.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'تغییر نقش فقط از طریق سیستم مدیریت اتاق دونفره امکان‌پذیر است.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profile_pair_code ON public.profiles;
CREATE TRIGGER trg_protect_profile_pair_code
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_pair_code();

-- RPC ساخت اتاق جدید دونفره با تولید کد دعوت رمزنگاری‌شده و انقضای ۴۸ ساعته
CREATE OR REPLACE FUNCTION public.create_pair()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_pair_code text;
  v_invite_code text;
  v_expires_at timestamptz;
  v_current_pair text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'برای ساخت اتاق باید وارد حساب خود شوید.';
  END IF;

  -- بررسی اینکه کاربر قبلاً در اتاق دیگری عضو نباشد
  SELECT pair_code INTO v_current_pair
  FROM public.pair_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_current_pair IS NOT NULL THEN
    RAISE EXCEPTION 'شما قبلاً در یک اتاق عضو هستید. برای ساخت اتاق جدید، ابتدا از اتاق فعلی خارج شوید.';
  END IF;

  -- تولید کد جفت‌سازی تصادفی ۸ کاراکتری با امنیت رمزنگاری (gen_random_bytes)
  v_pair_code := 'KY-' || upper(encode(gen_random_bytes(4), 'hex'));
  v_invite_code := 'INV-' || upper(encode(gen_random_bytes(4), 'hex'));
  v_expires_at := now() + interval '48 hours';

  -- درج اتاق در جدول pairs
  INSERT INTO public.pairs (pair_code, created_by, invite_code, expires_at)
  VALUES (v_pair_code, v_user_id, v_invite_code, v_expires_at);

  -- درج سازنده در pair_members به عنوان husband
  INSERT INTO public.pair_members (pair_code, user_id, role)
  VALUES (v_pair_code, v_user_id, 'husband')
  ON CONFLICT (pair_code, user_id) DO UPDATE SET role = 'husband';

  -- به‌روزرسانی پروفایل کاربر در محیط امن با مجورز سیستمی
  PERFORM set_config('konkoor.internal_pair_update', 'true', true);
  UPDATE public.profiles
  SET pair_code = v_pair_code, role = 'husband', updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'pair_code', v_pair_code,
    'invite_code', v_invite_code,
    'role', 'husband',
    'expires_at', v_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC پیوستن همسر به اتاق از طریق کد دعوت یکبارمصرف و محدودیت حداکثر ۲ نفر
CREATE OR REPLACE FUNCTION public.join_pair(p_invite_code text)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_pair record;
  v_count integer;
  v_assigned_role text;
  v_current_pair text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'برای پیوستن به اتاق باید ابتدا وارد حساب کاربری شوید.';
  END IF;

  -- بررسی اینکه کاربر قبلاً در اتاق دیگری عضو نباشد
  SELECT pair_code INTO v_current_pair
  FROM public.pair_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_current_pair IS NOT NULL THEN
    RAISE EXCEPTION 'شما هم‌اکنون در اتاق عضو هستید. ابتدا از اتاق فعلی خارج شوید.';
  END IF;

  p_invite_code := upper(trim(p_invite_code));

  SELECT * INTO v_pair
  FROM public.pairs
  WHERE upper(trim(invite_code)) = p_invite_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'کد دعوت نامعتبر است یا وجود ندارد.';
  END IF;

  IF v_pair.expires_at < now() THEN
    RAISE EXCEPTION 'مهلت استفاده از این کد دعوت منقضی شده است (اعتبار ۴۸ ساعت).';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.pair_members
  WHERE pair_code = v_pair.pair_code;

  IF v_count >= 2 THEN
    RAISE EXCEPTION 'ظرفیت این اتاق تکمیل است (حداکثر ۲ نفر مجاز است).';
  END IF;

  -- بررسی اینکه نقش عضو اول چیست و نقش مکمل به نفر دوم داده شود
  IF EXISTS (SELECT 1 FROM public.pair_members WHERE pair_code = v_pair.pair_code AND role = 'husband') THEN
    v_assigned_role := 'wife';
  ELSE
    v_assigned_role := 'husband';
  END IF;

  INSERT INTO public.pair_members (pair_code, user_id, role)
  VALUES (v_pair.pair_code, v_user_id, v_assigned_role)
  ON CONFLICT (pair_code, user_id) DO UPDATE SET role = v_assigned_role;

  -- باطل کردن کد دعوت بعد از پیوستن موفق نفر دوم (یک‌بارمصرف واقعی)
  UPDATE public.pairs
  SET expires_at = now()
  WHERE pair_code = v_pair.pair_code;

  PERFORM set_config('konkoor.internal_pair_update', 'true', true);
  UPDATE public.profiles
  SET pair_code = v_pair.pair_code, role = v_assigned_role, updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'pair_code', v_pair.pair_code,
    'role', v_assigned_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC خروج از اتاق دونفره (Leave Pair)
CREATE OR REPLACE FUNCTION public.leave_pair()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_pair_code text;
  v_remaining_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ابتدا وارد حساب کاربری خود شوید.';
  END IF;

  SELECT pair_code INTO v_pair_code
  FROM public.pair_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_pair_code IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'کاربر در هیچ اتاقی عضو نبود.');
  END IF;

  -- حذف عضویت از جدول اعضا
  DELETE FROM public.pair_members
  WHERE pair_code = v_pair_code AND user_id = v_user_id;

  -- حذف وضعیت زنده تایمر کاربر در این اتاق
  DELETE FROM public.couple_live_states
  WHERE pair_code = v_pair_code AND user_id = v_user_id;

  -- خروج در پروفایل کاربر
  PERFORM set_config('konkoor.internal_pair_update', 'true', true);
  UPDATE public.profiles
  SET pair_code = NULL, updated_at = now()
  WHERE id = v_user_id;

  -- اگر اتاقی بدون عضو شد، پاک شود
  SELECT count(*) INTO v_remaining_count
  FROM public.pair_members
  WHERE pair_code = v_pair_code;

  IF v_remaining_count = 0 THEN
    DELETE FROM public.pairs WHERE pair_code = v_pair_code;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pair_code', v_pair_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC دریافت وضعیت اتاق و اطلاعات شریک (Get Pair Status)
CREATE OR REPLACE FUNCTION public.get_my_pair_status()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_pair_code text;
  v_role text;
  v_invite_code text;
  v_expires_at timestamptz;
  v_member_count integer;
  v_partner_name text;
  v_partner_email text;
  v_partner_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('in_pair', false);
  END IF;

  SELECT pm.pair_code, pm.role INTO v_pair_code, v_role
  FROM public.pair_members pm
  WHERE pm.user_id = v_user_id
  LIMIT 1;

  IF v_pair_code IS NULL THEN
    RETURN jsonb_build_object('in_pair', false);
  END IF;

  -- دریافت اطلاعات اتاق
  SELECT p.invite_code, p.expires_at INTO v_invite_code, v_expires_at
  FROM public.pairs p
  WHERE p.pair_code = v_pair_code;

  -- تعداد اعضا
  SELECT count(*) INTO v_member_count
  FROM public.pair_members
  WHERE pair_code = v_pair_code;

  -- پارتنر در صورت وجود
  SELECT pm.user_id INTO v_partner_id
  FROM public.pair_members pm
  WHERE pm.pair_code = v_pair_code AND pm.user_id <> v_user_id
  LIMIT 1;

  IF v_partner_id IS NOT NULL THEN
    SELECT p.full_name, p.email INTO v_partner_name, v_partner_email
    FROM public.profiles p
    WHERE p.id = v_partner_id;
  END IF;

  RETURN jsonb_build_object(
    'in_pair', true,
    'pair_code', v_pair_code,
    'role', v_role,
    'invite_code', CASE WHEN v_member_count < 2 AND v_expires_at > now() THEN v_invite_code ELSE NULL END,
    'expires_at', v_expires_at,
    'member_count', v_member_count,
    'partner_name', v_partner_name,
    'partner_email', v_partner_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- گام ۴: اعمال RLS دقیق و تفکیک‌شده بر اساس هویت کاربر
-- ------------------------------------------------------------------------------

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

-- Profiles (خواندن خود یا شریک تاییدشده، ویرایش فقط توسط خود کاربر)
CREATE POLICY "Profiles Read" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_pair_member(pair_code));

CREATE POLICY "Profiles Update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Pairs (فقط خواندن برای اعضا یا سازنده؛ درج/ویرایش فقط با RPCهای امن)
CREATE POLICY "Pairs Read" ON public.pairs
  FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = created_by);

-- Pair Members (فقط SELECT؛ کلیه تغییرات عضویت منحصراً از طریق RPCهای امن انجام می‌شود)
CREATE POLICY "Pair Members Read" ON public.pair_members
  FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = user_id);

-- Couple Live States (تفکیک دقیق خواندن هر دو، درج و ویرایش منحصراً سطر خود با تطابق نقش در pair_members)
CREATE POLICY "Couple States Read" ON public.couple_live_states
  FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = user_id);

CREATE POLICY "Couple States Insert" ON public.couple_live_states
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_pair_member(pair_code)
    AND EXISTS (
      SELECT 1 FROM public.pair_members pm
      WHERE pm.pair_code = couple_live_states.pair_code
        AND pm.user_id = auth.uid()
        AND pm.role = couple_live_states.role
    )
  );

CREATE POLICY "Couple States Update" ON public.couple_live_states
  FOR UPDATE USING (
    auth.uid() = user_id
    AND public.is_pair_member(pair_code)
  ) WITH CHECK (
    auth.uid() = user_id
    AND public.is_pair_member(pair_code)
    AND EXISTS (
      SELECT 1 FROM public.pair_members pm
      WHERE pm.pair_code = couple_live_states.pair_code
        AND pm.user_id = auth.uid()
        AND pm.role = couple_live_states.role
    )
  );

CREATE POLICY "Couple States Delete" ON public.couple_live_states
  FOR DELETE USING (auth.uid() = user_id);

-- Sessions (خواندن توسط خود یا شریک جفت‌شده؛ درج/ویرایش/حذف فقط خود کاربر)
CREATE POLICY "Sessions Read" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

CREATE POLICY "Sessions Write" ON public.sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Exams (خواندن توسط خود یا شریک جفت‌شده؛ درج/ویرایش/حذف فقط خود کاربر)
CREATE POLICY "Exams Read" ON public.exams
  FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

CREATE POLICY "Exams Write" ON public.exams
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Mistakes (شخصی و کاملاً ایزوله برای خود کاربر)
CREATE POLICY "Mistakes Self" ON public.mistakes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Daily Plans (خواندن توسط خود یا شریک؛ درج/ویرایش فقط خود کاربر)
CREATE POLICY "Plans Read" ON public.daily_plans
  FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

CREATE POLICY "Plans Write" ON public.daily_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quick Notes (شخصی برای خود کاربر)
CREATE POLICY "Notes Self" ON public.quick_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Progress Entries (شخصی برای خود کاربر)
CREATE POLICY "Progress Self" ON public.progress_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Checklists (شخصی برای خود کاربر)
CREATE POLICY "Checklists Self" ON public.user_checklists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Settings (شخصی برای خود کاربر - بدون ذخیره‌سازی کلیدهای API)
CREATE POLICY "Settings Self" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Couple Messages (فقط اعضای تاییدشده جفت می‌توانند پیام‌ها را ببینند و بفرستند)
CREATE POLICY "Messages Read" ON public.couple_messages
  FOR SELECT USING (public.is_pair_member(pair_code));

CREATE POLICY "Messages Insert" ON public.couple_messages
  FOR INSERT WITH CHECK (public.is_pair_member(pair_code) AND auth.uid() = user_id);


-- ------------------------------------------------------------------------------
-- گام ۵: باکت اختصاصی Storage برای تصاویر سوالات با Signed URL و مسیر امن
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- گام ۶: ایندکس‌های بهینه‌سازی کوئری‌ها
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- گام ۷: فعال‌سازی Realtime
-- ------------------------------------------------------------------------------
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
