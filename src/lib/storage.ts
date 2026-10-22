import {
  AppSettings,
  DailyPlan,
  Exam,
  MistakeCard,
  ProgressEntry,
  QuickNote,
  Session,
  StudyResource,
} from '../types';
import { DEFAULT_EXAM_DATE, DEFAULT_EXAM_TITLE } from './constants';
import { studyDayKey } from './jalali';

const STORAGE_KEYS = {
  SESSIONS: 'ky_sessions_v2',
  EXAMS: 'ky_exams_v2',
  MISTAKES: 'ky_mistakes_v2',
  PLANS: 'ky_plans_v2',
  NOTES: 'ky_notes_v2',
  PROGRESS: 'ky_progress_v2',
  SETTINGS: 'ky_settings_v2',
  CHECKLIST: 'ky_checklist_v2',
  TIMER_STATE: 'ky_timer_state_v2',
  RESOURCES: 'ky_resources_v2',
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'ky-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const;

export const ALLOWED_OPENROUTER_MODELS = [
  'minimax/minimax-m3.1-flash:free',
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'thinkingmachines/inkling-small:free',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-r1',
  'meta-llama/llama-3.3-70b-instruct',
] as const;

export const ALLOWED_OPENROUTER_FREE_DEFAULT = 'minimax/minimax-m3.1-flash:free';

export function getDefaultSettings(): AppSettings {
  return {
    theme: 'light',
    examDate: DEFAULT_EXAM_DATE,
    examTitle: DEFAULT_EXAM_TITLE,
    dailyGoalMinutes: 600, // 10 hours
    dailyGoalTests: 100,
    soundEnabled: true,
    vibrationEnabled: true,
    deviceId: uid(),
    ai: {
      provider: 'gemini',
      geminiKey: '',
      geminiModel: 'gemini-3.5-flash',
      autoRotation: true,
      proactiveEnabled: true,
      poofyMode: 'dynamic',
      poofyPosition: 'left',
    },
  };
}

// Active user scoping helper
export function getActiveUserEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('ky_authenticated_user_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.email) return parsed.email.trim().toLowerCase();
    }
    const coupleRaw = localStorage.getItem('ky_couple_my_email_v4');
    if (coupleRaw) return coupleRaw.trim().toLowerCase();
  } catch {}
  return '';
}

export function getUserScopedKey(baseKey: string, customEmail?: string): string {
  const email = customEmail !== undefined ? customEmail.trim().toLowerCase() : getActiveUserEmail();
  if (!email) return baseKey;
  // Sanitize key — encodeURIComponent is lossless & collision-free, unlike the old regex
  // that mapped different emails (a+b@x.com vs a_b@x.com) onto the same storage key.
  const safe = encodeURIComponent(email).replace(/%/g, '_');
  const scopedKey = `${baseKey}__${safe}`;

  // One-time migration: copy data stored under the legacy sanitized key to the new one
  if (typeof window !== 'undefined' && !localStorage.getItem(scopedKey)) {
    const legacySafe = email.replace(/[^a-zA-Z0-9_@.-]/g, '_');
    const legacyKey = `${baseKey}__${legacySafe}`;
    if (legacyKey !== scopedKey) {
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        try {
          localStorage.setItem(scopedKey, raw);
        } catch {}
      }
    }
  }

  return scopedKey;
}

