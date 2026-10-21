import { getSupabaseClient } from './supabase';
import { studyDayKey } from './jalali';
import { sanitizePayload } from './payload';

export interface CoupleMemberState {
  role: 'husband' | 'wife';
  name: string;
  avatar: string;
  isStudying: boolean;
  online: boolean;
  subject: string;
  subjectName: string;
  timerStartedAt?: number | null;
  accumulatedSeconds?: number;
  sessionElapsedSeconds: number;
  todaySeconds: number;
  todayTests: number;
  studyDay: string;
  lastHeartbeat: number;
}

export interface CoupleSettings {
  myRole: 'husband' | 'wife';
  pairCode: string;
  myName: string;
  partnerName: string;
  myEmail: string;
  partnerEmail: string;
  simulationEnabled: boolean;
}

const STORAGE_KEYS = {
  ROLE: 'ky_couple_my_role_v4',
  PAIR_CODE: 'ky_couple_pair_code_v4',
  MY_NAME: 'ky_couple_my_name_v4',
  PARTNER_NAME: 'ky_couple_partner_name_v4',
  MY_EMAIL: 'ky_couple_my_email_v4',
  PARTNER_EMAIL: 'ky_couple_partner_email_v4',
  SIMULATION_ENABLED: 'ky_couple_simulation_v4',
  PARTNER_STATE: 'ky_couple_partner_state_v4',
  MY_STATE: 'ky_couple_my_state_v4',
  SERVER_OFFSET: 'ky_server_time_offset_ms',
};

export const DEFAULT_HUSBAND_NAME = 'کاربر ۱';
export const DEFAULT_WIFE_NAME = 'کاربر ۲';
export const DEFAULT_PAIR_CODE = '';

let serverClockOffsetMs: number | null = null;

export function getServerOffset(): number {
  if (typeof window !== 'undefined' && serverClockOffsetMs === null) {
    const stored = localStorage.getItem(STORAGE_KEYS.SERVER_OFFSET);
    serverClockOffsetMs = stored ? parseInt(stored, 10) || 0 : 0;
  }
  return serverClockOffsetMs ?? 0;
}

export function setServerOffset(offset: number) {
  serverClockOffsetMs = offset;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SERVER_OFFSET, String(offset));
  }
}

export function resolveNameFromRole(role: 'husband' | 'wife', customName?: string): string {
  if (customName && customName.trim()) return customName.trim();
  return role === 'husband' ? DEFAULT_HUSBAND_NAME : DEFAULT_WIFE_NAME;
}

export function getCoupleSettings(): CoupleSettings {
  if (typeof window === 'undefined') {
    return {
      myRole: 'husband',
      pairCode: '',
      myName: DEFAULT_HUSBAND_NAME,
      partnerName: DEFAULT_WIFE_NAME,
      myEmail: '',
      partnerEmail: '',
      simulationEnabled: false,
    };
  }

  const role = (localStorage.getItem(STORAGE_KEYS.ROLE) as 'husband' | 'wife') || 'husband';
  const pairCode = localStorage.getItem(STORAGE_KEYS.PAIR_CODE) || '';

  const myEmail = localStorage.getItem(STORAGE_KEYS.MY_EMAIL) || '';
  const partnerEmail = localStorage.getItem(STORAGE_KEYS.PARTNER_EMAIL) || '';

  const storedMyName = localStorage.getItem(STORAGE_KEYS.MY_NAME);
  const storedPartnerName = localStorage.getItem(STORAGE_KEYS.PARTNER_NAME);

  const myName = storedMyName?.trim() || (role === 'husband' ? DEFAULT_HUSBAND_NAME : DEFAULT_WIFE_NAME);
  const partnerName = storedPartnerName?.trim() || (role === 'husband' ? DEFAULT_WIFE_NAME : DEFAULT_HUSBAND_NAME);
  const simulationEnabled = localStorage.getItem(STORAGE_KEYS.SIMULATION_ENABLED) === 'true';

  return { myRole: role, pairCode, myName, partnerName, myEmail, partnerEmail, simulationEnabled };
}

