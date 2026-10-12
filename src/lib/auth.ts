import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import {
  getCoupleSettings,
  saveCoupleSettings,
  fetchMyPairStatus,
  DEFAULT_HUSBAND_NAME,
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

let lastSyncedUserId: string | null = null;

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
    // ignore
  }

  if (!client) {
    globalAuthState.loading = false;
    notifyListeners();
    return () => {};
  }

  // Check initial active session from Supabase
  client.auth.getSession().then(({ data: { session }, error }: any) => {
    if (error) {
      console.warn('Supabase getSession notice:', error.message);
    }
    if (session?.user) {
      globalAuthState.session = session;
      globalAuthState.user = session.user;
      syncUserToCoupleSettings(session.user);
    }
    globalAuthState.loading = false;
    notifyListeners();
  });

  // Listen to live auth changes
  const { data: authSubscription } = client.auth.onAuthStateChange(
    (event: string, session: Session | null) => {
      const currentUserId = session?.user?.id || null;
      const userChanged = currentUserId !== lastSyncedUserId;

      globalAuthState.session = session;
      globalAuthState.user = session?.user || null;
      globalAuthState.loading = false;

      // Handle password recovery event
      if (event === 'PASSWORD_RECOVERY') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ky_password_recovery_requested'));
        }
      }

      if (session?.user) {
        // Only run full settings sync and emit event when user actually changed or explicitly signed in
        if (userChanged || event === 'SIGNED_IN') {
          syncUserToCoupleSettings(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        lastSyncedUserId = null;
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
 * Sync user profile and email to couple sync config & local storage.
 * Authoritative role and pair status are retrieved from server RPC get_my_pair_status!
 */
export async function syncUserToCoupleSettings(user: User): Promise<void> {
  lastSyncedUserId = user.id;
  const email = (user.email || '').trim().toLowerCase();

  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.display_name ||
    (email ? email.split('@')[0] : 'کاربر');

  saveCoupleSettings({
    myName: name,
    myEmail: email,
  });

  globalAuthState.email = email;
  globalAuthState.name = name;

  // Query server RPC get_my_pair_status as source of truth for pair and role
  try {
    const pairStatus = await fetchMyPairStatus();
    if (pairStatus && pairStatus.inPair) {
      globalAuthState.role = pairStatus.role || 'husband';
    } else if (pairStatus && pairStatus.inPair === false) {
      // Confirmed not in pair by server: clear local stale pair code
      saveCoupleSettings({ pairCode: '', partnerEmail: '', partnerName: '' });
      localStorage.removeItem('ky_couple_partner_state_v4');
    }
    // If null (network error), keep existing status
  } catch {
    // Network error: preserve existing membership
  }

  try {
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({
        email,
        name,
        role: globalAuthState.role,
        id: user.id,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }

  notifyListeners();
}

export function getAuthState(): AuthState {
  return { ...globalAuthState };
}

export function subscribeToAuth(callback: (state: AuthState) => void): () => void {
  listeners.add(callback);
  callback({ ...globalAuthState });
  return () => {
    listeners.delete(callback);
  };
}

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
    return { ok: false, error: 'ارتباط با سرور برقرار نیست. لطفاً اتصال اینترنت خود را بررسی کنید.' };
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
          error: 'ایمیل یا رمز عبور اشتباه است. لطفاً مجدداً بررسی فرمایید.',
        };
      }
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }

    if (data.user) {
      await syncUserToCoupleSettings(data.user);
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

export async function signUpWithEmail(
  email: string,
  pass: string,
  name?: string
): Promise<{ ok: boolean; error?: string; user?: User; requiresVerification?: boolean }> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    return { ok: false, error: 'لطفاً آدرس ایمیل را وارد کنید.' };
  }
  if (!pass || pass.length < 6) {
    return { ok: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
  }

  const determinedName = name?.trim() || (cleanEmail ? cleanEmail.split('@')[0] : 'کاربر');

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
        },
      },
    });

    if (error) {
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }

    if (data.user) {
      if (data.session) {
        await syncUserToCoupleSettings(data.user);
        globalAuthState.user = data.user;
        globalAuthState.session = data.session;
        notifyListeners();
      }
      return {
        ok: true,
        user: data.user,
        requiresVerification: !data.session,
      };
    }

    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'خطا در ثبت‌نام با سرور احراز هویت.',
    };
  }
}

/**
 * Send password reset email with correct deployment redirect URL
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
    const redirectUrl =
      typeof window !== 'undefined'
        ? window.location.origin + window.location.pathname
        : undefined;

    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      return { ok: false, message: translateSupabaseAuthError(error.message) };
    }
    return { ok: true, message: 'لینک بازیابی رمز عبور به ایمیل شما ارسال شد. لطفاً صندوق ورودی خود را بررسی فرمایید.' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'خطا در ارسال ایمیل بازیابی رمز.' };
  }
}

/**
 * Update authenticated user's password (used in password recovery flow)
 */
export async function updateUserPassword(newPassword: string): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' };
  }
  if (!client) {
    return { ok: false, message: 'اتصال به سرور برقرار نیست.' };
  }

  try {
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, message: translateSupabaseAuthError(error.message) };
    }
    return { ok: true, message: 'رمز عبور شما با موفقیت تغییر یافت.' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'خطا در تغییر رمز عبور.' };
  }
}

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

export function translateSupabaseAuthError(msg: string): string {
  if (!msg) return 'خطایی در احراز هویت رخ داد.';
  if (msg.includes('Password should be at least')) return 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
  if (msg.includes('Invalid email')) return 'فرمت آدرس ایمیل نامعتبر است.';
  if (msg.includes('Email not confirmed')) return 'ایمیل شما هنوز تایید نشده است. لطفاً لینک ارسال شده به ایمیل را باز کنید.';
  if (msg.includes('rate limit')) return 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند دقیقه صبر کنید.';
  if (msg.includes('User already registered')) return 'این ایمیل قبلاً ثبت‌نام شده است. لطفاً وارد شوید.';
  return msg;
}
