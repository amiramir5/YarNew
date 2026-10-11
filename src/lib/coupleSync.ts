import { getSupabaseClient } from './supabase';
import { studyDayKey } from './jalali';

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
  SERVER_OFFSET: 'ky_server_time_offset_ms',
};

// Generate random 6-character pairing code
export function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = 'KY-';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export const DEFAULT_HUSBAND_NAME = 'امیرمحمد';
export const DEFAULT_WIFE_NAME = 'آرمیتا';
export const DEFAULT_PAIR_CODE = 'KY-DUO777';

let serverClockOffsetMs = 0;

export function getServerOffset(): number {
  if (typeof window !== 'undefined' && serverClockOffsetMs === 0) {
    const stored = localStorage.getItem(STORAGE_KEYS.SERVER_OFFSET);
    if (stored) serverClockOffsetMs = parseInt(stored, 10) || 0;
  }
  return serverClockOffsetMs;
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
      pairCode: 'KY-DUO777',
      myName: DEFAULT_HUSBAND_NAME,
      partnerName: DEFAULT_WIFE_NAME,
      myEmail: '',
      partnerEmail: '',
      simulationEnabled: false,
    };
  }

  const role = (localStorage.getItem(STORAGE_KEYS.ROLE) as 'husband' | 'wife') || 'husband';
  let pairCode = localStorage.getItem(STORAGE_KEYS.PAIR_CODE);
  if (!pairCode) {
    pairCode = 'KY-DUO777';
    localStorage.setItem(STORAGE_KEYS.PAIR_CODE, pairCode);
  }

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
  const pairCode = (settings.pairCode || prev.pairCode).trim().toUpperCase();

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

  // Dispatch global window event so any open view re-syncs
  try {
    window.dispatchEvent(
      new CustomEvent('konkoor_profile_switched', {
        detail: { role, name: myName, email: myEmail, partnerName, partnerEmail, pairCode },
      })
    );
  } catch {}
}

/**
 * Singleton Managed Realtime Channel with Subscription Queue & Backoff
 */