export function saveCoupleSettings(settings: Partial<CoupleSettings>): void {
  if (typeof window === 'undefined') return;

  const prev = getCoupleSettings();
  const role = settings.myRole || prev.myRole;
  const pairCode = settings.pairCode !== undefined ? settings.pairCode.trim().toUpperCase() : prev.pairCode;

  localStorage.setItem(STORAGE_KEYS.ROLE, role);
  localStorage.setItem(STORAGE_KEYS.PAIR_CODE, pairCode);

  const myName = settings.myName !== undefined ? settings.myName.trim() : prev.myName;
  const partnerName = settings.partnerName !== undefined ? settings.partnerName.trim() : prev.partnerName;
  const myEmail = settings.myEmail !== undefined ? settings.myEmail.trim().toLowerCase() : prev.myEmail;
  const partnerEmail = settings.partnerEmail !== undefined ? settings.partnerEmail.trim().toLowerCase() : prev.partnerEmail;

  localStorage.setItem(STORAGE_KEYS.MY_NAME, myName);
  localStorage.setItem(STORAGE_KEYS.PARTNER_NAME, partnerName);
  localStorage.setItem(STORAGE_KEYS.MY_EMAIL, myEmail);
  localStorage.setItem(STORAGE_KEYS.PARTNER_EMAIL, partnerEmail);

  if (settings.simulationEnabled !== undefined) {
    localStorage.setItem(STORAGE_KEYS.SIMULATION_ENABLED, String(settings.simulationEnabled));
  }

  // Only dispatch profile switched event if email or identity actually changed
  if (settings.myEmail !== undefined && settings.myEmail !== prev.myEmail) {
    try {
      window.dispatchEvent(
        new CustomEvent('konkoor_profile_switched', {
          detail: { role, name: myName, email: myEmail, partnerName, partnerEmail, pairCode },
        })
      );
    } catch {}
  }
}

/**
 * Create a new duo room using the secure crypto RPC create_pair
 */
export async function createPairRoom(): Promise<{
  ok: boolean;
  data?: { pair_code: string; invite_code: string; role: 'husband' | 'wife'; expires_at: string };
  error?: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: 'ارتباط با پایگاه داده Supabase برقرار نیست.' };
  }

  try {
    const { data, error } = await supabase.rpc('create_pair');
    if (error) {
      return { ok: false, error: error.message || 'خطا در ایجاد اتاق دونفره.' };
    }

    if (data && data.pair_code) {
      saveCoupleSettings({
        pairCode: data.pair_code,
        myRole: data.role || 'husband',
      });
      return { ok: true, data };
    }
    return { ok: false, error: 'پاسخ نامعتبر از سرور.' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطا در برقراری ارتباط با سرور.' };
  }
}

/**
 * Join an existing duo room with a single-use invite code using the secure join_pair RPC
 */
export async function joinPairRoom(inviteCode: string): Promise<{
  ok: boolean;
  data?: { pair_code: string; role: 'husband' | 'wife' };
  error?: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: 'ارتباط با پایگاه داده Supabase برقرار نیست.' };
  }

  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return { ok: false, error: 'لطفاً کد دعوت را وارد نمایید.' };
  }

  try {
    const { data, error } = await supabase.rpc('join_pair', { p_invite_code: cleanCode });
    if (error) {
      return { ok: false, error: error.message || 'کد دعوت نامعتبر است یا منقضی شده است.' };
    }

    if (data && data.pair_code) {
      saveCoupleSettings({
        pairCode: data.pair_code,
        myRole: data.role || 'wife',
      });
      return { ok: true, data };
    }
    return { ok: false, error: 'پاسخ نامعتبر از سرور.' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطا در پیوستن به اتاق.' };
  }
}

/**
 * Leave current duo room using leave_pair RPC
 */
export async function leavePairRoom(): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    saveCoupleSettings({ pairCode: '', partnerEmail: '', partnerName: '' });
    return { ok: true };
  }

  try {
    const { error } = await supabase.rpc('leave_pair');
    if (error) {
      console.warn('RPC leave_pair notice:', error.message);
    }
    saveCoupleSettings({ pairCode: '', partnerEmail: '', partnerName: '' });
    if (sharedPairChannel) {
      try {
        supabase.removeChannel(sharedPairChannel);
      } catch {}
      sharedPairChannel = null;
      channelSubscribed = false;
    }
    return { ok: true };
  } catch {
    saveCoupleSettings({ pairCode: '', partnerEmail: '', partnerName: '' });
    return { ok: true };
  }
}

/**
 * Regenerate duo invitation code using regenerate_invite RPC
 */