// Local Storage Wrappers with Safe JSON Parse
export function getStored<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Error reading key ${key}:`, err);
    return defaultValue;
  }
}

export function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err: any) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.number === -2147024882)) {
      console.warn(`[Storage] Quota exceeded writing key ${key}. Suppressing crash and retaining state.`);
    } else {
      console.warn(`Error writing key ${key}:`, err);
    }
  }
}

// Specific Getters & Setters with User Scoping and Pre-Login Migration
export function loadSessions(customEmail?: string): Session[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.SESSIONS, customEmail);
  const data = getStored<Session[]>(scopedKey, []);
  if (data.length > 0) return data;

  // Fallback to legacy unscoped key if available, and auto-migrate to scoped key
  const legacy = getStored<Session[]>(STORAGE_KEYS.SESSIONS, []);
  if (legacy.length > 0) {
    setStored(scopedKey, legacy);
    return legacy;
  }
  return [];
}
export function saveSessions(sessions: Session[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.SESSIONS, customEmail);
  setStored(scopedKey, sessions);
}

export function loadExams(customEmail?: string): Exam[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.EXAMS, customEmail);
  const data = getStored<Exam[]>(scopedKey, []);
  if (data.length > 0) return data;

  const legacy = getStored<Exam[]>(STORAGE_KEYS.EXAMS, []);
  if (legacy.length > 0) {
    setStored(scopedKey, legacy);
    return legacy;
  }
  return [];
}
export function saveExams(exams: Exam[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.EXAMS, customEmail);
  setStored(scopedKey, exams);
}

export function loadMistakes(customEmail?: string): MistakeCard[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.MISTAKES, customEmail);
  const data = getStored<MistakeCard[]>(scopedKey, []);
  if (data.length > 0) return data;

  const legacy = getStored<MistakeCard[]>(STORAGE_KEYS.MISTAKES, []);
  if (legacy.length > 0) {
    setStored(scopedKey, legacy);
    return legacy;
  }
  return [];
}
export function saveMistakes(mistakes: MistakeCard[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.MISTAKES, customEmail);
  setStored(scopedKey, mistakes);
}

export function loadPlans(customEmail?: string): DailyPlan[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.PLANS, customEmail);
  const data = getStored<DailyPlan[]>(scopedKey, []);
  if (data.length > 0) return data;

  const legacy = getStored<DailyPlan[]>(STORAGE_KEYS.PLANS, []);
  if (legacy.length > 0) {
    setStored(scopedKey, legacy);
    return legacy;
  }
  return [];
}
export function savePlans(plans: DailyPlan[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.PLANS, customEmail);
  setStored(scopedKey, plans);
}

export function loadNotes(customEmail?: string): QuickNote[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.NOTES, customEmail);
  const data = getStored<QuickNote[]>(scopedKey, []);
  if (data.length > 0) return data;

  const legacy = getStored<QuickNote[]>(STORAGE_KEYS.NOTES, []);
  if (legacy.length > 0) {
    setStored(scopedKey, legacy);
    return legacy;
  }
  return [];
}
export function saveNotes(notes: QuickNote[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.NOTES, customEmail);
  setStored(scopedKey, notes);
}

export function loadProgress(customEmail?: string): ProgressEntry[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.PROGRESS, customEmail);
  const data = getStored<ProgressEntry[]>(scopedKey, []);
  if (data.length > 0) return data;

  const legacy = getStored<ProgressEntry[]>(STORAGE_KEYS.PROGRESS, []);
  if (legacy.length > 0) {
    setStored(scopedKey, legacy);
    return legacy;
  }
  return [];
}
export function saveProgress(progress: ProgressEntry[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.PROGRESS, customEmail);
  setStored(scopedKey, progress);
}

export function loadSettings(customEmail?: string): AppSettings {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.SETTINGS, customEmail);
  let current = getStored<any>(scopedKey, null);
  if (!current && scopedKey !== STORAGE_KEYS.SETTINGS) {
    current = getStored<any>(STORAGE_KEYS.SETTINGS, null);
  }
  const defaults = getDefaultSettings();
  if (!current) {
    current = defaults;
  }

  const savedModel = current?.ai?.geminiModel;
  const validModel =
    typeof savedModel === 'string' && (ALLOWED_GEMINI_MODELS as readonly string[]).includes(savedModel)
      ? savedModel
      : defaults.ai.geminiModel;

  const savedOpenrouterModel = current?.ai?.openrouterModel;
  const validOpenrouterModel =
    typeof savedOpenrouterModel === 'string' && savedOpenrouterModel.trim()
      ? savedOpenrouterModel.trim()
      : ALLOWED_OPENROUTER_FREE_DEFAULT;

  const merged: AppSettings = {
    ...defaults,
    ...current,
    ai: {
      provider: current?.ai?.provider === 'openrouter' ? 'openrouter' : 'gemini',
      geminiKey: typeof current?.ai?.geminiKey === 'string' ? current.ai.geminiKey : defaults.ai.geminiKey,
      geminiModel: validModel,
      ...(current?.ai?.openrouterKey ? { openrouterKey: current.ai.openrouterKey } : {}),
      openrouterModel: validOpenrouterModel,
      autoRotation: current?.ai?.autoRotation !== false,
      proactiveEnabled: current?.ai?.proactiveEnabled !== undefined ? Boolean(current.ai.proactiveEnabled) : true,
      poofyMode: current?.ai?.poofyMode || 'dynamic',
      poofyPosition: current?.ai?.poofyPosition || 'left',
      ...(current?.ai?.coachPlanGoal ? { coachPlanGoal: current.ai.coachPlanGoal } : {}),
    },
  };
  return merged;
}
export function saveSettings(settings: AppSettings, customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.SETTINGS, customEmail);
  setStored(scopedKey, settings);
  const email = customEmail !== undefined ? customEmail.trim().toLowerCase() : getActiveUserEmail();
  if (!email) {
    setStored(STORAGE_KEYS.SETTINGS, settings);
  }
}

export function loadStudyResources(customEmail?: string): StudyResource[] {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.RESOURCES, customEmail);
  return getStored<StudyResource[]>(scopedKey, []);
}

export function saveStudyResources(resources: StudyResource[], customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.RESOURCES, customEmail);
  setStored(scopedKey, resources);
}

export function loadChecklist(customEmail?: string): Record<string, boolean> {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.CHECKLIST, customEmail);
  let res = getStored<Record<string, boolean> | null>(scopedKey, null);
  if (!res && scopedKey !== STORAGE_KEYS.CHECKLIST) {
    res = getStored<Record<string, boolean> | null>(STORAGE_KEYS.CHECKLIST, null);
  }
  return res || {};
}
export function saveChecklist(checklist: Record<string, boolean>, customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.CHECKLIST, customEmail);
  setStored(scopedKey, checklist);
  const email = customEmail !== undefined ? customEmail.trim().toLowerCase() : getActiveUserEmail();
  if (!email) {
    setStored(STORAGE_KEYS.CHECKLIST, checklist);
  }
}

export interface StoredTimerState {
  subject: string;
  status: 'idle' | 'running' | 'paused';
  started_at: number | null;
  accumulated_ms: number;
  day: string;
}

export function loadTimerState(customEmail?: string): StoredTimerState | null {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.TIMER_STATE, customEmail);
  return getStored<StoredTimerState | null>(scopedKey, null);
}
export function saveTimerState(state: StoredTimerState | null, customEmail?: string): void {
  const scopedKey = getUserScopedKey(STORAGE_KEYS.TIMER_STATE, customEmail);
  setStored(scopedKey, state);
}

// Full Export / Import

/**
 * Build the full backup payload. `stripImages` drops inline data-URL images
 * (the usual multi-MB offender) so snapshots fit comfortably in localStorage.
 */
export function buildBackupPayload(stripImages = false, stripHistory = false) {
  let settings = loadSettings();
  if (!settings) return null;
  // Clean all sensitive provider keys from export
  const safeSettings = {
    ...settings,
    ai: {
      ...settings.ai,
      geminiKey: '',
      openrouterKey: '',
    },
  };

  const mistakes: MistakeCard[] = loadMistakes().map((m) => {
    const copy: any = { ...m };
    if (stripImages) copy.image_data = null;
    if (stripHistory) copy.history = [];
    return copy as MistakeCard;
  });

  return {
    app: 'konkoor-yar-2.0',
    version: 2,
    exported_at: new Date().toISOString(),
    data: {
      settings: safeSettings,
      sessions: loadSessions(),
      exams: loadExams(),
      mistakes,
      plans: loadPlans(),
      notes: loadNotes(),
      progress: loadProgress(),
      checklist: loadChecklist(),
      resources: loadStudyResources(),
    },
  };
}

export function exportAllDataJson(): void {
  const payload = buildBackupPayload();
  if (!payload) return;

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `konkooryar-backup-${studyDayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Automatic nightly backups (local rolling 7-day window + optional cloud copy)
// ---------------------------------------------------------------------------
const AUTO_BACKUP_META_KEY = 'ky_auto_backup_meta_v1';
const AUTO_BACKUP_SLOTS = 7;
const AUTO_BACKUP_BUDGET = 2_500_000; // JSON chars, below the ~5MB quota

export interface AutoBackupMeta {
  day: string;
  takenAt: number;
  slot: string;
  sizeBytes: number;
  strippedImages: boolean;
}

function autoBackupSlotKey(dayKey: string, stripFlag: string): string {
  // Weekly rotation: one slot per weekday — 7 snapshots cover the last week
  const weekday = new Date().getDay();
  return `ky_auto_backup_v1__${weekday}${stripFlag}`;
}

function autoBackupMeta(customEmail?: string): AutoBackupMeta | null {
  const key = getUserScopedKey(AUTO_BACKUP_META_KEY, customEmail);
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AutoBackupMeta) : null;
  } catch {
    return null;
  }
}

