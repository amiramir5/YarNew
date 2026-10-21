/**
 * Real (live-DB) column whitelist per table. The cloud schema has drifted across
 * iterations; sending fields that no longer exist makes PostgREST reject the
 * whole upsert (PGRST204) — this silently killed every exam/mistake/session
 * push since mid-October. Every payload is filtered through this map before
 * it reaches Supabase, so schema drift on the DB side can no longer strand
 * data in the outbox. Import from './payload' (no module cycles).
 */
export const TABLE_COLUMNS: Record<string, string[]> = {
  sessions: ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id', 'pair_code', 'user_email', 'subject', 'chapter', 'goftar', 'seconds', 'correct', 'wrong', 'blank', 'note', 'day', 'type'],
  exams: ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id', 'pair_code', 'user_email', 'subject', 'day', 'correct', 'wrong', 'blank', 'duration', 'percent', 'note'],
  mistakes: ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id', 'pair_code', 'user_email', 'subject', 'chapter', 'cause', 'question', 'source', 'importance', 'image_data', 'box', 'next_review', 'history'],
  daily_plans: ['id', 'user_id', 'pair_code', 'user_email', 'day', 'wake_time', 'items', 'created_at', 'updated_at', 'device_id', 'deleted_at'],
  quick_notes: ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id', 'pair_code', 'user_email', 'day', 'text', 'ts'],
  progress_entries: ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id', 'user_email', 'pair_code', 'day', 'subject', 'chapter', 'note'],
  user_checklists: ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'user_email', 'pair_code', 'day', 'items'],
  user_settings: ['user_id', 'user_email', 'pair_code', 'device_id', 'settings', 'updated_at'],
  couple_live_states: ['pair_code', 'role', 'display_name', 'email', 'user_id', 'is_studying', 'subject', 'subject_name', 'timer_started_at', 'accumulated_seconds', 'session_elapsed_seconds', 'today_seconds', 'today_tests', 'study_day', 'online'],
  couple_messages: ['id', 'pair_code', 'user_id', 'sender_role', 'sender_name', 'sender_email', 'message', 'sticker', 'created_at', 'read'],
  app_backups: ['user_id', 'device_id', 'created_at', 'data'],
};

export function sanitizePayload(table: string, payload: any): any {
  const cols = TABLE_COLUMNS[table];
  if (!cols || typeof payload !== 'object' || payload === null) return payload;
  const out: Record<string, any> = {};
  for (const col of cols) {
    if (payload[col] !== undefined) out[col] = payload[col];
  }
  return out;
}
