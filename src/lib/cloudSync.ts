import {
  Session,
  Exam,
  MistakeCard,
  DailyPlan,
  QuickNote,
  ProgressEntry,
  AppSettings,
} from '../types';
import { getSupabaseClient } from './supabase';
import { getCoupleSettings } from './coupleSync';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error';

interface OutboxItem {
  id: string;
  type: 'session' | 'exam' | 'mistake' | 'plan' | 'note' | 'progress' | 'checklist' | 'settings';
  payload: any;
  retryCount: number;
  addedAt: number;
}

const OUTBOX_KEY = 'ky_sync_outbox_v2';
let currentSyncStatus: SyncStatus = 'synced';
const syncListeners = new Set<(status: SyncStatus) => void>();

function setSyncStatus(s: SyncStatus) {
  currentSyncStatus = s;
  syncListeners.forEach((cb) => cb(s));
}

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function subscribeToSyncStatus(callback: (status: SyncStatus) => void): () => void {
  syncListeners.add(callback);
  callback(currentSyncStatus);
  return () => syncListeners.delete(callback);
}

function loadOutbox(): OutboxItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOutbox(items: OutboxItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {}
}

function queueForSync(type: OutboxItem['type'], payload: any) {
  const outbox = loadOutbox();
  const existingIndex = outbox.findIndex((item) => item.id === payload.id && item.type === type);
  if (existingIndex >= 0) {
    outbox[existingIndex] = {
      id: payload.id,
      type,
      payload,
      retryCount: 0,
      addedAt: Date.now(),
    };
  } else {
    outbox.push({
      id: payload.id || `sync-${Date.now()}`,
      type,
      payload,
      retryCount: 0,
      addedAt: Date.now(),
    });
  }
  saveOutbox(outbox);
  setSyncStatus('pending');
}

async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Push Session to Supabase with proper columns (including book, goftar, user_id)
 */
export async function pushSessionToCloud(session: Session): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) {
    queueForSync('session', session);
    return;
  }

  setSyncStatus('syncing');
  try {
    const { error } = await supabase.from('sessions').upsert({
      id: session.id,
      user_id: userId,
      created_at: session.created_at,
      updated_at: session.updated_at || Date.now(),
      deleted_at: session.deleted_at || null,
      device_id: session.device_id || 'client',
      pair_code: pairCode || null,
      user_email: myEmail || null,
      subject: session.subject,
      book: session.book || null,
      chapter: session.chapter || null,
      goftar: session.goftar || null,
      seconds: session.seconds,
      correct: session.correct || 0,
      wrong: session.wrong || 0,
      blank: session.blank || 0,
      note: session.note || '',
      day: session.day,
      type: session.type,
    });

    if (error) throw error;
    setSyncStatus('synced');
  } catch (err) {
    console.warn('Queueing session for offline sync:', err);
    queueForSync('session', session);
    setSyncStatus('pending');
  }
}

/**
 * Push Exam to Supabase
 */
export async function pushExamToCloud(exam: Exam): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) {
    queueForSync('exam', exam);
    return;
  }

  setSyncStatus('syncing');
  try {
    const { error } = await supabase.from('exams').upsert({
      id: exam.id,
      user_id: userId,
      created_at: exam.created_at,
      updated_at: exam.updated_at || Date.now(),
      deleted_at: exam.deleted_at || null,
      device_id: exam.device_id || 'client',
      pair_code: pairCode || null,
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

    if (error) throw error;
    setSyncStatus('synced');
  } catch (err) {
    console.warn('Queueing exam for offline sync:', err);
    queueForSync('exam', exam);
    setSyncStatus('pending');
  }
}

/**
 * Push Mistake to Supabase
 */
export async function pushMistakeToCloud(card: MistakeCard): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) {
    queueForSync('mistake', card);
    return;
  }

  setSyncStatus('syncing');
  try {
    const { error } = await supabase.from('mistakes').upsert({
      id: card.id,
      user_id: userId,
      created_at: card.created_at,
      updated_at: card.updated_at || Date.now(),
      deleted_at: card.deleted_at || null,
      device_id: card.device_id || 'client',
      pair_code: pairCode || null,
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

    if (error) throw error;
    setSyncStatus('synced');
  } catch (err) {
    console.warn('Queueing mistake for offline sync:', err);
    queueForSync('mistake', card);
    setSyncStatus('pending');
  }
}

/**
 * Push Plan to Supabase
 */
export async function pushPlanToCloud(plan: DailyPlan): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) {
    queueForSync('plan', plan);
    return;
  }

  setSyncStatus('syncing');
  try {
    const { error } = await supabase.from('daily_plans').upsert({
      id: plan.id,
      user_id: userId,
      created_at: plan.created_at || Date.now(),
      updated_at: plan.updated_at || Date.now(),
      deleted_at: plan.deleted_at || null,
      device_id: plan.device_id || 'client',
      user_email: myEmail || null,
      pair_code: pairCode || null,
      day: plan.day,
      wake_time: plan.wake_time || '06:00',
      items: plan.items || [],
    });

    if (error) throw error;
    setSyncStatus('synced');
  } catch (err) {
    console.warn('Queueing plan for offline sync:', err);
    queueForSync('plan', plan);
    setSyncStatus('pending');
  }
}

