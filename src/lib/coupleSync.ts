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
  sessionElapsedSeconds: number;
  todaySeconds: number;
  todayTests: number;
  studyDay: string;
  lastHeartbeat: number;
}

export interface CoupleSessionComparison {
  day: string;
  weekdayName: string;
  husbandMinutes: number;
  wifeMinutes: number;
  husbandTests: number;
  wifeTests: number;
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
};

export const DEFAULT_PAIR_CODE = 'KONKOOR-DUO';

export const HUSBAND_CONFIG = {
  name: 'امیرمحمد',
  email: 'am.moradidaem@gmail.com',
};

export const WIFE_CONFIG = {
  name: 'آرمیتا',
  email: 'amirtaplans@gmail.com',
};

export function resolveNameFromEmail(email: string, fallbackRole: 'husband' | 'wife'): string {
  const clean = (email || '').toLowerCase().trim();
  if (clean === 'amirtaplans@gmail.com' || clean.includes('armita') || clean.includes('amirtaplan')) {
    return 'آرمیتا';
  }
  if (clean === 'am.moradidaem@gmail.com' || clean.includes('moradi') || clean.includes('amir')) {
    return 'امیرمحمد';
  }
  return fallbackRole === 'husband' ? 'امیرمحمد' : 'آرمیتا';
}

export function getCoupleSettings() {
  if (typeof window === 'undefined') {
    return {
      myRole: 'husband' as const,
      pairCode: DEFAULT_PAIR_CODE,
      myName: HUSBAND_CONFIG.name,
      partnerName: WIFE_CONFIG.name,
      myEmail: HUSBAND_CONFIG.email,
      partnerEmail: WIFE_CONFIG.email,
      simulationEnabled: true,
    };
  }

  const role = (localStorage.getItem(STORAGE_KEYS.ROLE) as 'husband' | 'wife') || 'husband';
  const pairCode = localStorage.getItem(STORAGE_KEYS.PAIR_CODE) || DEFAULT_PAIR_CODE;
  const myEmail =
    localStorage.getItem(STORAGE_KEYS.MY_EMAIL) ||
    (role === 'husband' ? HUSBAND_CONFIG.email : WIFE_CONFIG.email);
  const partnerEmail =
    localStorage.getItem(STORAGE_KEYS.PARTNER_EMAIL) ||
    (role === 'husband' ? WIFE_CONFIG.email : HUSBAND_CONFIG.email);

  const storedMyName = localStorage.getItem(STORAGE_KEYS.MY_NAME);
  const storedPartnerName = localStorage.getItem(STORAGE_KEYS.PARTNER_NAME);

  // Guarantee that myName and partnerName never collide
  let myName = role === 'husband' ? HUSBAND_CONFIG.name : WIFE_CONFIG.name;
  if (storedMyName && storedMyName !== 'من' && storedMyName !== 'همسر ۱' && storedMyName !== 'همسر ۲') {
    if (role === 'husband' && storedMyName !== WIFE_CONFIG.name) {
      myName = storedMyName;
    } else if (role === 'wife' && storedMyName !== HUSBAND_CONFIG.name) {
      myName = storedMyName;
    }
  }

  let partnerName = role === 'husband' ? WIFE_CONFIG.name : HUSBAND_CONFIG.name;
  if (storedPartnerName && storedPartnerName !== 'همسرم' && storedPartnerName !== 'همسر ۲' && storedPartnerName !== 'همسر ۱') {
    if (role === 'husband' && storedPartnerName !== HUSBAND_CONFIG.name) {
      partnerName = storedPartnerName;
    } else if (role === 'wife' && storedPartnerName !== WIFE_CONFIG.name) {
      partnerName = storedPartnerName;
    }
  }

  if (myName === partnerName) {
    partnerName = role === 'husband' ? WIFE_CONFIG.name : HUSBAND_CONFIG.name;
  }

  const simulationEnabled = localStorage.getItem(STORAGE_KEYS.SIMULATION_ENABLED) !== 'false';

  return { myRole: role, pairCode, myName, partnerName, myEmail, partnerEmail, simulationEnabled };
}

export function saveCoupleSettings(settings: {
  myRole: 'husband' | 'wife';
  pairCode?: string;
  myName: string;
  partnerName: string;
  myEmail?: string;
  partnerEmail?: string;
  simulationEnabled?: boolean;
}) {
  if (typeof window === 'undefined') return;

  const role = settings.myRole;
  const code = settings.pairCode || DEFAULT_PAIR_CODE;
  let myName = settings.myName.trim() || (role === 'husband' ? HUSBAND_CONFIG.name : WIFE_CONFIG.name);
  let partnerName = settings.partnerName.trim() || (role === 'husband' ? WIFE_CONFIG.name : HUSBAND_CONFIG.name);

  if (myName === partnerName) {
    partnerName = role === 'husband' ? WIFE_CONFIG.name : HUSBAND_CONFIG.name;
  }

  const myEmail =
    settings.myEmail !== undefined && settings.myEmail.trim()
      ? settings.myEmail.trim()
      : role === 'husband'
      ? HUSBAND_CONFIG.email
      : WIFE_CONFIG.email;

  const partnerEmail =
    settings.partnerEmail !== undefined && settings.partnerEmail.trim()
      ? settings.partnerEmail.trim()
      : role === 'husband'
      ? WIFE_CONFIG.email
      : HUSBAND_CONFIG.email;

  localStorage.setItem(STORAGE_KEYS.ROLE, role);
  localStorage.setItem(STORAGE_KEYS.PAIR_CODE, code);
  localStorage.setItem(STORAGE_KEYS.MY_NAME, myName);
  localStorage.setItem(STORAGE_KEYS.PARTNER_NAME, partnerName);
  localStorage.setItem(STORAGE_KEYS.MY_EMAIL, myEmail);
  localStorage.setItem(STORAGE_KEYS.PARTNER_EMAIL, partnerEmail);

  if (settings.simulationEnabled !== undefined) {
    localStorage.setItem(STORAGE_KEYS.SIMULATION_ENABLED, String(settings.simulationEnabled));
  }

  // Also sync user auth cache in localStorage so getActiveUserEmail() matches instantly!
  try {
    localStorage.setItem(
      'ky_authenticated_user_v2',
      JSON.stringify({
        email: myEmail,
        name: myName,
        role,
        id: role === 'husband' ? 'user-amir' : 'user-armita',
        savedAt: Date.now(),
      })
    );
  } catch {}

  // Dispatch global window event so any open view re-syncs
  try {
    window.dispatchEvent(
      new CustomEvent('konkoor_profile_switched', {
        detail: { role, name: myName, email: myEmail, partnerName, partnerEmail },
      })
    );
  } catch {}
}

