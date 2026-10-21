-- Migration: 20261012_consolidated_repair.sql
-- Forward-only non-destructive schema migration for YarNew 2.0
-- Adds compatibility columns, explicit indexes, private storage bucket, and hardened RLS

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Safe addition of compatibility columns to exams table
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS duration integer DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS percent numeric(5,2) DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS pair_code text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS total_questions integer;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS percentage numeric(5,2);

-- Backfill duration_minutes and percentage from existing duration and percent if null
UPDATE public.exams SET duration_minutes = duration WHERE duration_minutes IS NULL AND duration IS NOT NULL;
UPDATE public.exams SET percentage = percent WHERE percentage IS NULL AND percent IS NOT NULL;
UPDATE public.exams SET title = COALESCE(subject, 'آزمون') WHERE title IS NULL;

-- 3. Safe addition of compatibility columns to mistakes table
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
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS question_number text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS lesson text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS leitner_box integer;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS day text;

-- Make sure legacy columns are safely nullable without throwing on fresh databases
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.exams ALTER COLUMN title DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.mistakes ALTER COLUMN topic DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.mistakes ALTER COLUMN reason DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.mistakes ALTER COLUMN lesson DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.mistakes ALTER COLUMN day DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
END $$;

-- Backfill mistakes legacy columns
UPDATE public.mistakes SET reason = cause WHERE (reason IS NULL OR reason = '') AND cause IS NOT NULL AND cause <> '';
UPDATE public.mistakes SET cause = reason WHERE (cause IS NULL OR cause = '') AND reason IS NOT NULL AND reason <> '';
UPDATE public.mistakes SET lesson = subject WHERE (lesson IS NULL OR lesson = '') AND subject IS NOT NULL;
UPDATE public.mistakes SET subject = lesson WHERE (subject IS NULL OR subject = '') AND lesson IS NOT NULL;
UPDATE public.mistakes SET leitner_box = box WHERE leitner_box IS NULL AND box IS NOT NULL;
UPDATE public.mistakes SET box = leitner_box WHERE box IS NULL AND leitner_box IS NOT NULL;

-- 4. Sessions compatibility
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS book text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS chapter text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS goftar text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS pair_code text;

-- 5. Daily plans compatibility
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS wake_time text DEFAULT '06:00';
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS device_id text DEFAULT 'client';
ALTER TABLE public.daily_plans ADD COLUMN IF NOT EXISTS pair_code text;

-- 6. Quick notes & progress compatibility
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS day text DEFAULT '';
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS text text DEFAULT '';
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS ts bigint DEFAULT 0;
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS device_id text DEFAULT 'client';
ALTER TABLE public.quick_notes ADD COLUMN IF NOT EXISTS pair_code text;

ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS day text DEFAULT '';
ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS device_id text DEFAULT 'client';
ALTER TABLE public.progress_entries ADD COLUMN IF NOT EXISTS pair_code text;

-- 7. Hardened pair RPCs with explicit search_path
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

-- Ensure pair_members has user_id unique constraint so one user cannot belong to multiple active pairs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pair_members_user_id_unique'
  ) THEN
    ALTER TABLE public.pair_members ADD CONSTRAINT pair_members_user_id_unique UNIQUE (user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. Storage bucket for private mistake question images
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