/**
 * Push Quick Note to Supabase
 */
export async function pushNoteToCloud(note: QuickNote): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) {
    queueForSync('note', note);
    return;
  }

  try {
    await supabase.from('quick_notes').upsert({
      id: note.id,
      user_id: userId,
      created_at: note.created_at || Date.now(),
      updated_at: note.updated_at || Date.now(),
      deleted_at: note.deleted_at || null,
      device_id: note.device_id || 'client',
      user_email: myEmail || null,
      pair_code: pairCode || null,
      day: note.day || '',
      text: note.text,
      ts: note.ts || Date.now(),
    });
  } catch (err) {
    queueForSync('note', note);
  }
}

/**
 * Push Progress Entry to Supabase
 */
export async function pushProgressToCloud(entry: ProgressEntry): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) {
    queueForSync('progress', entry);
    return;
  }

  try {
    await supabase.from('progress_entries').upsert({
      id: entry.id,
      user_id: userId,
      created_at: entry.created_at || Date.now(),
      updated_at: entry.updated_at || Date.now(),
      deleted_at: entry.deleted_at || null,
      device_id: entry.device_id || 'client',
      user_email: myEmail || null,
      pair_code: pairCode || null,
      day: entry.day,
      subject: entry.subject,
      chapter: entry.chapter,
      note: entry.note || '',
    });
  } catch (err) {
    queueForSync('progress', entry);
  }
}

/**
 * Push User Checklist to Supabase
 */
export async function pushChecklistToCloud(day: string, checklist: Record<string, boolean>): Promise<void> {
  const supabase = getSupabaseClient();
  const { pairCode, myEmail } = getCoupleSettings();
  const userId = await getAuthUserId();

  if (!supabase) return;

  try {
    await supabase.from('user_checklists').upsert({
      id: `chk-${day}`,
      user_id: userId,
      created_at: Date.now(),
      updated_at: Date.now(),
      user_email: myEmail || null,
      pair_code: pairCode || null,
      day,
      items: checklist,
    });
  } catch {}
}

/**
 * Push App Settings to Supabase (NEVER leaks API keys!)
 */
export async function pushSettingsToCloud(settings: AppSettings): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const userId = await getAuthUserId();
    const { pairCode, myEmail } = getCoupleSettings();

    // CRITICAL SECURITY HARDENING: Strip sensitive user API keys before cloud push
    const sanitizedSettings: AppSettings = {
      ...settings,
      ai: {
        ...settings.ai,
        geminiKey: '',
        openrouterKey: '',
      },
    };

    if (userId) {
      await supabase.from('user_settings').upsert({
        user_id: userId,
        device_id: settings.deviceId || 'client',
        pair_code: pairCode || null,
        user_email: myEmail || null,
        settings: sanitizedSettings,
        updated_at: Date.now(),
      });
    }
  } catch (err) {
    console.warn('Silent cloud settings sync notice:', err);
  }
}

/**
 * Fetch settings from Supabase strictly for current user
 */
