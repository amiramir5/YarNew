// Script to validate that all cloudSync payload keys exist as columns in canonical migrations
import fs from 'fs';
import path from 'path';

const migration1 = fs.readFileSync(path.resolve('supabase/migrations/20261011_initial_schema.sql'), 'utf8');
const migration2 = fs.existsSync(path.resolve('supabase/migrations/20261012_consolidated_repair.sql'))
  ? fs.readFileSync(path.resolve('supabase/migrations/20261012_consolidated_repair.sql'), 'utf8')
  : '';
const sql = migration1 + '\n\n' + migration2;

// Parse CREATE TABLE statements and ALTER TABLE ADD COLUMN statements
const tableColumns = {};

const createTableRegex = /CREATE TABLE IF NOT EXISTS public\.(\w+)\s*\(([\s\S]*?)\);/g;
let match;
while ((match = createTableRegex.exec(sql)) !== null) {
  const tableName = match[1];
  const body = match[2];
  const columns = new Set();
  
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('PRIMARY KEY') || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('CHECK')) continue;
    const colMatch = trimmed.match(/^(\w+)/);
    if (colMatch) {
      columns.add(colMatch[1]);
    }
  }
  tableColumns[tableName] = columns;
}

// Add ALTER TABLE columns
const alterTableRegex = /ALTER TABLE public\.(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)/g;
while ((match = alterTableRegex.exec(sql)) !== null) {
  const tableName = match[1];
  const colName = match[2];
  if (!tableColumns[tableName]) tableColumns[tableName] = new Set();
  tableColumns[tableName].add(colName);
}

// Payloads from cloudSync.ts & coupleSync.ts
const payloads = {
  sessions: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'pair_code', 'user_email', 'subject', 'book', 'chapter', 'goftar',
    'seconds', 'correct', 'wrong', 'blank', 'note', 'day', 'type'
  ],
  exams: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'pair_code', 'user_email', 'subject', 'day', 'correct', 'wrong', 'blank',
    'duration', 'percent', 'note'
  ],
  mistakes: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'pair_code', 'user_email', 'subject', 'chapter', 'cause', 'question',
    'source', 'importance', 'image_data', 'box', 'next_review', 'history'
  ],
  daily_plans: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'user_email', 'pair_code', 'day', 'wake_time', 'items'
  ],
  quick_notes: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'user_email', 'pair_code', 'day', 'text', 'ts'
  ],
  progress_entries: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'user_email', 'pair_code', 'day', 'subject', 'chapter', 'note'
  ],
  user_checklists: [
    'id', 'user_id', 'created_at', 'updated_at', 'user_email', 'pair_code',
    'day', 'items'
  ],
  user_settings: [
    'user_id', 'device_id', 'pair_code', 'user_email', 'settings', 'updated_at'
  ],
  couple_live_states: [
    'pair_code', 'role', 'user_id', 'display_name', 'email', 'is_studying',
    'subject', 'subject_name', 'timer_started_at', 'accumulated_seconds',
    'session_elapsed_seconds', 'today_seconds', 'today_tests', 'study_day',
    'online', 'updated_at'
  ]
};

let allOk = true;
console.log('=== VALIDATING PAYLOAD KEYS VS SQL COLUMNS ===');
for (const [table, keys] of Object.entries(payloads)) {
  const cols = tableColumns[table];
  if (!cols) {
    console.error(`❌ Table ${table} not found in SQL schema!`);
    allOk = false;
    continue;
  }
  const missing = keys.filter(k => !cols.has(k));
  if (missing.length > 0) {
    console.error(`❌ Table ${table} is missing columns for keys:`, missing);
    allOk = false;
  } else {
    console.log(`✅ Table ${table}: all ${keys.length} payload keys match schema columns.`);
  }
}

if (!allOk) {
  process.exit(1);
} else {
  console.log('🎉 100% Match! All payload keys are valid columns.');
}
