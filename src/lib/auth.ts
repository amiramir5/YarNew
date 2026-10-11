import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import {
  getCoupleSettings,
  saveCoupleSettings,
  resolveNameFromRole,
  broadcastMyState,
  DEFAULT_HUSBAND_NAME,
  DEFAULT_WIFE_NAME,
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
  name: DEFAULT_HUSBAND_NAME,
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
      globalAuthState.email = parsed.email || couple.myEmail || null;
      globalAuthState.name = parsed.name || couple.myName || DEFAULT_HUSBAND_NAME;
      globalAuthState.role = parsed.role || couple.myRole || 'husband';
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

  // Check initial active session from Supabase
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

  const handleProfileSwitched = (e: any) => {
    const detail = e?.detail;
    if (detail) {
      globalAuthState.role = detail.role || globalAuthState.role;
      globalAuthState.name = detail.name || globalAuthState.name;
      globalAuthState.email = detail.email || globalAuthState.email;
      notifyListeners();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('konkoor_profile_switched', handleProfileSwitched);
  }

  return () => {
    authSubscription?.subscription?.unsubscribe?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('konkoor_profile_switched', handleProfileSwitched);
    }
  };
}

/**
 * Sync user profile and email to couple sync config & local storage
 */
export function syncUserToCoupleSettings(user: User): void {
  const email = (user.email || '').trim().toLowerCase();
  const current = getCoupleSettings();

  const role: 'husband' | 'wife' =
    user.user_metadata?.role === 'wife' ? 'wife' : user.user_metadata?.role === 'husband' ? 'husband' : current.myRole;

  const name =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.display_name ||
    resolveNameFromRole(role, current.myName);

  const partnerName = role === 'husband' ? DEFAULT_WIFE_NAME : DEFAULT_HUSBAND_NAME;

  saveCoupleSettings({
    myRole: role,
    pairCode: user.user_metadata?.pair_code || current.pairCode,
    myName: name,
    myEmail: email,
    partnerName,
    partnerEmail: current.partnerEmail,
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
 * Sign in with email and password (REAL authentication - no password bypass)
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
    return { ok: false, error: 'ارتباط با سرور سوپابیس برقرار نیست. لطفاً اتصال اینترنت خود را بررسی کنید.' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password: pass,
    });

    if (error) {
      if (
        error.message?.includes('Invalid login credentials') ||
        error.message?.includes('invalid_grant')
      ) {
        return {
          ok: false,
          error: 'ایمیل یا رمز عبور اشتباه است. لطفاً دقت فرمایید.',
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
    return {
      ok: false,
      error: err.message || 'خطا در برقراری ارتباط با سرور احراز هویت.',
    };
  }
}

/**
 * Sign up with email, password, name, and role
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  name?: string,
  role?: 'husband' | 'wife'
): Promise<{ ok: boolean; error?: string; user?: User; requiresVerification?: boolean }> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    return { ok: false, error: 'لطفاً آدرس ایمیل را وارد کنید.' };
  }
  if (!pass || pass.length < 6) {
    return { ok: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
  }

  const determinedRole = role || 'husband';
  const determinedName = name?.trim() || resolveNameFromRole(determinedRole);

  if (!client) {
    return { ok: false, error: 'پیکربندی Supabase در دسترس نیست.' };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password: pass,
      options: {
        data: {
          name: determinedName,
          full_name: determinedName,
          role: determinedRole,
        },
      },
    });

    if (error) {
      if (error.message?.includes('already registered')) {
        return {
          ok: false,
          error: 'این ایمیل قبلاً در سامانه ثبت شده است. لطفاً از تب «ورود» وارد شوید.',
        };
      }
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }

    if (data.user) {
      // If project has email confirmation enabled, session is null
      if (!data.session) {
        return {
          ok: true,
          user: data.user,
          requiresVerification: true,
          error: 'حساب شما ایجاد شد! لینک فعال‌سازی به ایمیل ارسال شد، لطفاً صندوق ایمیل خود را بررسی و تایید کنید.',
        };
      }

      syncUserToCoupleSettings(data.user);
      globalAuthState.user = data.user;
      globalAuthState.session = data.session;
      notifyListeners();
      return { ok: true, user: data.user };
    }

    return { ok: false, error: 'ثبت‌نام انجام نشد. لطفاً دوباره تلاش فرمایید.' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطا در ثبت نام.' };
  }
}

/**
 * Send password reset email
 */
export async function resetPasswordForEmail(email: string): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { ok: false, message: 'لطفاً آدرس ایمیل خود را وارد کنید.' };
  }
  if (!client) {
    return { ok: false, message: 'اتصال به سرور برقرار نیست.' };
  }
  try {
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      return { ok: false, message: translateSupabaseAuthError(error.message) };
    }
    return { ok: true, message: 'لینک بازیابی رمز عبور به ایمیل شما ارسال شد.' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'خطا در ارسال ایمیل بازیابی رمز.' };
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
  globalAuthState.email = null;
  localStorage.removeItem(AUTH_PERSIST_KEY);
  notifyListeners();
}

/**
 * Switch role view locally (with study reset)
 */
export function switchActiveUser(targetRole: 'husband' | 'wife'): void {
  const current = getCoupleSettings();
  const targetName = targetRole === 'husband' ? DEFAULT_HUSBAND_NAME : DEFAULT_WIFE_NAME;
  saveCoupleSettings({
    myRole: targetRole,
    myName: targetName,
    partnerName: targetRole === 'husband' ? DEFAULT_WIFE_NAME : DEFAULT_HUSBAND_NAME,
  });
  try {
    broadcastMyState({ isStudying: false, sessionElapsedSeconds: 0 }, { persistToDb: true });
  } catch {}
}

export function translateSupabaseAuthError(msg: string): string {
  if (!msg) return 'خطایی در احراز هویت رخ داد.';
  if (msg.includes('Password should be at least')) return 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
  if (msg.includes('Invalid email')) return 'فرمت آدرس ایمیل نامعتبر است.';
  if (msg.includes('Email not confirmed')) return 'ایمیل شما هنوز تایید نشده است. لطفاً لینک ارسال شده به ایمیل را باز کنید.';
  if (msg.includes('rate limit')) return 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند دقیقه صبر کنید.';
  return msg;
}