export async function regenerateInviteCode(): Promise<{
  ok: boolean;
  invite_code?: string;
  expires_at?: string;
  error?: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: 'ارتباط با پایگاه داده Supabase برقرار نیست.' };
  }

  try {
    const { data, error } = await supabase.rpc('regenerate_invite');
    if (error) {
      return { ok: false, error: error.message || 'خطا در تولید مجدد کد دعوت.' };
    }
    if (data?.ok && data.invite_code) {
      return { ok: true, invite_code: data.invite_code, expires_at: data.expires_at };
    }
    return { ok: false, error: 'پاسخ نامعتبر از سرور.' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در اتصال به سرور.' };
  }
}

/**
 * Fetch current pair status from get_my_pair_status RPC
 */
export async function fetchMyPairStatus(): Promise<{
  inPair: boolean;
  pairCode?: string;
  role?: 'husband' | 'wife';
  inviteCode?: string;
  expiresAt?: string;
  memberCount?: number;
  partnerName?: string;
  partnerEmail?: string;
} | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc('get_my_pair_status');
    if (error) {
      console.warn('get_my_pair_status error:', error.message);
      return null; // Return null on network error to distinguish from confirmed not in pair!
    }

    if (data && data.in_pair && data.pair_code) {
      saveCoupleSettings({
        pairCode: data.pair_code,
        myRole: data.role || 'husband',
        partnerName: data.partner_name || undefined,
        partnerEmail: data.partner_email || undefined,
      });

      return {
        inPair: true,
        pairCode: data.pair_code,
        role: data.role,
        inviteCode: data.invite_code,
        expiresAt: data.expires_at,
        memberCount: data.member_count,
        partnerName: data.partner_name,
        partnerEmail: data.partner_email,
      };
    } else if (data && data.in_pair === false) {
      // Confirmed not in pair by server
      saveCoupleSettings({ pairCode: '', partnerEmail: '', partnerName: '' });
      localStorage.removeItem(STORAGE_KEYS.PARTNER_STATE);
      return { inPair: false };
    }
    return null;
  } catch {
    return null; // Network error
  }
}

/**
 * Unified calculation of live partner state from a database row.
 * Eliminates duplication between fetchRemotePartnerState and postgres_changes realtime handler.
 * Fixes double-counting bug in todaySeconds and handles background study timer (up to 3 hours).
 */
export function computePartnerLive(
  row: any,
  settings: CoupleSettings,
  correctedNow: number
): CoupleMemberState {
  const partnerRole = settings.myRole === 'husband' ? 'wife' : 'husband';
  const defaultSubject = partnerRole === 'wife' ? 'زیست‌شناسی' : 'شیمی';

  const updatedAtMs =
    typeof row?.updated_at === 'number'
      ? row.updated_at
      : row?.updated_at
      ? new Date(row.updated_at).getTime()
      : correctedNow;

  const diffMs = Math.max(0, correctedNow - updatedAtMs);

  const rawStudying = Boolean(row?.is_studying);
  const hasTimer = Boolean(row?.timer_started_at);
  const isOnline = Boolean(row?.online);
  const viewerDay = studyDayKey();
  // Don't leak yesterday's stored totals into "today" — a stale row from a previous
  // study day contributes nothing unless its study_day matches the viewer's day.
  const rowIsToday = !row?.study_day || row.study_day === viewerDay;

  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  const FORTY_FIVE_SEC_MS = 45000;

  let isStudying = false;
  let online = false;

  if (rawStudying && hasTimer && !isOnline) {
    // App in background, timer running: active up to 3 hours from updated_at
    if (diffMs <= THREE_HOURS_MS && rowIsToday) {
      isStudying = true;
      online = false;
    } else {
      isStudying = false;
      online = false;
    }
  } else if (rawStudying && isOnline) {
    // Active studying foreground: stale if heartbeat older than 45 seconds
    if (diffMs <= FORTY_FIVE_SEC_MS) {
      isStudying = true;
      online = true;
    } else {
      isStudying = false;
      online = false;
    }
  } else {
    // Stopped / resting
    const isStale = diffMs > FORTY_FIVE_SEC_MS;
    isStudying = false;
    online = isStale ? false : isOnline;
  }

  const sessionElapsed = Number(row?.session_elapsed_seconds) || 0;
  const todaySec = Number(row?.today_seconds) || 0;
  const accumulated = Number(row?.accumulated_seconds) || 0;

  let liveSession = sessionElapsed;
  let liveToday = rowIsToday ? todaySec : 0;

  if (isStudying) {
    if (row?.timer_started_at) {
      const extra = Math.max(0, Math.floor((correctedNow - Number(row.timer_started_at)) / 1000));
      liveSession = accumulated + extra;
    } else {
      const extraSeconds = Math.max(0, Math.floor((correctedNow - updatedAtMs) / 1000));
      liveSession = sessionElapsed + extraSeconds;
    }
    const baseToday = Math.max(0, liveToday - sessionElapsed);
    liveToday = baseToday + liveSession;
  }

  const partnerName =
    row?.display_name && row.display_name !== settings.myName
      ? row.display_name
      : settings.partnerName;

  return {
    role: partnerRole,
    name: partnerName,
    avatar: '3d-badge',
    isStudying,
    online,
    subject: row?.subject || (partnerRole === 'wife' ? 'bio' : 'chem'),
    subjectName: row?.subject_name || defaultSubject,
    timerStartedAt: row?.timer_started_at ? Number(row.timer_started_at) : null,
    accumulatedSeconds: accumulated,
    sessionElapsedSeconds: liveSession,
    todaySeconds: liveToday,
    todayTests: Number(row?.today_tests) || 0,
    studyDay: row?.study_day || studyDayKey(),
    lastHeartbeat: updatedAtMs,
  };
}