/**
 * Singleton Managed Realtime Channel
 */
let sharedPairChannel: any = null;
let currentPairCodeForChannel: string = '';
const realtimeSubscribers = new Set<(state: CoupleMemberState) => void>();

function getOrCreatePairChannel(pairCode: string): any {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  if (sharedPairChannel && currentPairCodeForChannel === pairCode) {
    return sharedPairChannel;
  }

  if (sharedPairChannel) {
    try {
      supabase.removeChannel(sharedPairChannel);
    } catch {}
    sharedPairChannel = null;
  }

  currentPairCodeForChannel = pairCode;
  const channel = supabase.channel(`couple-live-${pairCode}`, {
    config: {
      broadcast: { self: false, ack: false },
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
          online: true,
          subject: payload.subject || (partnerRole === 'wife' ? 'bio' : 'chem'),
          subjectName: payload.subjectName || defaultSubject,
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
          const defaultSubject = partnerRole === 'wife' ? 'زیست‌شناسی' : 'شیمی';
          const updatedAtMs = new Date(row.updated_at || Date.now()).getTime();
          const isStale = Date.now() - updatedAtMs > 45000;
          const isStudying = Boolean(row.is_studying) && !isStale;

          let liveSession = Number(row.session_elapsed_seconds) || 0;
          let liveToday = Number(row.today_seconds) || 0;
          if (isStudying && !isStale) {
            const extra = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000));
            liveSession += extra;
            liveToday += extra;
          }

          const updatedState: CoupleMemberState = {
            role: partnerRole,
            name: row.display_name || settings.partnerName,
            avatar: '3d-badge',
            isStudying,
            online: isStale ? false : Boolean(row.online),
            subject: row.subject || (partnerRole === 'wife' ? 'bio' : 'chem'),
            subjectName: row.subject_name || defaultSubject,
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
    .subscribe();

  sharedPairChannel = channel;
  return channel;
}

/**
 * Broadcast my live study status to Supabase Realtime channel and database table
 */
export async function broadcastMyState(state: Partial<CoupleMemberState>): Promise<void> {
  const settings = getCoupleSettings();
  const day = studyDayKey();

  const fullState: CoupleMemberState = {
    role: settings.myRole,
    name: settings.myName,
    avatar: '3d-badge',
    isStudying: Boolean(state.isStudying),
    online: true,
    subject: state.subject || 'bio',
    subjectName: state.subjectName || 'زیست‌شناسی',
    sessionElapsedSeconds: state.sessionElapsedSeconds || 0,
    todaySeconds: state.todaySeconds || 0,
    todayTests: state.todayTests || 0,
    studyDay: day,
    lastHeartbeat: Date.now(),
  };

  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      // 1. Send Realtime broadcast
      const channel = getOrCreatePairChannel(settings.pairCode);
      if (channel) {
        try {
          channel.send({
            type: 'broadcast',
            event: 'timer_heartbeat',
            payload: fullState,
          });
        } catch {}
      }

      // 2. Persist in database table couple_live_states
      await supabase.from('couple_live_states').upsert(
        {
          pair_code: settings.pairCode,
          role: settings.myRole,
          display_name: settings.myName,
          email: settings.myEmail,
          is_studying: fullState.isStudying,
          subject: fullState.subject,
          subject_name: fullState.subjectName,
          session_elapsed_seconds: fullState.sessionElapsedSeconds,
          today_seconds: fullState.todaySeconds,
          today_tests: fullState.todayTests,
          study_day: day,
          online: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'pair_code,role' }
      );
    }
  } catch (err) {
    console.warn('broadcastMyState non-blocking notice:', err);
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
  } catch {
    // ignore
  }

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
 * Fetch the latest partner live record from Supabase table with real-time time compensation
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

    const updatedAtMs = new Date(data.updated_at || Date.now()).getTime();
    const isStale = Date.now() - updatedAtMs > 45000;
    const isStudying = Boolean(data.is_studying) && !isStale;

    let liveSession = Number(data.session_elapsed_seconds) || 0;
    let liveToday = Number(data.today_seconds) || 0;

    // Compensate for elapsed seconds since last database heartbeat if actively studying
    if (isStudying && !isStale) {
      const extraSeconds = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000));
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

  // Initialize singleton channel
  getOrCreatePairChannel(settings.pairCode);

  return () => {
    realtimeSubscribers.delete(onPartnerUpdate);
  };
}
