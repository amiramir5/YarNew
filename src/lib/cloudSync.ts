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
import { studyDayKey } from './jalali';
import {
  loadSessions,
  loadExams,
  loadMistakes,
  loadPlans,
  loadNotes,
  loadProgress,
  loadChecklist,
  loadSettings,
  getUserScopedKey,
  getActiveUserEmail,
} from './storage';
import { mapDatabaseToExam, mapDatabaseToMistake, mapExamToDatabase, mapMistakeToDatabase } from './schemaValidator';
import { sanitizePayload, TABLE_COLUMNS } from './payload';

export { sanitizePayload, TABLE_COLUMNS };

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error';

export interface OutboxItem {
  id: string;
  type: 'session' | 'exam' | 'mistake' | 'plan' | 'note' | 'progress' | 'checklist' | 'settings' | 'backup';
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

const DEAD_LETTER_KEY = 'ky_sync_dead_letter_v2';

export function loadDeadLetter(customEmail?: string): OutboxItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = getUserScopedKey(DEAD_LETTER_KEY, customEmail);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeadLetter(items: OutboxItem[], customEmail?: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = getUserScopedKey(DEAD_LETTER_KEY, customEmail);
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function loadOutbox(customEmail?: string): OutboxItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = getUserScopedKey(OUTBOX_KEY, customEmail);
    let raw = localStorage.getItem(key);
    if (!raw && key !== OUTBOX_KEY) {
      // Fallback check legacy unscoped key once
      raw = localStorage.getItem(OUTBOX_KEY);
    }
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items: OutboxItem[], customEmail?: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = getUserScopedKey(OUTBOX_KEY, customEmail);
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function clearAccountOutbox(customEmail?: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = getUserScopedKey(OUTBOX_KEY, customEmail);
    localStorage.removeItem(key);
  } catch {}
}

export function queueForSync(type: OutboxItem['type'], payload: any) {
  const outbox = loadOutbox();
  const itemId = payload.id || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const existingIndex = outbox.findIndex((item) => item.id === itemId && item.type === type);

  if (existingIndex >= 0) {
    outbox[existingIndex] = {
      id: itemId,
      type,
      payload,
      retryCount: outbox[existingIndex].retryCount,
      addedAt: Date.now(),
    };
  } else {
    outbox.push({
      id: itemId,
      type,
      payload,
      retryCount: 0,
      addedAt: Date.now(),
    });
  }
  saveOutbox(outbox);
  setSyncStatus('pending');
}

export async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return null;
    return data.session.user.id || null;
  } catch {
    return null;
  }
}

/**
 * Upload base64 image to private Supabase Storage bucket 'question-images'
 * File path scoped strictly to authenticated user UID: `${userId}/${cardId}.${ext}`
 */
export async function uploadMistakeImageToStorage(
  cardId: string,
  base64DataUrl: string,
  userId: string
): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !base64DataUrl.startsWith('data:image/') || !userId) return null;

  try {
    const commaIndex = base64DataUrl.indexOf(',');
    if (commaIndex === -1) return null;
    const header = base64DataUrl.slice(0, commaIndex);
    const rawB64 = base64DataUrl.slice(commaIndex + 1);
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    // Validate mime type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validMimes.includes(mimeType)) {
      console.warn('Unsupported image MIME type for upload:', mimeType);
      return null;
    }

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';

    // Decode base64
    const byteCharacters = atob(rawB64);
    if (byteCharacters.length > 10 * 1024 * 1024) {
      console.warn('Image exceeds max allowed size of 10MB.');
      return null;
    }

    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const filePath = `${userId}/${cardId}.${ext}`;
    const { error } = await supabase.storage
      .from('question-images')
      .upload(filePath, byteNumbers, { contentType: mimeType, upsert: true });

    if (error) {
      console.warn('Storage upload error:', error.message);
      return null;
    }
    return filePath;
  } catch (err) {
    console.warn('Failed to upload mistake image to storage:', err);
    return null;
  }
}