/**
 * Singleton Managed Realtime Channel with Reconnect Backoff & Broadcast Queue
 */
let sharedPairChannel: any = null;
let currentPairCodeForChannel: string = '';
let channelSubscribed = false;
let pendingBroadcastQueue: Array<{ event: string; payload: any }> = [];
const realtimeSubscribers = new Set<(state: CoupleMemberState) => void>();
let reconnectTimer: any = null;
let reconnectDelayMs = 2000;

function drainPendingBroadcasts(channel: any) {
  if (!channelSubscribed || !channel) return;
  while (pendingBroadcastQueue.length > 0) {
    const item = pendingBroadcastQueue.shift();
    if (item) {
      try {
        channel.send({
          type: 'broadcast',
          event: item.event,
          payload: item.payload,
        });
      } catch (e) {
        console.warn('Failed to drain broadcast message:', e);
      }
    }
  }
}

export function getOrCreatePairChannel(pairCode: string): any {
  const supabase = getSupabaseClient();
  if (!supabase || !pairCode) return null;

  if (sharedPairChannel && currentPairCodeForChannel === pairCode) {
    return sharedPairChannel;
  }

  if (sharedPairChannel) {
    try {
      supabase.removeChannel(sharedPairChannel);
    } catch {}
    sharedPairChannel = null;
    channelSubscribed = false;
  }

  currentPairCodeForChannel = pairCode;
  const settings = getCoupleSettings();
  // Presence key must be unique per device/role — the old shared pairCode key
  // collapsed both partners into a single presence slot.
  const presenceKey = `${settings.myRole || 'me'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase.channel(`couple-live-${pairCode}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: presenceKey },
    },
  });

  channel
    .on('broadcast', { event: 'timer_heartbeat' }, (event: any) => {
      const payload = event?.payload;
      if (!payload) return;
      const settings = getCoupleSettings();
      const partnerRole = settings.myRole === 'husband' ? 'wife' : 'husband';
      if (payload.role === partnerRole) {
        const defaultSubject = partnerRole === 'wife' ? 'زیست‌شناسی' : 'شیمی';
        const updatedState: CoupleMemberState = {
          role: partnerRole,
          name: payload.name || settings.partnerName,
          avatar: '3d-badge',
          isStudying: Boolean(payload.isStudying),
          online: Boolean(payload.online !== false),
          subject: payload.subject || (partnerRole === 'wife' ? 'bio' : 'chem'),
          subjectName: payload.subjectName || defaultSubject,
          timerStartedAt: payload.timerStartedAt || null,
          accumulatedSeconds: Number(payload.accumulatedSeconds) || 0,
          sessionElapsedSeconds: Number(payload.sessionElapsedSeconds) || 0,
          todaySeconds: Number(payload.todaySeconds) || 0,
          todayTests: Number(payload.todayTests) || 0,
          studyDay: payload.studyDay || studyDayKey(),
          lastHeartbeat: Date.now(),
        };
        savePartnerState(updatedState);
        realtimeSubscribers.forEach((cb) => cb(updatedState));
      }
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'couple_live_states',
        filter: `pair_code=eq.${pairCode}`,
      },
      (payload: any) => {
        const row = payload.new;
        if (!row) return;
        const settings = getCoupleSettings();
        const partnerRole = settings.myRole === 'husband' ? 'wife' : 'husband';
        if (row.role === partnerRole) {
          const serverOffset = getServerOffset();
          const correctedNow = Date.now() + serverOffset;
          const updatedState = computePartnerLive(row, settings, correctedNow);
          savePartnerState(updatedState);
          realtimeSubscribers.forEach((cb) => cb(updatedState));
        }
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        channelSubscribed = true;
        reconnectDelayMs = 2000;
        drainPendingBroadcasts(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        channelSubscribed = false;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (currentPairCodeForChannel === pairCode) {
            getOrCreatePairChannel(pairCode);
          }
        }, reconnectDelayMs);
        reconnectDelayMs = Math.min(30000, Math.floor(reconnectDelayMs * 1.5));
      } else if (status === 'CLOSED') {
        channelSubscribed = false;
      }
    });

  sharedPairChannel = channel;
  return channel;
}

