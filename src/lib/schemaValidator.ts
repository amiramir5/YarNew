/**
 * Automated Schema Contract Validator for YarNew 2.0
 * Verifies that all Supabase insert/upsert payloads match database tables,
 * and validates bidirectional conversions between domain models and database records.
 */

import { Session, Exam, MistakeCard, DailyPlan, QuickNote, ProgressEntry, AppSettings } from '../types';

// Expected columns for each table in Supabase PostgreSQL schema
export const EXPECTED_TABLE_COLUMNS: Record<string, string[]> = {
  sessions: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'pair_code', 'user_email', 'subject', 'book', 'chapter', 'goftar',
    'seconds', 'correct', 'wrong', 'blank', 'note', 'day', 'type'
  ],
  exams: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'pair_code', 'user_email', 'subject', 'day', 'correct', 'wrong', 'blank',
    'duration', 'percent', 'note',
    // Compatibility columns
    'title', 'total_questions', 'duration_minutes', 'percentage'
  ],
  mistakes: [
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'device_id',
    'pair_code', 'user_email', 'subject', 'chapter', 'cause', 'question',
    'source', 'importance', 'image_data', 'box', 'next_review', 'history',
    // Compatibility columns
    'question_number', 'topic', 'reason', 'lesson', 'leitner_box', 'image_url', 'day'
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
    'id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'user_email', 'pair_code', 'day', 'items'
  ],
  user_settings: [
    'user_id', 'device_id', 'pair_code', 'user_email', 'settings', 'updated_at'
  ],
  couple_live_states: [
    'pair_code', 'role', 'user_id', 'display_name', 'email', 'is_studying',
    'subject', 'subject_name', 'timer_started_at', 'accumulated_seconds',
    'session_elapsed_seconds', 'today_seconds', 'today_tests', 'study_day',
    'online', 'updated_at'
  ],
  pairs: [
    'pair_code', 'created_by', 'invite_code', 'expires_at', 'created_at'
  ],
  pair_members: [
    'pair_code', 'user_id', 'role', 'joined_at'
  ],
  profiles: [
    'id', 'email', 'full_name', 'role', 'pair_code', 'avatar_url', 'updated_at'
  ],
  couple_messages: [
    'id', 'pair_code', 'user_id', 'sender_role', 'sender_name', 'sender_email',
    'message', 'sticker', 'created_at', 'read'
  ]
};

export function validatePayloadAgainstSchema(
  tableName: keyof typeof EXPECTED_TABLE_COLUMNS,
  payload: Record<string, any>
): { valid: boolean; extraKeys: string[] } {
  const tableColumns = EXPECTED_TABLE_COLUMNS[tableName];
  if (!tableColumns) {
    throw new Error(`Table ${tableName} not defined in schema validation.`);
  }

  const payloadKeys = Object.keys(payload);
  const extraKeys = payloadKeys.filter((k) => !tableColumns.includes(k));

  return {
    valid: extraKeys.length === 0,
    extraKeys,
  };
}

/**
 * Bidirectional mappers for Exam
 */
export function mapExamToDatabase(exam: Exam, userId: string, pairCode?: string | null, userEmail?: string | null) {
  const totalQuestions = (exam.correct || 0) + (exam.wrong || 0) + (exam.blank || 0);
  return {
    id: exam.id,
    user_id: userId,
    created_at: exam.created_at,
    updated_at: exam.updated_at || Date.now(),
    deleted_at: exam.deleted_at || null,
    device_id: exam.device_id || 'client',
    pair_code: pairCode || null,
    user_email: userEmail || null,
    subject: exam.subject,
    day: exam.day,
    correct: exam.correct || 0,
    wrong: exam.wrong || 0,
    blank: exam.blank || 0,
    duration: exam.duration || 0,
    percent: exam.percent || 0,
    note: exam.note || '',
    // Compatibility fields
    title: exam.subject || 'آزمون',
    total_questions: totalQuestions,
    duration_minutes: exam.duration || 0,
    percentage: exam.percent || 0,
  };
}