/**
 * Resolve mistake image URL (generates signed URL for storage paths)
 */
export async function resolveMistakeImageUrl(rawImage: string | null | undefined): Promise<string | null> {
  if (!rawImage) return null;
  // If already a data URL or absolute web URL, return directly
  if (rawImage.startsWith('data:image/') || rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
    return rawImage;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from('question-images')
      .createSignedUrl(rawImage, 86400); // 24 hours
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Push Session to Supabase
 */
export async function pushSessionToCloud(
  session: Session,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  // If user is not logged in, NEVER send null user_id; preserve locally in outbox
  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('session', session);
    return false;
  }

  setSyncStatus('syncing');
  try {
    const payload = {
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
    };

    const { error } = await supabase.from('sessions').upsert(sanitizePayload('sessions', payload));

    if (error) {
      console.warn('Error pushing session:', error.message);
      if (!options?.skipQueue) queueForSync('session', session);
      setSyncStatus('error');
      return false;
    }
    setSyncStatus('synced');
    return true;
  } catch (err) {
    console.warn('Network error pushing session:', err);
    if (!options?.skipQueue) queueForSync('session', session);
    setSyncStatus('error');
    return false;
  }
}

/**
 * Push Exam to Supabase
 */
export async function pushExamToCloud(
  exam: Exam,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('exam', exam);
    return false;
  }

  setSyncStatus('syncing');
  try {
    const payload = mapExamToDatabase(exam, userId, pairCode, myEmail);

    const { error } = await supabase.from('exams').upsert(sanitizePayload('exams', payload));

    if (error) {
      console.warn('Error pushing exam:', error.message);
      if (!options?.skipQueue) queueForSync('exam', exam);
      setSyncStatus('error');
      return false;
    }
    setSyncStatus('synced');
    return true;
  } catch (err) {
    console.warn('Network error pushing exam:', err);
    if (!options?.skipQueue) queueForSync('exam', exam);
    setSyncStatus('error');
    return false;
  }
}

/**
 * Push Mistake to Supabase with image upload
 */
export async function pushMistakeToCloud(
  card: MistakeCard,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('mistake', card);
    return false;
  }

  setSyncStatus('syncing');
  try {
    let finalImageData = card.image_data || null;
    if (finalImageData && finalImageData.startsWith('data:image/')) {
      const storagePath = await uploadMistakeImageToStorage(card.id, finalImageData, userId);
      if (storagePath) {
        finalImageData = storagePath;
      }
    }

    const payload = mapMistakeToDatabase(card, userId, pairCode, myEmail, finalImageData);

    const { error } = await supabase.from('mistakes').upsert(sanitizePayload('mistakes', payload));

    if (error) {
      console.warn('Error pushing mistake:', error.message);
      if (!options?.skipQueue) queueForSync('mistake', card);
      setSyncStatus('error');
      return false;
    }
    setSyncStatus('synced');
    return true;
  } catch (err) {
    console.warn('Network error pushing mistake:', err);
    if (!options?.skipQueue) queueForSync('mistake', card);
    setSyncStatus('error');
    return false;
  }
}

/**
 * Push Daily Plan to Supabase
 */
export async function pushPlanToCloud(
  plan: DailyPlan,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('plan', plan);
    return false;
  }

  setSyncStatus('syncing');
  try {
    const { error } = await supabase.from('daily_plans').upsert(sanitizePayload('daily_plans', {
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
    }));

    if (error) {
      console.warn('Error pushing plan:', error.message);
      if (!options?.skipQueue) queueForSync('plan', plan);
      setSyncStatus('error');
      return false;
    }
    setSyncStatus('synced');
    return true;
  } catch (err) {
    console.warn('Network error pushing plan:', err);
    if (!options?.skipQueue) queueForSync('plan', plan);
    setSyncStatus('error');
    return false;
  }
}

/**
 * Push Quick Note to Supabase
 */