// Keep local reference to last known state to merge partial updates correctly
let lastMyState: CoupleMemberState | null = null;
let lastDatabasePersistMs = 0;

function getStoredMyState(): CoupleMemberState {
  const settings = getCoupleSettings();
  const day = studyDayKey();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MY_STATE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) return parsed;
      }
    } catch {}
  }
  return {
    role: settings.myRole,
    name: settings.myName,
    avatar: '3d-badge',
    isStudying: false,
    online: true,
    subject: 'bio',
    subjectName: 'زیست‌شناسی',
    timerStartedAt: null,
    accumulatedSeconds: 0,
    sessionElapsedSeconds: 0,
    todaySeconds: 0,
    todayTests: 0,
    studyDay: day,
    lastHeartbeat: Date.now(),
  };
}

/**
 * Broadcast study state.
 * Crucially merges partial updates so { online: false } NEVER turns off an active study timer!
 * Separates high-frequency Realtime broadcasts from low-frequency database persistence.
 */
export async function broadcastMyState(
  state: Partial<CoupleMemberState>,
  options: { persistToDb?: boolean } = {}
): Promise<void> {
  const settings = getCoupleSettings();
  if (!settings.pairCode) return;
  const day = studyDayKey();

  const prev = lastMyState || getStoredMyState();

  const fullState: CoupleMemberState = {
    role: settings.myRole,
    name: settings.myName,
    avatar: '3d-badge',
    isStudying: state.isStudying !== undefined ? Boolean(state.isStudying) : prev.isStudying,
    online: state.online !== undefined ? Boolean(state.online) : prev.online,
    subject: state.subject !== undefined ? state.subject : prev.subject,
    subjectName: state.subjectName !== undefined ? state.subjectName : prev.subjectName,
    timerStartedAt: state.timerStartedAt !== undefined ? state.timerStartedAt : prev.timerStartedAt,
    accumulatedSeconds: state.accumulatedSeconds !== undefined ? state.accumulatedSeconds : prev.accumulatedSeconds,
    sessionElapsedSeconds: state.sessionElapsedSeconds !== undefined ? state.sessionElapsedSeconds : prev.sessionElapsedSeconds,
    todaySeconds: state.todaySeconds !== undefined ? state.todaySeconds : prev.todaySeconds,
    todayTests: state.todayTests !== undefined ? state.todayTests : prev.todayTests,
    studyDay: day,
    lastHeartbeat: Date.now(),
  };

  lastMyState = fullState;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEYS.MY_STATE, JSON.stringify(fullState));
    } catch {}
  }

  // 1. Lightweight Realtime Broadcast
  const channel = getOrCreatePairChannel(settings.pairCode);
  if (channel && channelSubscribed) {
    try {
      channel.send({
        type: 'broadcast',
        event: 'timer_heartbeat',
        payload: fullState,
      });
    } catch {
      // Coalesce: only keep latest timer heartbeat
      pendingBroadcastQueue = [{ event: 'timer_heartbeat', payload: fullState }];
    }
  } else if (channel) {
    pendingBroadcastQueue = [{ event: 'timer_heartbeat', payload: fullState }];
  }

  // 2. Controlled Database Persistence
  // Only persist to PostgreSQL on genuine state transitions OR explicit periodic DB heartbeat (~25-30s)
  const isTransition = prev.isStudying !== fullState.isStudying || (state.online !== undefined && prev.online !== fullState.online);
  const now = Date.now();
  const shouldPersist = options.persistToDb || isTransition || (now - lastDatabasePersistMs > 25000);

  if (shouldPersist) {
    lastDatabasePersistMs = now;
    const sentAtMs = Date.now();
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id || null;
        if (!userId) return; // Do not write null user_id

        // timer_started_at must live on the server clock, not the device clock —
        // the partner's computePartnerLive compares it against the corrected clock.
        const serverEpochTimerStart =
          typeof fullState.timerStartedAt === 'number'
            ? fullState.timerStartedAt + getServerOffset()
            : null;

        const { data: upsertData, error: upsertError } = await supabase
          .from('couple_live_states')
          .upsert(
            sanitizePayload('couple_live_states', {
              pair_code: settings.pairCode,
              role: settings.myRole,
              user_id: userId,
              display_name: settings.myName,
              email: settings.myEmail || null,
              is_studying: fullState.isStudying,
              subject: fullState.subject,
              subject_name: fullState.subjectName,
              timer_started_at: serverEpochTimerStart,
              accumulated_seconds: fullState.accumulatedSeconds || 0,
              session_elapsed_seconds: fullState.sessionElapsedSeconds,
              today_seconds: fullState.todaySeconds,
              today_tests: fullState.todayTests,
              study_day: day,
              online: fullState.online,
            }),
            { onConflict: 'pair_code,role' }
          )
          .select('updated_at')
          .maybeSingle();

        if (upsertError) {
          console.warn('DB upsert error in broadcastMyState:', upsertError.message);
        } else if (upsertData?.updated_at) {
          const serverMs = new Date(upsertData.updated_at).getTime();
          const roundTripMs = Date.now() - sentAtMs;
          // Sample local time at the moment the server stamped the row (≈ sentAt + rtt/2)
          // so pure network latency doesn't contaminate the offset estimate.
          const localAtServerMoment = sentAtMs + Math.floor(roundTripMs / 2);
          setServerOffset(serverMs - localAtServerMoment);
        }
      }
    } catch (err: any) {
      console.warn('DB upsert notice in broadcastMyState:', err);
    }
  }
}

