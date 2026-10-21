-- ============================================================================
-- 20261022b_app_backups.sql
-- جدول پشتیبان‌گیری خودکار: هر شب اپ یک snapshot کامل از داده‌ها را اینجا ذخیره می‌کند
-- (با outbox صف می‌شود؛ اگر اینترنت نبود تا برگرداندن نت نگه داشته و ارسال می‌شود)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_backups (
  user_id uuid NOT NULL,
  device_id text,
  created_at bigint,
  data jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.app_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App Backup owner" ON public.app_backups;
CREATE POLICY "App Backup owner" ON public.app_backups
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
