-- ============================================================================
-- 20261021_bugfix_hardening.sql
-- رفع باگ‌های امنیتی/دقیق‌بودن لایه Supabase:
--   صفر) تابع کمکی is_pair_member
--   ۱) محافظ Last-Write-Wins روی همه جداول داده (upsert قدیمی نباید داده جدید را نابود کند)
--   ۲) یکتایی واقعی کد دعوت (invite_code) حتی روی دیتابیس‌های قدیمی
--   ۳) backfill و NOT NULL کردن expires_at (کد دعوت منقضی‌نشدهٔ بی‌نهایت)
--   ۴) join_pair با LIMIT 1
--   ۵) اجازه خواندن mistakes برای هم‌جفت (پارتنر) — هم‌تراز با sessions/exams/plans
-- این اسکریپت idempotent است و می‌توانید چند بار اجرا کنید.
-- ============================================================================

-- ------------------------------------------------------------------
-- صفر) تابع کمکی is_pair_member (در برخی دیتابیس‌های قدیمی وجود ندارد)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pair_member(p_pair_code text)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.pair_members
    WHERE pair_code = p_pair_code AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_pair_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pair_member(text) TO authenticated;

-- ------------------------------------------------------------------
-- ۱) LWW Guard: روی UPDATE، اگر payload قدیمی‌تر از ردیف موجود بود، رد شود
--    (شامل sessions, exams, mistakes, daily_plans, quick_notes,
--     progress_entries, user_checklists, user_settings — updated_at bigint)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lww_guard_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.updated_at IS NOT NULL AND OLD.updated_at IS NOT NULL
     AND NEW.updated_at < OLD.updated_at THEN
    -- نوشتهٔ قدیمی‌تر حق بازنویسی دادهٔ جدیدتر را ندارد
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sessions', 'exams', 'mistakes', 'daily_plans',
    'quick_notes', 'progress_entries', 'user_checklists', 'user_settings'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_lww_guard ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_lww_guard BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE PROCEDURE public.lww_guard_updated_at()', t);
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------
-- ۲) یکتایی invite_code — نسخهٔ ADD COLUMN IF NOT EXISTS UNIQUE روی
--    دیتابیس‌های قدیمی اعمال نمی‌شد؛ ایندکس صریح می‌سازیم
-- ------------------------------------------------------------------
-- دوباره‌کاری‌های احتمالی را با کد جدید یکتاکن
UPDATE public.pairs p
SET invite_code = 'INV-' || upper(encode(gen_random_bytes(6), 'hex'))
FROM (
  SELECT ctid
  FROM (
    SELECT ctid,
           row_number() OVER (PARTITION BY upper(trim(invite_code)) ORDER BY ctid) AS rn
    FROM public.pairs
    WHERE invite_code IS NOT NULL
  ) d
  WHERE d.rn > 1
) dup
WHERE p.ctid = dup.ctid;

-- ردیف‌های بدون کد دعوت (اضافه‌شدن دیرهنگام ستون روی دیتابیس‌های قدیمی)
UPDATE public.pairs
SET invite_code = 'INV-' || upper(encode(gen_random_bytes(6), 'hex'))
WHERE invite_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pairs_invite_code_uniq_idx
  ON public.pairs (upper(trim(invite_code)))
  WHERE invite_code IS NOT NULL;

-- ------------------------------------------------------------------
-- ۳) expires_at: هیچ کد دعوتی بی‌انقضا نماند
-- ------------------------------------------------------------------
UPDATE public.pairs
SET expires_at = now() + interval '48 hours'
WHERE expires_at IS NULL;

ALTER TABLE public.pairs ALTER COLUMN expires_at SET DEFAULT (now() + interval '48 hours');
ALTER TABLE public.pairs ALTER COLUMN expires_at SET NOT NULL;

-- ------------------------------------------------------------------
-- ۴) join_pair با LIMIT 1 (با ایندکس یکتا عملاً تک‌ردیف است، ولی محکم‌کاری)
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.join_pair(text);
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
    RAISE EXCEPTION 'شما هم‌اکنون در اتاق % عضو هستید. ابتدا از آن خارج شوید.', v_current_pair;
  END IF;

  p_invite_code := upper(trim(p_invite_code));

  SELECT * INTO v_pair
  FROM public.pairs
  WHERE upper(trim(invite_code)) = p_invite_code
  ORDER BY created_by
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'کد دعوت نامعتبر است یا وجود ندارد.';
  END IF;

  IF v_pair.expires_at IS NULL OR v_pair.expires_at < now() THEN
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

  -- ابطال فوری کد دعوت برای تضمین یک‌بارمصرف بودن
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.join_pair(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_pair(text) TO authenticated;

-- ------------------------------------------------------------------
-- ۵) خواندن mistakes برای هم‌جفت (کلاینت با pair_code فیلتر می‌کند ولی
--    RLS قدیمی فقط خوانندهٔ خودِ ردیف بود و همیشه ۰ ردیف برمی‌گشت)
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "Mistakes Pair Read" ON public.mistakes;
CREATE POLICY "Mistakes Pair Read" ON public.mistakes
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (pair_code IS NOT NULL AND public.is_pair_member(pair_code))
  );

