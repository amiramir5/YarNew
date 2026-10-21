-- ============================================================================
-- 20261022_lockdown.sql
-- بستن حفره‌های امنیتی واقعی که در بانک داده بررسی شد:
--  - سیاست‌های «true» عمومی (anon) روی sessions/mistakes/exams/daily_plans/quick_notes/
--    progress_entries/user_settings/profiles → هر کسی می‌توانست همه داده‌ها را بخواند/بنویسد
--  - user_checklists و couple_live_state(s) و pair_members و pairs و couple_messages
--    اصلاً RLS نداشتند (داده پیام‌ها/حضور عمومی!)
-- سیاست‌های جدید نوشته‌های خود کاربر + خواندن هم‌جفت را پوشش می‌دهند و برای
-- ردیف‌های قدیمیِ بدون user_id، تطبیق user_email را هم قبول می‌کنند.
-- Idempotent.
-- ============================================================================

-- ---------- helper ----------
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

-- ---------- sessions ----------
DROP POLICY IF EXISTS "Access Sessions" ON public.sessions;
DROP POLICY IF EXISTS "Public Sessions" ON public.sessions;
CREATE POLICY "Sessions owner" ON public.sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');
CREATE POLICY "Sessions partner read" ON public.sessions
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- exams ----------
DROP POLICY IF EXISTS "Access Exams" ON public.exams;
DROP POLICY IF EXISTS "Public Exams" ON public.exams;
CREATE POLICY "Exams owner" ON public.exams
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');
CREATE POLICY "Exams partner read" ON public.exams
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- mistakes ----------
DROP POLICY IF EXISTS "Access Mistakes" ON public.mistakes;
DROP POLICY IF EXISTS "Public Mistakes" ON public.mistakes;
CREATE POLICY "Mistakes owner" ON public.mistakes
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');

-- ---------- daily_plans ----------
DROP POLICY IF EXISTS "Access Plans" ON public.daily_plans;
DROP POLICY IF EXISTS "Public Plans" ON public.daily_plans;
CREATE POLICY "Plans owner" ON public.daily_plans
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');
CREATE POLICY "Plans partner read" ON public.daily_plans
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- quick_notes ----------
DROP POLICY IF EXISTS "Access Notes" ON public.quick_notes;
CREATE POLICY "Quick Notes owner" ON public.quick_notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');
CREATE POLICY "Quick Notes partner read" ON public.quick_notes
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- progress_entries ----------
DROP POLICY IF EXISTS "Access Progress" ON public.progress_entries;
CREATE POLICY "Progress owner" ON public.progress_entries
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');

-- ---------- user_settings ----------
DROP POLICY IF EXISTS "Access User Settings" ON public.user_settings;
CREATE POLICY "User Settings owner" ON public.user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');

-- ---------- profiles ----------
DROP POLICY IF EXISTS "Access Profiles" ON public.profiles;
-- self/partner policies of profiles already exist; nothing more needed

-- ---------- user_checklists ----------
ALTER TABLE public.user_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Chk owner" ON public.user_checklists;
DROP POLICY IF EXISTS "Chk partner read" ON public.user_checklists;
CREATE POLICY "Chk owner" ON public.user_checklists
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_id = auth.uid() OR user_email = auth.jwt() ->> 'email');
CREATE POLICY "Chk partner read" ON public.user_checklists
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- couple_live_states (+ legacy singular) ----------
ALTER TABLE public.couple_live_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Live owner" ON public.couple_live_states;
DROP POLICY IF EXISTS "Live partner read" ON public.couple_live_states;
CREATE POLICY "Live owner" ON public.couple_live_states
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Live partner read" ON public.couple_live_states
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- couple_messages ----------
ALTER TABLE public.couple_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Msg owner" ON public.couple_messages;
DROP POLICY IF EXISTS "Msg partner read" ON public.couple_messages;
CREATE POLICY "Msg owner" ON public.couple_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Msg partner read" ON public.couple_messages
  FOR SELECT TO authenticated
  USING (pair_code IS NOT NULL AND public.is_pair_member(pair_code));

-- ---------- pair_members ----------
ALTER TABLE public.pair_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pair member select" ON public.pair_members;
CREATE POLICY "Pair member select" ON public.pair_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (pair_code IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pair_members m
      WHERE m.pair_code = pair_members.pair_code AND m.user_id = auth.uid()
    ))
  );

-- ---------- pairs ----------
ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pair select" ON public.pairs;
CREATE POLICY "Pair select" ON public.pairs
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.pair_members m
      WHERE m.pair_code = pairs.pair_code AND m.user_id = auth.uid()
    )
  );

-- ---------- pair_join_attempts ----------
ALTER TABLE public.pair_join_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Join attempts owner" ON public.pair_join_attempts;
CREATE POLICY "Join attempts owner" ON public.pair_join_attempts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