export async function pushNoteToCloud(
  note: QuickNote,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('note', note);
    return false;
  }

  try {
    const { error } = await supabase.from('quick_notes').upsert(sanitizePayload('quick_notes', {
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
    }));

    if (error) {
      console.warn('Error pushing note:', error.message);
      if (!options?.skipQueue) queueForSync('note', note);
      return false;
    }
    return true;
  } catch (err) {
    if (!options?.skipQueue) queueForSync('note', note);
    return false;
  }
}

/**
 * Push Progress Entry to Supabase
 */
export async function pushProgressToCloud(
  entry: ProgressEntry,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('progress', entry);
    return false;
  }

  try {
    const { error } = await supabase.from('progress_entries').upsert(sanitizePayload('progress_entries', {
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
    }));

    if (error) {
      console.warn('Error pushing progress:', error.message);
      if (!options?.skipQueue) queueForSync('progress', entry);
      return false;
    }
    return true;
  } catch (err) {
    if (!options?.skipQueue) queueForSync('progress', entry);
    return false;
  }
}

/**
 * Push User Checklist to Supabase with stable ID
 */
export async function pushChecklistToCloud(
  day: string,
  checklist: Record<string, boolean>,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('checklist', { id: `chk-${day}-local`, day, items: checklist });
    return false;
  }

  try {
    const stableId = `chk-${day}-${userId ?? 'local'}`;
    const { error } = await supabase.from('user_checklists').upsert(sanitizePayload('user_checklists', {
      id: stableId,
      user_id: userId,
      created_at: Date.now(),
      updated_at: Date.now(),
      user_email: myEmail || null,
      pair_code: pairCode || null,
      day,
      items: checklist,
    }));

    if (error) {
      console.warn('Error pushing checklist:', error.message);
      if (!options?.skipQueue) queueForSync('checklist', { id: stableId, day, items: checklist });
      return false;
    }
    return true;
  } catch {
    if (!options?.skipQueue) queueForSync('checklist', { id: `chk-${day}-${userId ?? 'local'}`, day, items: checklist });
    return false;
  }
}

/**
 * Push the nightly automatic backup snapshot to the cloud `app_backups` table.
 * One row per user (PK user_id) — always holds the newest snapshot. If this
 * fails (offline), the snapshot is queued so it syncs once connectivity returns.
 */
export async function pushAutoBackupToCloud(
  backup: { id?: string; data: any; deviceId?: string; takenAt?: number },
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();

  if (!supabase || !userId || !backup?.data) {
    // Give the queued payload a stable per-day id so repeated retries dedupe
    if (!options?.skipQueue) {
      const day = new Date().toISOString().slice(0, 10);
      queueForSync('backup', { id: backup?.id || `backup-${day}`, ...backup });
    }
    return false;
  }

  try {
    const payload = sanitizePayload('app_backups', {
      user_id: userId,
      device_id: backup.deviceId || 'client',
      created_at: backup.takenAt || Date.now(),
      data: backup.data,
    });
    const { error } = await supabase.from('app_backups').upsert(payload);
    if (error) {
      console.warn('Error pushing auto-backup:', error.message);
      if (!options?.skipQueue) {
        const day = new Date().toISOString().slice(0, 10);
        queueForSync('backup', { id: backup.id || `backup-${day}`, ...backup });
      }
      return false;
    }
    console.info('[Backup] Cloud backup synced.');
    return true;
  } catch (err) {
    console.warn('Network error pushing auto-backup:', err);
    if (!options?.skipQueue) {
      const day = new Date().toISOString().slice(0, 10);
      queueForSync('backup', { id: backup.id || `backup-${day}`, ...backup });
    }
    return false;
  }
}

/**
 * Push App Settings to Supabase (NEVER leaks API keys to cloud)
 */
