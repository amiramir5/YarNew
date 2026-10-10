import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import {
  getCoupleSettings,
  saveCoupleSettings,
  resolveNameFromEmail,
  HUSBAND_CONFIG,
  WIFE_CONFIG,
} from './coupleSync';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  email: string | null;
  name: string;
  role: 'husband' | 'wife';
}

const AUTH_PERSIST_KEY = 'ky_authenticated_user_v2';

let globalAuthState: AuthState = {
  user: null,
  session: null,
  loading: true,
  email: null,
  name: 'امیرمحمد',
  role: 'husband',
};

const listeners = new Set<(state: AuthState) => void>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn({ ...globalAuthState });
    } catch (e) {
      console.error('Auth state listener error:', e);
    }
  });
}

/**
 * Initialize Supabase Auth listener and restore persisted user session
 */
export function initAuthListener(): () => void {
  const client = getSupabaseClient();
  const couple = getCoupleSettings();

  // Load any locally cached session identity
  try {
    const cached = localStorage.getItem(AUTH_PERSIST_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      globalAuthState.email = parsed.email || couple.myEmail;
      globalAuthState.name = parsed.name || couple.myName;
      globalAuthState.role = parsed.role || couple.myRole;
    } else if (couple.myEmail) {
      globalAuthState.email = couple.myEmail;
      globalAuthState.name = couple.myName;
      globalAuthState.role = couple.myRole;
    }
  } catch {
    // ignore parse error
  }

  if (!client) {
    globalAuthState.loading = false;
    notifyListeners();
    return () => {};
  }

  // Check initial active session
  client.auth.getSession().then(({ data: { session }, error }: any) => {
    if (error) {
      console.warn('Supabase getSession error:', error.message);
    }
    if (session?.user) {
      syncUserToCoupleSettings(session.user);
      globalAuthState.session = session;
      globalAuthState.user = session.user;
    }
    globalAuthState.loading = false;
    notifyListeners();
  });

  // Listen to live auth changes (login, logout, token refresh)
  const { data: authSubscription } = client.auth.onAuthStateChange(
    (_event: string, session: Session | null) => {
      globalAuthState.session = session;
      globalAuthState.user = session?.user || null;
      globalAuthState.loading = false;

      if (session?.user) {
        syncUserToCoupleSettings(session.user);
      } else {
        localStorage.removeItem(AUTH_PERSIST_KEY);
      }

      notifyListeners();
    }
  );

  return () => {
    authSubscription?.subscription?.unsubscribe?.();
  };
}

/**
 * Sync user profile and email to couple sync config & local storage
 */