function writeAutoBackupMeta(meta: AutoBackupMeta, customEmail?: string) {
  const key = getUserScopedKey(AUTO_BACKUP_META_KEY, customEmail);
  try {
    localStorage.setItem(key, JSON.stringify(meta));
  } catch {}
}

export function getAutoBackupInfo(customEmail?: string): {
  meta: AutoBackupMeta | null;
  slots: Array<{ slot: string; exists: boolean; sizeBytes: number; exportedAt: string | null }>;
} {
  if (typeof window === 'undefined') return { meta: null, slots: [] };
  const slots = [];
  for (let weekday = 0; weekday < AUTO_BACKUP_SLOTS; weekday++) {
    for (const suffix of ['', '__imgstrip']) {
      const slot = `ky_auto_backup_v1__${weekday}${suffix}`;
      const key = getUserScopedKey(slot, customEmail);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let exportedAt: string | null = null;
      try {
        exportedAt = String(JSON.parse(raw)?.exported_at) || null;
      } catch {}
      slots.push({ slot, exists: true, sizeBytes: raw.length, exportedAt });
    }
  }
  return { meta: autoBackupMeta(customEmail), slots };
}

/**
 * Take one snapshot per study-day (nightly). Runs the strip ladder when quota
 * pressure hits. Returns the meta on success (dedupe by meta.day), null when
 * nothing was taken.
 */