export async function pushSettingsToCloud(
  settings: AppSettings,
  options?: { skipQueue?: boolean }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const userId = await getAuthUserId();
  const { pairCode, myEmail } = getCoupleSettings();

  if (!supabase || !userId) {
    if (!options?.skipQueue) queueForSync('settings', { id: 'user-settings', ...settings });
    return false;
  }

  try {
    const sanitizedSettings: AppSettings = {
      ...settings,
      ai: {
        ...settings.ai,
        geminiKey: '',
        openrouterKey: '',
      },
    };

    const { error } = await supabase.from('user_settings').upsert(sanitizePayload('user_settings', {
      user_id: userId,
      device_id: settings.deviceId || 'client',
      pair_code: pairCode || null,
      user_email: myEmail || null,
      settings: sanitizedSettings,
      updated_at: Date.now(),
    }));

    if (error) {
      console.warn('Error pushing settings:', error.message);
      if (!options?.skipQueue) queueForSync('settings', { id: 'user-settings', ...settings });
      return false;
    }
    return true;
  } catch (err) {
    if (!options?.skipQueue) queueForSync('settings', { id: 'user-settings', ...settings });
    return false;
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

    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error || !data?.settings) return null;
    return data.settings as AppSettings;
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
  checklist?: Record<string, boolean>;
} | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const userId = await getAuthUserId();
    const { pairCode, myEmail } = getCoupleSettings();
    const targetEmail = (customEmail || myEmail || '').trim().toLowerCase();

    let sQuery = supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(2500);
    let eQuery = supabase.from('exams').select('*').order('created_at', { ascending: false }).limit(1000);
    let mQuery = supabase.from('mistakes').select('*').order('created_at', { ascending: false }).limit(1000);
    let pQuery = supabase.from('daily_plans').select('*').order('created_at', { ascending: false }).limit(365);
    let nQuery = supabase.from('quick_notes').select('*').order('created_at', { ascending: false }).limit(500);
    let prQuery = supabase.from('progress_entries').select('*').order('created_at', { ascending: false }).limit(500);
    let chkQuery = supabase.from('user_checklists').select('*').order('created_at', { ascending: false }).limit(365);

    if (userId) {
      sQuery = sQuery.eq('user_id', userId);
      eQuery = eQuery.eq('user_id', userId);
      mQuery = mQuery.eq('user_id', userId);
      pQuery = pQuery.eq('user_id', userId);
      nQuery = nQuery.eq('user_id', userId);
      prQuery = prQuery.eq('user_id', userId);
      chkQuery = chkQuery.eq('user_id', userId);
    } else if (targetEmail) {
      sQuery = sQuery.eq('user_email', targetEmail);
      eQuery = eQuery.eq('user_email', targetEmail);
      mQuery = mQuery.eq('user_email', targetEmail);
      pQuery = pQuery.eq('user_email', targetEmail);
      nQuery = nQuery.eq('user_email', targetEmail);
      prQuery = prQuery.eq('user_email', targetEmail);
      chkQuery = chkQuery.eq('user_email', targetEmail);
    } else if (pairCode) {
      sQuery = sQuery.eq('pair_code', pairCode);
      eQuery = eQuery.eq('pair_code', pairCode);
      mQuery = mQuery.eq('pair_code', pairCode);
      pQuery = pQuery.eq('pair_code', pairCode);
      nQuery = nQuery.eq('pair_code', pairCode);
      prQuery = prQuery.eq('pair_code', pairCode);
      chkQuery = chkQuery.eq('pair_code', pairCode);
    } else {
      return null;
    }

    const [sessionsRes, examsRes, mistakesRes, plansRes, notesRes, progressRes, chkRes] = await Promise.all([
      sQuery,
      eQuery,
      mQuery,
      pQuery,
      nQuery,
      prQuery,
      chkQuery,
    ]);

    if (sessionsRes.error) console.warn('Sessions cloud fetch notice:', sessionsRes.error.message);
    if (examsRes.error) console.warn('Exams cloud fetch notice:', examsRes.error.message);
    if (mistakesRes.error) console.warn('Mistakes cloud fetch notice:', mistakesRes.error.message);
    if (plansRes.error) console.warn('Plans cloud fetch notice:', plansRes.error.message);
    if (notesRes.error) console.warn('Notes cloud fetch notice:', notesRes.error.message);
    if (progressRes.error) console.warn('Progress cloud fetch notice:', progressRes.error.message);
    if (chkRes.error) console.warn('Checklists cloud fetch notice:', chkRes.error.message);

    const mappedExams = (examsRes.data || []).map(mapDatabaseToExam);
    const mappedMistakes = (mistakesRes.data || []).map(mapDatabaseToMistake);

    const remoteChecklist: Record<string, boolean> = {};
    if (Array.isArray(chkRes.data)) {
      // Merge oldest â†’ newest so newer day rows have the final word
      // (fetch is ordered created_at DESC; naive iteration let older rows clobber newer ones)
      chkRes.data
        .slice()
        .sort((a: any, b: any) => (Number(a?.updated_at) || 0) - (Number(b?.updated_at) || 0))
        .forEach((row: any) => {
          if (row.items && typeof row.items === 'object') {
            Object.assign(remoteChecklist, row.items);
          }
        });
    }

    return {
      sessions: sessionsRes.error ? undefined : (sessionsRes.data || []),
      exams: examsRes.error ? undefined : mappedExams,
      mistakes: mistakesRes.error ? undefined : mappedMistakes,
      plans: plansRes.error ? undefined : (plansRes.data || []),
      notes: notesRes.error ? undefined : (notesRes.data || []),
      progress: progressRes.error ? undefined : (progressRes.data || []),
      checklist: chkRes.error ? undefined : remoteChecklist,
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
export async function fetchPartnerSessions(
  pairCode: string,
  partnerEmail?: string,
  partnerUserId?: string
): Promise<Session[]> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase || !pairCode) return [];
    let q = supabase
      .from('sessions')
      .select('*')
      .eq('pair_code', pairCode)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (partnerUserId) {
      q = q.eq('user_id', partnerUserId);
    } else if (partnerEmail) {
      q = q.eq('user_email', partnerEmail.trim().toLowerCase());
    }

    const { data, error } = await q;
    if (error) {
      console.warn('Error fetching partner sessions:', error.message);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Flush offline outbox queue with atomic success tracking (never overwrites newly queued items)
 */
export async function flushOutboxQueue(): Promise<void> {
  let currentOutbox = loadOutbox();
  if (currentOutbox.length === 0) {
    setSyncStatus('synced');
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    setSyncStatus('pending');
    return;
  }

  const userId = await getAuthUserId();
  if (!userId) {
    setSyncStatus('pending');
    return;
  }

  setSyncStatus('syncing');
  // Give parked dead-letter items another chance while we are online
  retryDeadLetterQueue();
  currentOutbox = loadOutbox();
  if (currentOutbox.length === 0) {
    setSyncStatus('synced');
    return;
  }
  const flushedAtMs = Date.now();
  const succeededIds = new Set<string>();
  const pushedPayloadTimes = new Map<string, number>();
  const failedIncrements = new Map<string, number>();

  for (const item of currentOutbox) {
    try {
      let success = false;
      if (item.type === 'session') {
        success = await pushSessionToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'exam') {
        success = await pushExamToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'mistake') {
        success = await pushMistakeToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'plan') {
        success = await pushPlanToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'note') {
        success = await pushNoteToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'progress') {
        success = await pushProgressToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'checklist') {
        success = await pushChecklistToCloud(item.payload.day, item.payload.items, { skipQueue: true });
      } else if (item.type === 'settings') {
        success = await pushSettingsToCloud(item.payload, { skipQueue: true });
      } else if (item.type === 'backup') {
        // Backup payloads carry their own 'data' envelope; retries are cheap
        success = await pushAutoBackupToCloud(item.payload, { skipQueue: true });
      }

      if (success) {
        succeededIds.add(item.id);
        pushedPayloadTimes.set(item.id, Number(item.payload?.updated_at) || item.addedAt);
      } else {
        failedIncrements.set(item.id, (item.retryCount || 0) + 1);
      }
    } catch {
      failedIncrements.set(item.id, (item.retryCount || 0) + 1);
    }
  }

  // Atomically update outbox queue from fresh storage
  const freshOutbox = loadOutbox();
  const deadLetters = loadDeadLetter();
  const newlyDead: OutboxItem[] = [];

  const updatedOutbox = freshOutbox
    .filter((item) => {
      if (!succeededIds.has(item.id)) return true;
      // Race guard: if a *newer* payload for the same record was queued while we
      // were flushing the stale snapshot, keep it â€” never drop fresh data.
      const pushedTime = pushedPayloadTimes.get(item.id) ?? 0;
      const freshTime = Number(item.payload?.updated_at) || item.addedAt;
      return freshTime > pushedTime;
    })
    .map((item) => {
      const increment = failedIncrements.get(item.id);
      if (increment !== undefined) {
        return { ...item, retryCount: increment };
      }
      return item;
    })
    .filter((item) => {
      if (item.retryCount > 5) {
        newlyDead.push(item);
        return false;
      }
      return true;
    });

  if (newlyDead.length > 0) {
    saveDeadLetter([...deadLetters, ...newlyDead]);
    console.warn(`[Sync] Moved ${newlyDead.length} failed item(s) to dead-letter queue for recovery.`);
  }

  saveOutbox(updatedOutbox);
  setSyncStatus(updatedOutbox.length > 0 ? 'pending' : 'synced');
}

/**
 * Retry dead-letter queue items once network is back (called alongside flush on reconnect).
 */
export function retryDeadLetterQueue(): void {
  const dead = loadDeadLetter();
  if (dead.length === 0) return;
  const outbox = loadOutbox();
  const restored = dead.map((item) => ({ ...item, retryCount: 0 }));
  const merged = [...outbox];
  for (const item of restored) {
    const idx = merged.findIndex((m) => m.id === item.id && m.type === item.type);
    if (idx >= 0) merged[idx] = item;
    else merged.push(item);
  }
  saveOutbox(merged);
  saveDeadLetter([]);
  setSyncStatus('pending');
}

/**
 * Migrate and synchronize all local data to cloud on first login (with proper user_id)
 */
export async function syncAllLocalDataToCloud(userId: string): Promise<void> {
  if (!userId) return;

  const migrationKey = `ky_local_data_migrated_${userId}`;
  if (typeof window !== 'undefined' && localStorage.getItem(migrationKey) === 'true') {
    return;
  }

  try {
    let pushFailures = 0;
    const push = async (result: Promise<boolean>) => {
      if (!(await result)) pushFailures++;
    };

    const sessions = loadSessions();
    for (const s of sessions) {
      await push(pushSessionToCloud(s));
    }
    const exams = loadExams();
    for (const e of exams) {
      await push(pushExamToCloud(e));
    }
    const mistakes = loadMistakes();
    for (const m of mistakes) {
      await push(pushMistakeToCloud(m));
    }
    const plans = loadPlans();
    for (const p of plans) {
      await push(pushPlanToCloud(p));
    }
    const notes = loadNotes();
    for (const n of notes) {
      await push(pushNoteToCloud(n));
    }
    const progress = loadProgress();
    for (const pr of progress) {
      await push(pushProgressToCloud(pr));
    }
    const checklist = loadChecklist();
    if (checklist && Object.keys(checklist).length > 0) {
      await push(pushChecklistToCloud(studyDayKey(), checklist));
    }
    const settings = loadSettings();
    if (settings) {
      await push(pushSettingsToCloud(settings));
    }

    // Only mark migration complete when every push succeeded â€” a partial success
    // flag used to strand pre-login data forever on a mid-migration network drop.
    if (pushFailures === 0 && typeof window !== 'undefined') {
      localStorage.setItem(migrationKey, 'true');
    } else if (pushFailures > 0) {
      console.warn(`[Sync] Initial data migration incomplete: ${pushFailures} item(s) failed and remain queued.`);
    }
  } catch (err) {
    console.warn('Initial data migration notice:', err);
  }
}


