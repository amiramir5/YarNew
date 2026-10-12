/**
 * Canonical Supabase Database Schema & RLS Policies for YarNew (کنکوریار ۲.۰)
 * Maintained single source of truth for database initialization & migrations.
 */

export const CANONICAL_SUPABASE_SQL = `-- ==============================================================================
-- اسکریپت جامع، اصلاح‌شده و ضد گلوله پایگاه‌داده Supabase برای کنکوریار ۲.۰
-- منطبق ۱۰۰٪ با انواع داده‌های فرانت‌اند (types/index.ts و cloudSync.ts)
-- Idempotent: قابل اجرا روی هم دیتابیس نو و هم دیتابیس موجود بدون حذف داده
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- ۱. جداول اتاق‌ها و اعضای دونفره (Pairs & Pair Members)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pairs (
  pair_code text PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code text UNIQUE,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.pairs ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;
ALTER TABLE public.pairs ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + interval '48 hours');

CREATE TABLE IF NOT EXISTS public.pair_members (
  pair_code text NOT NULL REFERENCES public.pairs(pair_code) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('husband', 'wife')),
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (pair_code, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pair_members_user_id_unique'
  ) THEN
    ALTER TABLE public.pair_members ADD CONSTRAINT pair_members_user_id_unique UNIQUE (user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- ۲. جدول پروفایل‌ها (Profiles)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text DEFAULT 'کاربر',
  role text DEFAULT 'husband' CHECK (role IN ('husband', 'wife')),
  pair_code text REFERENCES public.pairs(pair_code) ON DELETE SET NULL,
  avatar_url text,
  updated_at timestamp with time zone DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- ۳. جدول وضعیت زنده تایمر دونفره (Couple Live States)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- ۴. جدول جلسات مطالعه (Sessions)
-- ------------------------------------------------------------------------------
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
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS chapter text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS goftar text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS pair_code text;

-- ------------------------------------------------------------------------------
-- ۵. جدول آزمون‌ها (Exams) با سازگاری ستون‌های جدید و قدیمی
-- ------------------------------------------------------------------------------
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
  correct integer NOT NULL DEFAULT 0,
  wrong integer NOT NULL DEFAULT 0,
  blank integer NOT NULL DEFAULT 0,
  duration integer NOT NULL DEFAULT 0,
  percent numeric(5,2) NOT NULL DEFAULT 0,
  note text DEFAULT ''
);

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS duration integer DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS percent numeric(5,2) DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS pair_code text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS note text DEFAULT '';
-- ستون‌های سازگاری قدیمی در صورت وجود در دیتابیس فعلی
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS total_questions integer;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS percentage numeric(5,2);
ALTER TABLE public.exams ALTER COLUMN title DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- ۶. جدول تحلیل اشتباهات آزمون و لایتنر (Mistakes) با سازگاری ستون‌های قدیمی
-- ------------------------------------------------------------------------------
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
  cause text NOT NULL DEFAULT '',
  question text NOT NULL DEFAULT '',
  source text,
  importance integer NOT NULL DEFAULT 3,
  image_data text,
  box integer NOT NULL DEFAULT 1,
  next_review text NOT NULL DEFAULT '',
  history jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS pair_code text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS chapter text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS cause text DEFAULT '';
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS question text DEFAULT '';
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS importance integer DEFAULT 3;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS image_data text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS box integer DEFAULT 1;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS next_review text DEFAULT '';
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS history jsonb DEFAULT '[]'::jsonb;
-- ستون‌های سازگاری قدیمی
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS question_number text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS lesson text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS leitner_box integer;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS day text;
ALTER TABLE public.mistakes ALTER COLUMN topic DROP NOT NULL;
ALTER TABLE public.mistakes ALTER COLUMN reason DROP NOT NULL;
ALTER TABLE public.mistakes ALTER COLUMN lesson DROP NOT NULL;
ALTER TABLE public.mistakes ALTER COLUMN day DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- ۷. جداول برنامه‌ریزی روزانه، یادداشت‌ها، پیشرفت و چک‌لیست
-- ------------------------------------------------------------------------------
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
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS pair_code text;

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
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS pair_code text;

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
ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS pair_code text;

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

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  pair_code text,
  user_email text,
  settings jsonb NOT NULL,
  updated_at bigint NOT NULL
);

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
-- ۸. توابع و RPCهای امن با search_path اختصاصی
-- ------------------------------------------------------------------------------
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_pair_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pair_member(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_server_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_couple_live_states_updated_at ON public.couple_live_states;
CREATE TRIGGER trg_couple_live_states_updated_at
  BEFORE INSERT OR UPDATE ON public.couple_live_states
  FOR EACH ROW EXECUTE PROCEDURE public.set_server_updated_at();

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
    RAISE EXCEPTION 'برای ساخت اتاق باید ابتدا وارد حساب کاربری خود شوید.';
  END IF;

  SELECT pair_code INTO v_current_pair
  FROM public.pair_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_current_pair IS NOT NULL THEN
    RAISE EXCEPTION 'شما قبلاً در یک اتاق دونفره عضو هستید. برای ساخت اتاق جدید، ابتدا از اتاق فعلی خارج شوید.';
  END IF;

  v_pair_code := 'KY-' || upper(encode(gen_random_bytes(5), 'hex'));
  v_invite_code := 'INV-' || upper(encode(gen_random_bytes(6), 'hex'));
  v_expires_at := now() + interval '48 hours';

  INSERT INTO public.pairs (pair_code, created_by, invite_code, expires_at)
  VALUES (v_pair_code, v_user_id, v_invite_code, v_expires_at);

  INSERT INTO public.pair_members (pair_code, user_id, role)
  VALUES (v_pair_code, v_user_id, 'husband');

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.create_pair() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pair() TO authenticated;

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
    RAISE EXCEPTION 'برای پیوستن به اتاق باید وارد حساب خود شوید.';
  END IF;

  SELECT pair_code INTO v_current_pair
  FROM public.pair_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_current_pair IS NOT NULL THEN
    RAISE EXCEPTION 'شما هم‌اکنون در یک اتاق دونفره عضو هستید. ابتدا از آن خارج شوید.';
  END IF;

  p_invite_code := upper(trim(p_invite_code));

  SELECT * INTO v_pair
  FROM public.pairs
  WHERE upper(trim(invite_code)) = p_invite_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'کد دعوت نامعتبر است یا وجود ندارد.';
  END IF;

  IF v_pair.expires_at < now() THEN
    RAISE EXCEPTION 'مهلت ۴۸ ساعته این کد دعوت به پایان رسیده است.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.pair_members
  WHERE pair_code = v_pair.pair_code;

  IF v_count >= 2 THEN
    RAISE EXCEPTION 'ظرفیت این اتاق تکمیل است (حداکثر ۲ عضو).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pair_members WHERE pair_code = v_pair.pair_code AND role = 'husband') THEN
    v_assigned_role := 'wife';
  ELSE
    v_assigned_role := 'husband';
  END IF;

  INSERT INTO public.pair_members (pair_code, user_id, role)
  VALUES (v_pair.pair_code, v_user_id, v_assigned_role);

  -- ابطال فوری کد دعوت برای تضمین استفاده یک‌باره
  UPDATE public.pairs
  SET expires_at = now()
  WHERE pair_code = v_pair.pair_code;

  UPDATE public.profiles
  SET pair_code = v_pair.pair_code, role = v_assigned_role, updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'pair_code', v_pair.pair_code,
    'role', v_assigned_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.join_pair(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_pair(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_invite()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_pair_code text;
  v_new_invite text;
  v_expires_at timestamptz;
  v_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید.';
  END IF;

  SELECT pair_code INTO v_pair_code
  FROM public.pair_members
  WHERE user_id = v_user_id;

  IF v_pair_code IS NULL THEN
    RAISE EXCEPTION 'شما در هیچ اتاقی عضو نیستید.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.pair_members
  WHERE pair_code = v_pair_code;

  IF v_count >= 2 THEN
    RAISE EXCEPTION 'ظرفیت اتاق تکمیل است و امکان دعوت عضو جدید وجود ندارد.';
  END IF;

  v_new_invite := 'INV-' || upper(encode(gen_random_bytes(6), 'hex'));
  v_expires_at := now() + interval '48 hours';

  UPDATE public.pairs
  SET invite_code = v_new_invite,
      expires_at = v_expires_at
  WHERE pair_code = v_pair_code;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_code', v_new_invite,
    'expires_at', v_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.regenerate_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_invite() TO authenticated;

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
    RETURN jsonb_build_object('ok', true, 'message', 'شما در اتاقی عضو نبودید.');
  END IF;

  DELETE FROM public.pair_members
  WHERE pair_code = v_pair_code AND user_id = v_user_id;

  DELETE FROM public.couple_live_states
  WHERE pair_code = v_pair_code AND user_id = v_user_id;

  -- پاک کردن انتساب اتاق از سطرهای کاربر برای حفظ کامل حریم خصوصی پس از خروج
  UPDATE public.sessions SET pair_code = NULL WHERE user_id = v_user_id AND pair_code = v_pair_code;
  UPDATE public.exams SET pair_code = NULL WHERE user_id = v_user_id AND pair_code = v_pair_code;
  UPDATE public.daily_plans SET pair_code = NULL WHERE user_id = v_user_id AND pair_code = v_pair_code;

  UPDATE public.profiles
  SET pair_code = NULL, updated_at = now()
  WHERE id = v_user_id;

  SELECT count(*) INTO v_remaining_count
  FROM public.pair_members
  WHERE pair_code = v_pair_code;

  IF v_remaining_count = 0 THEN
    DELETE FROM public.pairs WHERE pair_code = v_pair_code;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pair_code', v_pair_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.leave_pair() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_pair() TO authenticated;

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
    UPDATE public.profiles SET pair_code = NULL WHERE id = v_user_id AND pair_code IS NOT NULL;
    RETURN jsonb_build_object('in_pair', false);
  END IF;

  SELECT p.invite_code, p.expires_at INTO v_invite_code, v_expires_at
  FROM public.pairs p
  WHERE p.pair_code = v_pair_code;

  SELECT count(*) INTO v_member_count
  FROM public.pair_members
  WHERE pair_code = v_pair_code;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_my_pair_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pair_status() TO authenticated;

-- ------------------------------------------------------------------------------
-- ۹. پالیسی‌های RLS و امنیت تفکیک‌شده
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

-- Profiles
DROP POLICY IF EXISTS "Profiles Read" ON public.profiles;
CREATE POLICY "Profiles Read" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_pair_member(pair_code));

DROP POLICY IF EXISTS "Profiles Update" ON public.profiles;
CREATE POLICY "Profiles Update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Pairs & Members
DROP POLICY IF EXISTS "Pairs Read" ON public.pairs;
CREATE POLICY "Pairs Read" ON public.pairs
  FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Pair Members Read" ON public.pair_members;
CREATE POLICY "Pair Members Read" ON public.pair_members
  FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = user_id);

-- Couple Live States
DROP POLICY IF EXISTS "Couple States Read" ON public.couple_live_states;
CREATE POLICY "Couple States Read" ON public.couple_live_states
  FOR SELECT USING (public.is_pair_member(pair_code) OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Couple States Insert" ON public.couple_live_states;
CREATE POLICY "Couple States Insert" ON public.couple_live_states
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_pair_member(pair_code)
  );

DROP POLICY IF EXISTS "Couple States Update" ON public.couple_live_states;
CREATE POLICY "Couple States Update" ON public.couple_live_states
  FOR UPDATE USING (
    auth.uid() = user_id
    AND public.is_pair_member(pair_code)
  ) WITH CHECK (
    auth.uid() = user_id
    AND public.is_pair_member(pair_code)
  );

DROP POLICY IF EXISTS "Couple States Delete" ON public.couple_live_states;
CREATE POLICY "Couple States Delete" ON public.couple_live_states
  FOR DELETE USING (auth.uid() = user_id);

-- Sessions
DROP POLICY IF EXISTS "Sessions Read" ON public.sessions;
CREATE POLICY "Sessions Read" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

DROP POLICY IF EXISTS "Sessions Write" ON public.sessions;
CREATE POLICY "Sessions Write" ON public.sessions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (pair_code IS NULL OR public.is_pair_member(pair_code)));

-- Exams
DROP POLICY IF EXISTS "Exams Read" ON public.exams;
CREATE POLICY "Exams Read" ON public.exams
  FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

DROP POLICY IF EXISTS "Exams Write" ON public.exams;
CREATE POLICY "Exams Write" ON public.exams
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (pair_code IS NULL OR public.is_pair_member(pair_code)));

-- Mistakes (کاملاً شخصی)
DROP POLICY IF EXISTS "Mistakes Self" ON public.mistakes;
CREATE POLICY "Mistakes Self" ON public.mistakes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Daily Plans
DROP POLICY IF EXISTS "Plans Read" ON public.daily_plans;
CREATE POLICY "Plans Read" ON public.daily_plans
  FOR SELECT USING (auth.uid() = user_id OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code)));

DROP POLICY IF EXISTS "Plans Write" ON public.daily_plans;
CREATE POLICY "Plans Write" ON public.daily_plans
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (pair_code IS NULL OR public.is_pair_member(pair_code)));

-- Quick Notes, Progress, Checklists, Settings (شخصی)
DROP POLICY IF EXISTS "Notes Self" ON public.quick_notes;
CREATE POLICY "Notes Self" ON public.quick_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Progress Self" ON public.progress_entries;
CREATE POLICY "Progress Self" ON public.progress_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Checklists Self" ON public.user_checklists;
CREATE POLICY "Checklists Self" ON public.user_checklists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Settings Self" ON public.user_settings;
CREATE POLICY "Settings Self" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Messages Read" ON public.couple_messages;
CREATE POLICY "Messages Read" ON public.couple_messages
  FOR SELECT USING (public.is_pair_member(pair_code));

DROP POLICY IF EXISTS "Messages Insert" ON public.couple_messages;
CREATE POLICY "Messages Insert" ON public.couple_messages
  FOR INSERT WITH CHECK (public.is_pair_member(pair_code) AND auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- ۱۰. باکت خصوصی Storage برای تصاویر دفترچه اشتباهات (question-images)
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
-- ۱۱. ایندکس‌های بهینه‌سازی
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
`;