export function runNightlyAutoBackup(customEmail?: string): AutoBackupMeta | null {
  if (typeof window === 'undefined') return null;
  const dayKey = studyDayKey();
  const prev = autoBackupMeta(customEmail);
  if (prev?.day === dayKey) return null; // already backed up today

  const attempts: Array<{ stripImages: boolean; stripHistory: boolean }> = [
    { stripImages: false, stripHistory: false },
    { stripImages: true, stripHistory: false },
    { stripImages: true, stripHistory: true },
  ];
  for (const attempt of attempts) {
    const payload = buildBackupPayload(attempt.stripImages, attempt.stripHistory);
    if (!payload) return null;
    const json = JSON.stringify(payload);
    if (json.length > AUTO_BACKUP_BUDGET) continue;
    const slot = autoBackupSlotKey(dayKey, attempt.stripImages ? '__imgstrip' : '');
    try {
      localStorage.setItem(getUserScopedKey(slot, customEmail), json);
      const meta: AutoBackupMeta = {
        day: dayKey,
        takenAt: Date.now(),
        slot: `${new Date().getDay()}${attempt.stripImages ? '__imgstrip' : ''}`,
        sizeBytes: json.length,
        strippedImages: attempt.stripImages,
      };
      writeAutoBackupMeta(meta, customEmail);
      return meta;
    } catch {
      // quota — try the next strip level (slot key differs per level)
    }
  }
  console.warn('[AutoBackup] Snapshot exceeds localStorage budget even after stripping.');
  return null;
}