/**
 * Fetch or get stored partner state
 */
export function getStoredPartnerState(): CoupleMemberState {
  const settings = getCoupleSettings();
  const partnerRole = settings.myRole === 'husband' ? 'wife' : 'husband';
  const defaultSubject = partnerRole === 'wife' ? 'زیست‌شناسی' : 'شیمی';

  if (typeof window === 'undefined') {
    return {
      role: partnerRole,
      name: settings.partnerName,
      avatar: '3d-badge',
      isStudying: false,
      online: false,
      subject: partnerRole === 'wife' ? 'bio' : 'chem',
      subjectName: defaultSubject,
      sessionElapsedSeconds: 0,
      todaySeconds: 0,
      todayTests: 0,
      studyDay: studyDayKey(),
      lastHeartbeat: 0,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PARTNER_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) {
        return {
          ...parsed,
          role: partnerRole,
          name: parsed.name && parsed.name !== settings.myName ? parsed.name : settings.partnerName,
        };
      }
    }
  } catch {}

  return {
    role: partnerRole,
    name: settings.partnerName,
    avatar: '3d-badge',
    isStudying: false,
    online: false,
    subject: partnerRole === 'wife' ? 'bio' : 'chem',
    subjectName: defaultSubject,
    sessionElapsedSeconds: 0,
    todaySeconds: 0,
    todayTests: 0,
    studyDay: studyDayKey(),
    lastHeartbeat: 0,
  };
}

export function savePartnerState(state: CoupleMemberState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.PARTNER_STATE, JSON.stringify(state));
}

/**
 * Fetch latest partner record from Supabase table with server-offset calculation
 */
export async function fetchRemotePartnerState(): Promise<CoupleMemberState | null> {
  const settings = getCoupleSettings();
  if (!settings.pairCode) return null;
  const partnerRole = settings.myRole === 'husband' ? 'wife' : 'husband';

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('couple_live_states')
      .select('*')
      .eq('pair_code', settings.pairCode)
      .eq('role', partnerRole)
      .maybeSingle();

    if (error || !data) return null;

    const serverOffset = getServerOffset();
    const correctedNow = Date.now() + serverOffset;
    const partnerState = computePartnerLive(data, settings, correctedNow);

    savePartnerState(partnerState);
    return partnerState;
  } catch {
    return null;
  }
}

/**
 * Subscribe to realtime updates for partner state
 */
export function subscribeToPartnerRealtime(onPartnerUpdate: (state: CoupleMemberState) => void): () => void {
  const settings = getCoupleSettings();
  realtimeSubscribers.add(onPartnerUpdate);

  if (settings.pairCode) {
    getOrCreatePairChannel(settings.pairCode);
  }

  return () => {
    realtimeSubscribers.delete(onPartnerUpdate);
  };
}
