import { Session, Exam, MistakeCard, DailyPlan, AppSettings } from '../types';
import { getSupabaseClient } from './supabase';
import { getCoupleSettings } from './coupleSync';

/**
 * Push newly created or updated Session to Supabase
 */
export async function pushSessionToCloud(session: Session): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { pairCode, myEmail } = getCoupleSettings();

    await supabase.from('sessions').upsert({
      id: session.id,
      created_at: session.created_at,
      updated_at: session.updated_at,
      deleted_at: session.deleted_at,
      device_id: session.device_id || 'client',
      pair_code: pairCode,
      user_email: myEmail || null,
      subject: session.subject,
      chapter: session.chapter || null,
      seconds: session.seconds,
      correct: session.correct || 0,
      wrong: session.wrong || 0,
      blank: session.blank || 0,
      note: session.note || '',
      day: session.day,
      type: session.type,
    });
  } catch (err) {
    console.warn('Silent cloud sync failed for session:', err);
  }
}

/**
 * Push Exam result to Supabase
 */
export async function pushExamToCloud(exam: Exam): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { pairCode, myEmail } = getCoupleSettings();

    await supabase.from('exams').upsert({
      id: exam.id,
      created_at: exam.created_at,
      updated_at: exam.updated_at,
      deleted_at: exam.deleted_at,
      device_id: exam.device_id || 'client',
      pair_code: pairCode,
      user_email: myEmail || null,
      subject: exam.subject,
      day: exam.day,
      correct: exam.correct || 0,
      wrong: exam.wrong || 0,
      blank: exam.blank || 0,
      duration: exam.duration || 0,
      percent: exam.percent || 0,
      note: exam.note || '',
    });
  } catch (err) {
    console.warn('Silent cloud sync failed for exam:', err);
  }
}

/**
 * Push Mistake card to Supabase
 */
export async function pushMistakeToCloud(card: MistakeCard): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { pairCode, myEmail } = getCoupleSettings();

    await supabase.from('mistakes').upsert({
      id: card.id,
      created_at: card.created_at,
      updated_at: card.updated_at,
      deleted_at: card.deleted_at,
      device_id: card.device_id || 'client',
      pair_code: pairCode,
      user_email: myEmail || null,
      subject: card.subject,
      chapter: card.chapter || null,
      cause: card.cause,
      question: card.question,
      source: card.source || null,
      importance: card.importance || 3,
      image_data: card.image_data || null,
      box: card.box || 1,
      next_review: card.next_review,
      history: card.history || [],
    });
  } catch (err) {
    console.warn('Silent cloud sync failed for mistake:', err);
  }
}

/**
 * Pull all data from Supabase for this pairCode and merge with local
 */
export async function fetchCloudData(): Promise<{
  sessions?: Session[];
  exams?: Exam[];
  mistakes?: MistakeCard[];
  plans?: DailyPlan[];
} | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { pairCode } = getCoupleSettings();

    const [sessionsRes, examsRes, mistakesRes, plansRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('pair_code', pairCode).limit(500),
      supabase.from('exams').select('*').eq('pair_code', pairCode).limit(200),
      supabase.from('mistakes').select('*').eq('pair_code', pairCode).limit(300),
      supabase.from('daily_plans').select('*').eq('pair_code', pairCode).limit(50),
    ]);

    return {
      sessions: sessionsRes.data || [],
      exams: examsRes.data || [],
      mistakes: mistakesRes.data || [],
      plans: plansRes.data || [],
    };
  } catch (err) {
    console.warn('Failed to fetch cloud records:', err);
    return null;
  }
}

/**
 * Push user settings and AI preferences to Supabase
 */
export async function pushSettingsToCloud(settings: AppSettings): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { pairCode, myEmail } = getCoupleSettings();
    await supabase.from('user_settings').upsert({
      device_id: settings.deviceId || 'client',
      pair_code: pairCode,
      user_email: myEmail || null,
      settings: settings,
      updated_at: Date.now(),
    });
  } catch (err) {
    console.warn('Silent cloud sync for settings notice:', err);
  }
}

/**
 * Fetch settings from Supabase if available
 */
export async function fetchCloudSettings(deviceId: string): Promise<AppSettings | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { pairCode } = getCoupleSettings();
    const { data } = await supabase
      .from('user_settings')
      .select('settings')
      .or(`device_id.eq.${deviceId},pair_code.eq.${pairCode}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && data.settings) {
      return data.settings as AppSettings;
    }
    return null;
  } catch (err) {
    return null;
  }
}