let sharedPairChannel: any = null;
let currentPairCodeForChannel: string = '';
let channelSubscribed = false;
let pendingBroadcastQueue: Array<{ event: string; payload: any }> = [];
const realtimeSubscribers = new Set<(state: CoupleMemberState) => void>();

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
  const channel = supabase.channel(`couple-live-${pairCode}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: pairCode },
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
    .on('presence', { event: 'sync' }, () => {
      // Presence sync
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
          const updatedAtMs = new Date(row.updated_at || Date.now()).getTime();
          const serverOffset = getServerOffset();
          const correctedNow = Date.now() + serverOffset;
          const isStale = correctedNow - updatedAtMs > 45000;
          const isStudying = Boolean(row.is_studying) && !isStale;

          let liveSession = Number(row.session_elapsed_seconds) || 0;
          let liveToday = Number(row.today_seconds) || 0;

          if (isStudying && row.timer_started_at) {
            const extra = Math.max(0, Math.floor((correctedNow - Number(row.timer_started_at)) / 1000));
            liveSession = (Number(row.accumulated_seconds) || 0) + extra;
          } else if (isStudying && !isStale) {
            const extraSeconds = Math.max(0, Math.floor((correctedNow - updatedAtMs) / 1000));
            liveSession += extraSeconds;
            liveToday += extraSeconds;
          }

          const defaultSubject = partnerRole === 'wife' ? 'زیست‌شناسی' : 'شیمی';
          const updatedState: CoupleMemberState = {
            role: partnerRole,
            name: row.display_name && row.display_name !== settings.myName ? row.display_name : settings.partnerName,
            avatar: '3d-badge',
            isStudying,
            online: isStale ? false : Boolean(row.online),
            subject: row.subject || (partnerRole === 'wife' ? 'bio' : 'chem'),
            subjectName: row.subject_name || defaultSubject,
            timerStartedAt: row.timer_started_at ? Number(row.timer_started_at) : null,
            accumulatedSeconds: Number(row.accumulated_seconds) || 0,
            sessionElapsedSeconds: liveSession,
            todaySeconds: liveToday,
            todayTests: Number(row.today_tests) || 0,
            studyDay: row.study_day || studyDayKey(),
            lastHeartbeat: updatedAtMs,
          };
          savePartnerState(updatedState);
          realtimeSubscribers.forEach((cb) => cb(updatedState));
        }
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        channelSubscribed = true;
        drainPendingBroadcasts(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        channelSubscribed = false;
        // Schedule backoff reconnect
        setTimeout(() => {
          if (currentPairCodeForChannel === pairCode) {
            getOrCreatePairChannel(pairCode);
          }
        }, 3000);
      } else if (status === 'CLOSED') {
        channelSubscribed = false;
      }
    });

  sharedPairChannel = channel;
  return channel;
}

/**
 * Broadcast study state with immediate queueing & database persistence on key transitions
 */
export async function broadcastMyState(
  state: Partial<CoupleMemberState>,
  options: { persistToDb?: boolean } = {}
): Promise<void> {
  const settings = getCoupleSettings();
  const day = studyDayKey();

  const fullState: CoupleMemberState = {
    role: settings.myRole,
    name: settings.myName,
    avatar: '3d-badge',
    isStudying: Boolean(state.isStudying),
    online: state.online !== false,
    subject: state.subject || 'bio',
    subjectName: state.subjectName || 'زیست‌شناسی',
    timerStartedAt: state.timerStartedAt ?? null,
    accumulatedSeconds: state.accumulatedSeconds ?? 0,
    sessionElapsedSeconds: state.sessionElapsedSeconds || 0,
    todaySeconds: state.todaySeconds || 0,
    todayTests: state.todayTests || 0,
    studyDay: day,
    lastHeartbeat: Date.now(),
  };

  const channel = getOrCreatePairChannel(settings.pairCode);
  if (channel && channelSubscribed) {
    try {
      channel.send({
        type: 'broadcast',
        event: 'timer_heartbeat',
        payload: fullState,
      });
    } catch {
      pendingBroadcastQueue.push({ event: 'timer_heartbeat', payload: fullState });
    }
  } else if (channel) {
    pendingBroadcastQueue.push({ event: 'timer_heartbeat', payload: fullState });
  }

  // Persist to DB on transitions (Start, Pause, Resume, Finish) or explicit request
  if (options.persistToDb || state.isStudying !== undefined || !state.online) {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id || null;

        await supabase.from('couple_live_states').upsert(
          {
            pair_code: settings.pairCode,
            role: settings.myRole,
            user_id: userId,
            display_name: settings.myName,
            email: settings.myEmail || null,
            is_studying: fullState.isStudying,
            subject: fullState.subject,
            subject_name: fullState.subjectName,
            timer_started_at: fullState.timerStartedAt || null,
            accumulated_seconds: fullState.accumulatedSeconds || 0,
            session_elapsed_seconds: fullState.sessionElapsedSeconds,
            today_seconds: fullState.todaySeconds,
            today_tests: fullState.todayTests,
            study_day: day,
            online: fullState.online,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'pair_code,role' }
        );
      }
    } catch (err) {
      console.warn('DB upsert non-blocking notice in broadcastMyState:', err);
    }
  }
}

/**
 * Fetch or get live partner state from storage
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
      online: true,
      subject: partnerRole === 'wife' ? 'bio' : 'chem',
      subjectName: defaultSubject,
      sessionElapsedSeconds: 0,
      todaySeconds: 0,
      todayTests: 0,
      studyDay: studyDayKey(),
      lastHeartbeat: Date.now(),
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PARTNER_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.studyDay === studyDayKey()) {
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
    online: true,
    subject: partnerRole === 'wife' ? 'bio' : 'chem',
    subjectName: defaultSubject,
    sessionElapsedSeconds: 0,
    todaySeconds: 0,
    todayTests: 0,
    studyDay: studyDayKey(),
    lastHeartbeat: Date.now(),
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
  const partnerRole = settings.myRole === 'husband' ? 'wife' : 'husband';
  const defaultSubject = partnerRole === 'wife' ? 'زیست‌شناسی' : 'شیمی';

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

    const serverTimeStr = data.updated_at || new Date().toISOString();
    const updatedAtMs = new Date(serverTimeStr).getTime();
    
    // Estimate server clock offset
    const serverOffset = getServerOffset();
    const nowCompensated = Date.now() + serverOffset;
    const isStale = nowCompensated - updatedAtMs > 45000;
    const isStudying = Boolean(data.is_studying) && !isStale;

    let liveSession = Number(data.session_elapsed_seconds) || 0;
    let liveToday = Number(data.today_seconds) || 0;

    if (isStudying && data.timer_started_at) {
      const extra = Math.max(0, Math.floor((nowCompensated - Number(data.timer_started_at)) / 1000));
      liveSession = (Number(data.accumulated_seconds) || 0) + extra;
      liveToday += extra;
    } else if (isStudying && !isStale) {
      const extraSeconds = Math.max(0, Math.floor((nowCompensated - updatedAtMs) / 1000));
      liveSession += extraSeconds;
      liveToday += extraSeconds;
    }

    const partnerName =
      data.display_name && data.display_name !== settings.myName
        ? data.display_name
        : settings.partnerName;

    const partnerState: CoupleMemberState = {
      role: partnerRole,
      name: partnerName,
      avatar: '3d-badge',
      isStudying,
      online: isStale ? false : Boolean(data.online),
      subject: data.subject || (partnerRole === 'wife' ? 'bio' : 'chem'),
      subjectName: data.subject_name || defaultSubject,
      timerStartedAt: data.timer_started_at ? Number(data.timer_started_at) : null,
      accumulatedSeconds: Number(data.accumulated_seconds) || 0,
      sessionElapsedSeconds: liveSession,
      todaySeconds: liveToday,
      todayTests: Number(data.today_tests) || 0,
      studyDay: data.study_day || studyDayKey(),
      lastHeartbeat: updatedAtMs,
    };

    savePartnerState(partnerState);
    return partnerState;
  } catch {
    return null;
  }
}

/**
 * Subscribe to realtime updates for partner state via Supabase Channel
 */
export function subscribeToPartnerRealtime(onPartnerUpdate: (state: CoupleMemberState) => void): () => void {
  const settings = getCoupleSettings();
  realtimeSubscribers.add(onPartnerUpdate);

  getOrCreatePairChannel(settings.pairCode);

  return () => {
    realtimeSubscribers.delete(onPartnerUpdate);
  };
}