export function mapDatabaseToExam(row: any): Exam {
  return {
    id: row.id,
    created_at: Number(row.created_at) || Date.now(),
    updated_at: Number(row.updated_at) || Date.now(),
    deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
    device_id: row.device_id || 'client',
    subject: row.subject || row.title || 'آزمون عمومی',
    day: row.day || '',
    correct: Number(row.correct) || 0,
    wrong: Number(row.wrong) || 0,
    blank: Number(row.blank) || 0,
    duration: Number(row.duration ?? row.duration_minutes) || 0,
    percent: Number(row.percent ?? row.percentage) || 0,
    note: row.note || '',
  };
}

/**
 * Bidirectional mappers for MistakeCard
 */
export function mapMistakeToDatabase(card: MistakeCard, userId: string, pairCode?: string | null, userEmail?: string | null, finalImageData?: string | null) {
  return {
    id: card.id,
    user_id: userId,
    created_at: card.created_at,
    updated_at: card.updated_at || Date.now(),
    deleted_at: card.deleted_at || null,
    device_id: card.device_id || 'client',
    pair_code: pairCode || null,
    user_email: userEmail || null,
    subject: card.subject,
    chapter: card.chapter || null,
    cause: card.cause || '',
    question: card.question || '',
    source: card.source || null,
    importance: card.importance || 3,
    image_data: finalImageData !== undefined ? finalImageData : (card.image_data || null),
    box: card.box || 1,
    next_review: card.next_review || '',
    history: card.history || [],
    // Compatibility fields
    topic: card.chapter || card.subject || '',
    reason: card.cause || '',
    lesson: card.subject || '',
    leitner_box: card.box || 1,
    image_url: finalImageData !== undefined ? finalImageData : (card.image_data || null),
    day: card.next_review || '',
  };
}

export function mapDatabaseToMistake(row: any): MistakeCard {
  return {
    id: row.id,
    created_at: Number(row.created_at) || Date.now(),
    updated_at: Number(row.updated_at) || Date.now(),
    deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
    device_id: row.device_id || 'client',
    subject: row.subject || row.lesson || '',
    chapter: row.chapter || row.topic || '',
    cause: row.cause || row.reason || '',
    question: row.question || '',
    source: row.source || '',
    importance: Number(row.importance) || 3,
    image_data: row.image_data || row.image_url || null,
    box: Number(row.box ?? row.leitner_box) || 1,
    next_review: row.next_review || row.day || '',
    history: Array.isArray(row.history) ? row.history : [],
  };
}

/**
 * Bidirectional mappers for Session
 */
export function mapSessionToDatabase(session: Session, userId: string, pairCode?: string | null, userEmail?: string | null) {
  return {
    id: session.id,
    user_id: userId,
    created_at: session.created_at,
    updated_at: session.updated_at || Date.now(),
    deleted_at: session.deleted_at || null,
    device_id: session.device_id || 'client',
    pair_code: pairCode || null,
    user_email: userEmail || null,
    subject: session.subject,
    book: session.book || null,
    chapter: session.chapter || null,
    goftar: session.goftar || null,
    seconds: session.seconds || 0,
    correct: session.correct || 0,
    wrong: session.wrong || 0,
    blank: session.blank || 0,
    note: session.note || '',
    day: session.day,
    type: session.type || 'آموزش',
  };
}

export function mapDatabaseToSession(row: any): Session {
  return {
    id: row.id,
    created_at: Number(row.created_at) || Date.now(),
    updated_at: Number(row.updated_at) || Date.now(),
    deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
    device_id: row.device_id || 'client',
    subject: row.subject || 'bio',
    book: row.book || undefined,
    chapter: row.chapter || undefined,
    goftar: row.goftar || undefined,
    seconds: Number(row.seconds) || 0,
    correct: Number(row.correct) || 0,
    wrong: Number(row.wrong) || 0,
    blank: Number(row.blank) || 0,
    note: row.note || '',
    day: row.day || '',
    type: row.type || 'آموزش',
  };
}

export function validateAllSchemas(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requiredTables = [
    'sessions',
    'exams',
    'mistakes',
    'daily_plans',
    'quick_notes',
    'progress_entries',
    'user_checklists',
    'user_settings',
    'couple_live_states',
    'pairs',
    'pair_members',
    'profiles',
    'couple_messages',
  ];

  for (const table of requiredTables) {
    if (!EXPECTED_TABLE_COLUMNS[table] || EXPECTED_TABLE_COLUMNS[table].length === 0) {
      errors.push(`Table ${table} is missing columns in schema contract`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