export async function fetchCloudSettings(): Promise<AppSettings | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const userId = await getAuthUserId();
    if (!userId) return null;

    const { data } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (data && data.settings) {
      return data.settings as AppSettings;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Last-Write-Wins entity merger helper
 */
export function mergeWithLastWriteWins<T extends { id: string; created_at: number; updated_at?: number; deleted_at?: number | null }>(
  localList: T[],
  remoteList: T[]
): T[] {
  const map = new Map<string, T>();

  // Add all local items first
  localList.forEach((item) => {
    map.set(item.id, item);
  });

  // Merge remote items using timestamp comparison
  remoteList.forEach((remoteItem) => {
    const localItem = map.get(remoteItem.id);
    if (!localItem) {
      map.set(remoteItem.id, remoteItem);
    } else {
      const localTime = localItem.updated_at || localItem.created_at || 0;
      const remoteTime = remoteItem.updated_at || remoteItem.created_at || 0;
      if (remoteTime >= localTime) {
        map.set(remoteItem.id, remoteItem);
      }
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at)
  );
}

/**
 * Pull all data from Supabase for this user with ordered pagination & LWW merge
 */
export async function fetchCloudData(customEmail?: string): Promise<{
  sessions?: Session[];
  exams?: Exam[];
  mistakes?: MistakeCard[];
  plans?: DailyPlan[];
  notes?: QuickNote[];
  progress?: ProgressEntry[];
} | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const userId = await getAuthUserId();
    const { pairCode, myEmail } = getCoupleSettings();
    const targetEmail = (customEmail || myEmail || '').trim().toLowerCase();

    let sQuery = supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(500);
    let eQuery = supabase.from('exams').select('*').order('created_at', { ascending: false }).limit(250);
    let mQuery = supabase.from('mistakes').select('*').order('created_at', { ascending: false }).limit(350);
    let pQuery = supabase.from('daily_plans').select('*').order('created_at', { ascending: false }).limit(60);
    let nQuery = supabase.from('quick_notes').select('*').order('created_at', { ascending: false }).limit(50);
    let prQuery = supabase.from('progress_entries').select('*').order('created_at', { ascending: false }).limit(100);

    if (userId) {
      sQuery = sQuery.eq('user_id', userId);
      eQuery = eQuery.eq('user_id', userId);
      mQuery = mQuery.eq('user_id', userId);
      pQuery = pQuery.eq('user_id', userId);
      nQuery = nQuery.eq('user_id', userId);
      prQuery = prQuery.eq('user_id', userId);
    } else if (targetEmail) {
      sQuery = sQuery.eq('user_email', targetEmail);
      eQuery = eQuery.eq('user_email', targetEmail);
      mQuery = mQuery.eq('user_email', targetEmail);
      pQuery = pQuery.eq('user_email', targetEmail);
      nQuery = nQuery.eq('user_email', targetEmail);
      prQuery = prQuery.eq('user_email', targetEmail);
    } else if (pairCode) {
      sQuery = sQuery.eq('pair_code', pairCode);
      eQuery = eQuery.eq('pair_code', pairCode);
      mQuery = mQuery.eq('pair_code', pairCode);
      pQuery = pQuery.eq('pair_code', pairCode);
      nQuery = nQuery.eq('pair_code', pairCode);
      prQuery = prQuery.eq('pair_code', pairCode);
    }

    const [sessionsRes, examsRes, mistakesRes, plansRes, notesRes, progressRes] = await Promise.all([
      sQuery,
      eQuery,
      mQuery,
      pQuery,
      nQuery,
      prQuery,
    ]);

    return {
      sessions: sessionsRes.data || [],
      exams: examsRes.data || [],
      mistakes: mistakesRes.data || [],
      plans: plansRes.data || [],
      notes: notesRes.data || [],
      progress: progressRes.data || [],
    };
  } catch (err) {
    console.warn('Failed to fetch cloud records:', err);
    setSyncStatus('error');
    return null;
  }
}

/**
 * Fetch partner's sessions specifically for couple comparison charts
 */
export async function fetchPartnerSessions(pairCode: string, partnerEmail: string): Promise<Session[]> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase || !pairCode) return [];
    let q = supabase
      .from('sessions')
      .select('*')
      .eq('pair_code', pairCode)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (partnerEmail) {
      q = q.eq('user_email', partnerEmail.trim().toLowerCase());
    }

    const { data } = await q;
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Flush offline outbox queue with exponential retry
 */
export async function flushOutboxQueue(): Promise<void> {
  const outbox = loadOutbox();
  if (outbox.length === 0) {
    setSyncStatus('synced');
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase || typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus('pending');
    return;
  }

  setSyncStatus('syncing');
  const remaining: OutboxItem[] = [];

  for (const item of outbox) {
    try {
      if (item.type === 'session') {
        await pushSessionToCloud(item.payload);
      } else if (item.type === 'exam') {
        await pushExamToCloud(item.payload);
      } else if (item.type === 'mistake') {
        await pushMistakeToCloud(item.payload);
      } else if (item.type === 'plan') {
        await pushPlanToCloud(item.payload);
      } else if (item.type === 'note') {
        await pushNoteToCloud(item.payload);
      } else if (item.type === 'progress') {
        await pushProgressToCloud(item.payload);
      }
    } catch {
      if (item.retryCount < 5) {
        remaining.push({ ...item, retryCount: item.retryCount + 1 });
      }
    }
  }

  saveOutbox(remaining);
  setSyncStatus(remaining.length > 0 ? 'pending' : 'synced');
}