/**
 * Restore one auto-backup slot through the standard importer.
 */
export function restoreAutoBackupFromSlot(slot: string, customEmail?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(getUserScopedKey(slot, customEmail));
    if (!raw) return false;
    return importAllDataJson(raw);
  } catch {
    return false;
  }
}

export function importAllDataJson(jsonText: string): boolean {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !parsed.data) {
      throw new Error('فرمت فایل پشتیبان نامعتبر است');
    }
    const d = parsed.data;

    if (Array.isArray(d.sessions)) saveSessions(d.sessions);
    if (Array.isArray(d.exams)) saveExams(d.exams);
    if (Array.isArray(d.mistakes)) saveMistakes(d.mistakes);
    if (Array.isArray(d.plans)) savePlans(d.plans);
    if (Array.isArray(d.notes)) saveNotes(d.notes);
    if (Array.isArray(d.progress)) saveProgress(d.progress);
    if (d.checklist && typeof d.checklist === 'object') saveChecklist(d.checklist);
    if (Array.isArray(d.resources)) saveStudyResources(d.resources);

    if (d.settings) {
      const cur = loadSettings();
      saveSettings({
        ...cur,
        ...d.settings,
        // Preserve local API keys safely
        ai: {
          ...cur.ai,
          ...(d.settings.ai || {}),
          geminiKey: cur.ai.geminiKey,
          openrouterKey: cur.ai.openrouterKey,
        },
      });
    }

    return true;
  } catch (err) {
    console.error('Import error:', err);
    return false;
  }
}

// CSV Export (Excel Compatible with UTF-8 BOM & Formula Injection Defense)
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (v: any) => {
    let s = String(v ?? '');
    // Neutralize formula injection characters (=, +, -, @, tab, cr) for spreadsheet readers
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const content =
    '\uFEFF' +
    headers.map(escapeCell).join(',') +
    '\n' +
    rows.map((row) => row.map(escapeCell).join(',')).join('\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSessionsCsv(sessions: Session[]): void {
  const headers = ['تاریخ', 'درس', 'فصل', 'نوع مطالعه', 'مدت (دقیقه)', 'درست', 'غلط', 'نزده', 'درصد', 'یادداشت'];
  const rows = sessions.map((s) => {
    const total = s.correct + s.wrong + s.blank;
    const pct = total > 0 ? (((3 * s.correct - s.wrong) / (3 * total)) * 100).toFixed(1) : '—';
    return [
      s.day,
      s.subject,
      s.chapter || '',
      s.type || '',
      Math.round(s.seconds / 60),
      s.correct,
      s.wrong,
      s.blank,
      pct,
      s.note || '',
    ];
  });
  downloadCsv(`konkoor-sessions-${studyDayKey()}.csv`, headers, rows);
}

export function exportExamsCsv(exams: Exam[]): void {
  const headers = ['تاریخ', 'درس', 'درست', 'غلط', 'نزده', 'زمان (دقیقه)', 'درصد نهایی', 'توضیحات'];
  const rows = exams.map((e) => [
    e.day,
    e.subject,
    e.correct,
    e.wrong,
    e.blank,
    e.duration,
    e.percent.toFixed(1) + '٪',
    e.note || '',
  ]);
  downloadCsv(`konkoor-exams-${studyDayKey()}.csv`, headers, rows);
}

export function exportMistakesCsv(mistakes: MistakeCard[]): void {
  const headers = ['مرحله لایتنر', 'اهمیت', 'درس', 'فصل', 'علت اشتباه', 'صورت سوال', 'منبع', 'تاریخ مرور بعدی'];
  const rows = mistakes.map((m) => [
    m.box,
    m.importance,
    m.subject,
    m.chapter || '',
    m.cause,
    m.question.replace(/\s+/g, ' '),
    m.source || '',
    m.next_review,
  ]);
  downloadCsv(`konkoor-mistakes-${studyDayKey()}.csv`, headers, rows);
}