export function syncUserToCoupleSettings(user: User): void {
  const email = (user.email || '').trim().toLowerCase();
  const current = getCoupleSettings();

  let role: 'husband' | 'wife' = current.myRole;
  if (email === HUSBAND_CONFIG.email || email.includes('amir') || email.includes('moradi')) {
    role = 'husband';
  } else if (email === WIFE_CONFIG.email || email.includes('armita') || email.includes('amirtaplan')) {
    role = 'wife';
  }

  const name =
    user.user_metadata?.name ||
    user.user_metadata?.display_name ||
    resolveNameFromEmail(email, role);

  const partnerEmail = role === 'husband' ? WIFE_CONFIG.email : HUSBAND_CONFIG.email;
  const partnerName = role === 'husband' ? WIFE_CONFIG.name : HUSBAND_CONFIG.name;

  saveCoupleSettings({
    myRole: role,
    pairCode: current.pairCode,
    myName: name,
    myEmail: email,
    partnerName,
    partnerEmail,
  });

  globalAuthState.email = email;
  globalAuthState.name = name;
  globalAuthState.role = role;

  try {
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({
        email,
        name,
        role,
        id: user.id,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Get current global auth state
 */
export function getAuthState(): AuthState {
  return { ...globalAuthState };
}

/**
 * Subscribe to auth state updates
 */
export function subscribeToAuth(callback: (state: AuthState) => void): () => void {
  listeners.add(callback);
  callback({ ...globalAuthState });
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  pass: string
): Promise<{ ok: boolean; error?: string; user?: User }> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    return { ok: false, error: 'لطفاً آدرس ایمیل را وارد کنید.' };
  }
  if (!pass || pass.length < 6) {
    return { ok: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
  }

  if (!client) {
    // Offline local persistence fallback
    applyOfflineSession(cleanEmail);
    return { ok: true };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password: pass,
    });

    if (error) {
      // If user is not confirmed or not found, try sign-up automatically or return readable error
      if (
        error.message?.includes('Invalid login credentials') ||
        error.message?.includes('invalid_grant')
      ) {
        // Attempt signup if credentials don't exist yet
        const signUpRes = await signUpWithEmail(cleanEmail, pass);
        if (signUpRes.ok) {
          return { ok: true, user: signUpRes.user };
        }
        return {
          ok: false,
          error: 'ایمیل یا رمز عبور اشتباه است، یا کاربر هنوز ثبت‌نام نشده است.',
        };
      }
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }

    if (data.user) {
      syncUserToCoupleSettings(data.user);
      globalAuthState.user = data.user;
      globalAuthState.session = data.session;
      notifyListeners();
      return { ok: true, user: data.user };
    }

    return { ok: true };
  } catch (err: any) {
    // If network fails, allow seamless local session remembering
    applyOfflineSession(cleanEmail);
    return {
      ok: true,
      error: 'ورود به صورت محلی ذخیره شد (خطای ارتباط با سرور).',
    };
  }
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  name?: string,
  role?: 'husband' | 'wife'
): Promise<{ ok: boolean; error?: string; user?: User }> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    return { ok: false, error: 'لطفاً آدرس ایمیل را وارد کنید.' };
  }
  if (!pass || pass.length < 6) {
    return { ok: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
  }

  const determinedRole =
    role ||
    (cleanEmail.includes('armita') || cleanEmail.includes('amirtaplan')
      ? 'wife'
      : 'husband');
  const determinedName =
    name?.trim() || resolveNameFromEmail(cleanEmail, determinedRole);

  if (!client) {
    applyOfflineSession(cleanEmail, determinedName, determinedRole);
    return { ok: true };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password: pass,
      options: {
        data: {
          name: determinedName,
          role: determinedRole,
        },
      },
    });

    if (error) {
      // If user already exists, suggest signing in
      if (error.message?.includes('already registered')) {
        return {
          ok: false,
          error: 'این ایمیل قبلاً ثبت شده است. لطفاً از تب «ورود» استفاده کنید.',
        };
      }
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }

    if (data.user) {
      syncUserToCoupleSettings(data.user);
      globalAuthState.user = data.user;
      globalAuthState.session = data.session;
      notifyListeners();
      return { ok: true, user: data.user };
    }

    applyOfflineSession(cleanEmail, determinedName, determinedRole);
    return { ok: true };
  } catch (err: any) {
    applyOfflineSession(cleanEmail, determinedName, determinedRole);
    return { ok: true };
  }
}

/**
 * Sign out current user
 */
export async function signOutUser(): Promise<void> {
  const client = getSupabaseClient();
  try {
    if (client) {
      await client.auth.signOut();
    }
  } catch (err) {
    console.warn('Sign out error:', err);
  }

  globalAuthState.user = null;
  globalAuthState.session = null;
  localStorage.removeItem(AUTH_PERSIST_KEY);
  notifyListeners();
}

function applyOfflineSession(
  email: string,
  customName?: string,
  customRole?: 'husband' | 'wife'
) {
  const role: 'husband' | 'wife' =
    customRole ||
    (email.includes('armita') || email.includes('amirtaplan') ? 'wife' : 'husband');
  const name =
    customName ||
    (role === 'husband' ? HUSBAND_CONFIG.name : WIFE_CONFIG.name);

  saveCoupleSettings({
    myRole: role,
    pairCode: 'KONKOOR-DUO',
    myName: name,
    myEmail: email,
    partnerName: role === 'husband' ? WIFE_CONFIG.name : HUSBAND_CONFIG.name,
    partnerEmail: role === 'husband' ? WIFE_CONFIG.email : HUSBAND_CONFIG.email,
  });

  globalAuthState.email = email;
  globalAuthState.name = name;
  globalAuthState.role = role;

  try {
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({
        email,
        name,
        role,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }

  notifyListeners();
}

function translateSupabaseAuthError(msg: string): string {
  if (!msg) return 'خطایی در احراز هویت رخ داد.';
  if (msg.includes('Password should be at least')) return 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
  if (msg.includes('Invalid email')) return 'فرمت آدرس ایمیل نامعتبر است.';
  if (msg.includes('Email not confirmed')) return 'ایمیل شما هنوز تایید نشده است یا می‌توانید با رمز قبلی وارد شوید.';
  if (msg.includes('rate limit')) return 'درخواست‌های بیش از حد؛ لطفاً چند دقیقه دیگر امتحان کنید.';
  return msg;
}
