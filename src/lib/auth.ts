import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import {
  getCoupleSettings,
  saveCoupleSettings,
  fetchMyPairStatus,
  DEFAULT_HUSBAND_NAME,
} from './coupleSync';
import { clearAccountOutbox } from './cloudSync';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  email: string | null;
  name: string;
  role: 'husband' | 'wife';
}

export const DEFAULT_PRODUCTION_URL = 'https://amiramir5.github.io/YarNew/';

/**
 * Returns canonical production site URL for email confirmation and password recovery redirects.
 * Always reads from VITE_SITE_URL if configured, falling back to 'https://amiramir5.github.io/YarNew/'.
 * Ensures auth emails never redirect to localhost or transient preview origins.
 */
export function getAuthRedirectUrl(): string {
  const envUrl = (import.meta as any)?.env?.VITE_SITE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    let clean = envUrl.trim();
    if (!clean.endsWith('/')) {
      clean += '/';
    }
    return clean;
  }
  return DEFAULT_PRODUCTION_URL;
}

const AUTH_PERSIST_KEY = 'ky_authenticated_user_v2';

let passwordRecoveryRequested = false;

export function isPasswordRecoveryRequested(): boolean {
  return passwordRecoveryRequested;
}

export function consumePasswordRecoveryRequested(): boolean {
  const current = passwordRecoveryRequested;
  passwordRecoveryRequested = false;
  return current;
}

export interface AuthUrlCheckResult {
  isRecovery: boolean;
  error: string | null;
  errorCode: string | null;
}

/**
 * Inspects URL parameters (hash fragments and search queries) on initial load.
 * Captures Supabase error callbacks, expired tokens, or password recovery links.
 * Works seamlessly with GitHub Pages base path (/YarNew/).
 */
export function checkAuthUrl(): AuthUrlCheckResult {
  if (typeof window === 'undefined') {
    return { isRecovery: passwordRecoveryRequested, error: null, errorCode: null };
  }

  try {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);
    const searchParams = new URLSearchParams(window.location.search);

    const rawError =
      hashParams.get('error_description') ||
      hashParams.get('error') ||
      searchParams.get('error_description') ||
      searchParams.get('error');

    const rawErrorCode =
      hashParams.get('error_code') ||
      searchParams.get('error_code');

    const type = hashParams.get('type') || searchParams.get('type');
    const isRecovery = type === 'recovery' || passwordRecoveryRequested;

    let friendlyError: string | null = null;
    if (rawError) {
      const decoded = decodeURIComponent(rawError.replace(/\+/g, ' '));
      friendlyError = translateSupabaseAuthError(decoded);
      if (rawErrorCode && rawErrorCode.toLowerCase().includes('otp_expired')) {
        friendlyError = 'لینک بازیابی یا تأیید ایمیل منقضی شده است. لطفاً مجدداً درخواست ارسال کنید.';
      }
    }

    if (isRecovery) {
      passwordRecoveryRequested = true;
    }

    // Clean up error query and hash fragments from URL so refreshing does not keep displaying error,
    // while strictly preserving route and user params like ?tab=...
    if (rawError) {
      const cleanSearch = new URLSearchParams(window.location.search);
      cleanSearch.delete('error');
      cleanSearch.delete('error_code');
      cleanSearch.delete('error_description');
      const searchStr = cleanSearch.toString() ? `?${cleanSearch.toString()}` : '';
      window.history.replaceState(null, '', `${window.location.pathname}${searchStr}`);
    }

    return {
      isRecovery,
      error: friendlyError,
      errorCode: rawErrorCode,
    };
  } catch (e) {
    console.warn('Notice parsing auth URL params:', e);
    return { isRecovery: passwordRecoveryRequested, error: null, errorCode: null };
  }
}

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
        passwordRecoveryRequested = true;
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

    if (data.user && data.session) {
      await syncUserToCoupleSettings(data.user);
      globalAuthState.user = data.user;
      globalAuthState.session = data.session;
      notifyListeners();
      return { ok: true, user: data.user };
    }

    if (data.user && !data.session) {
      // user without session must never be treated as authenticated — sync would silently stall
      return { ok: false, error: 'ورود انجام شد اما نشست فعال دریافت نشد. لطفاً دوباره تلاش کنید.' };
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
    const redirectUrl = getAuthRedirectUrl();
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password: pass,
      options: {
        emailRedirectTo: redirectUrl,
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
      error: translateSupabaseAuthError(err?.message || 'خطا در ثبت‌نام با سرور احراز هویت.'),
    };
  }
}

/**
 * Send password reset email with canonical production deployment redirect URL.
 * Never redirects to localhost or transient preview origins.
 */
export async function resetPasswordForEmail(email: string): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { ok: false, message: 'لطفاً آدرس ایمیل خود را وارد کنید.' };
  }
  if (!client) {
    return { ok: false, message: 'اتصال به سرور Supabase برقرار نیست. لطفاً اتصال اینترنت خود را بررسی نمایید.' };
  }

  try {
    const redirectUrl = getAuthRedirectUrl();

    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      return { ok: false, message: translateSupabaseAuthError(error.message) };
    }
    return {
      ok: true,
      message: 'لینک بازیابی رمز عبور به ایمیل شما ارسال شد. لطفاً صندوق ورودی و پوشه هرزنامه (Spam) خود را بررسی فرمایید.',
    };
  } catch (err: any) {
    return { ok: false, message: translateSupabaseAuthError(err?.message || 'خطا در ارسال ایمیل بازیابی رمز.') };
  }
}

/**
 * Update authenticated user's password (used in password recovery flow).
 * Truly executes supabase.auth.updateUser({ password: newPassword }) with session verification.
 */
export async function updateUserPassword(newPassword: string): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' };
  }
  if (!client) {
    return { ok: false, message: 'اتصال به سرور Supabase برقرار نیست. لطفاً اتصال اینترنت خود را بررسی نمایید.' };
  }

  try {
    // Check for active session to guard against invalid or expired recovery tokens
    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    if (sessionErr) {
      return { ok: false, message: translateSupabaseAuthError(sessionErr.message) };
    }
    if (!sessionData?.session?.user) {
      return {
        ok: false,
        message: 'نشست بازیابی رمز عبور نامعتبر یا منقضی شده است. لطفاً مجدداً از بخش بازیابی، درخواست ارسال لینک جدید نمایید.',
      };
    }

    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, message: translateSupabaseAuthError(error.message) };
    }

    if (data?.user) {
      globalAuthState.user = data.user;
      notifyListeners();
    }

    return {
      ok: true,
      message: 'رمز عبور شما با موفقیت تغییر یافت. اکنون می‌توانید با رمز عبور جدید وارد شوید.',
    };
  } catch (err: any) {
    return { ok: false, message: translateSupabaseAuthError(err?.message || 'خطا در تغییر رمز عبور.') };
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

  const previousEmail = globalAuthState.email;
  globalAuthState.user = null;
  globalAuthState.session = null;
  globalAuthState.email = null;
  localStorage.removeItem(AUTH_PERSIST_KEY);
  // Also drop the cached authenticated-user marker used by getActiveUserEmail()
  localStorage.removeItem('ky_authenticated_user_v2');

  // Clear pending outbox queue for the signed-out account to prevent cross-account leak
  try {
    clearAccountOutbox(previousEmail || undefined);
  } catch {}

  // Clear couple-identity residue so the next visitor on this device isn't
  // silently namespaced to the departed account (getActiveUserEmail fallback).
  try {
    localStorage.removeItem('ky_couple_my_email_v4');
    localStorage.removeItem('ky_couple_my_role_v4');
    localStorage.removeItem('ky_couple_partner_state_v4');
    localStorage.removeItem('ky_couple_my_state_v4');
    const deadLetterKeyLegacy = previousEmail
      ? `ky_sync_dead_letter_v2__${String(previousEmail).replace(/[^a-zA-Z0-9_@.-]/g, '_')}`
      : 'ky_sync_dead_letter_v2';
    localStorage.removeItem(deadLetterKeyLegacy);
    if (previousEmail) {
      localStorage.removeItem(`ky_sync_dead_letter_v2__${encodeURIComponent(previousEmail).replace(/%/g, '_')}`);
    }
    localStorage.removeItem('ky_sync_dead_letter_v2');
  } catch {}

  // Notify the app so it can reload anonymous/local data
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('konkoor_profile_switched'));
  }

  notifyListeners();
}

export function translateSupabaseAuthError(msg: string): string {
  if (!msg) return 'خطایی در احراز هویت رخ داد.';
  const lower = msg.toLowerCase();

  if (lower.includes('password should be at least')) {
    return 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid_grant')) {
    return 'ایمیل یا رمز عبور اشتباه است. لطفاً مجدداً بررسی فرمایید.';
  }
  if (lower.includes('invalid email') || lower.includes('email is invalid')) {
    return 'فرمت آدرس ایمیل نامعتبر است.';
  }
  if (lower.includes('email not confirmed')) {
    return 'ایمیل شما هنوز تأیید نشده است. لطفاً پیوند تأیید ارسال‌شده به ایمیلتان را باز کنید.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر مجدداً تلاش فرمایید.';
  }
  if (lower.includes('user already registered') || lower.includes('user_already_exists')) {
    return 'این آدرس ایمیل قبلاً در سیستم ثبت‌نام شده است. لطفاً وارد شوید.';
  }
  if (
    lower.includes('email link is invalid or has expired') ||
    lower.includes('otp_expired') ||
    lower.includes('token has expired') ||
    lower.includes('token_expired')
  ) {
    return 'پیوند بازیابی یا تأیید ایمیل منقضی شده یا نامعتبر است. لطفاً مجدداً درخواست ارسال نمایید.';
  }
  if (lower.includes('auth session missing') || lower.includes('session_missing')) {
    return 'نشست بازیابی رمز یافت نشد یا منقضی شده است. لطفاً مجدداً درخواست بازیابی ثبت کنید.';
  }
  if (lower.includes('new password should be different')) {
    return 'رمز عبور جدید باید با رمز قبلی متفاوت باشد.';
  }
  if (lower.includes('unauthorized_client') || lower.includes('access_denied')) {
    return 'درخواست دسترسی معتبر نیست یا پیوند منقضی گردیده است.';
  }
  if (lower.includes('for security purposes, you can only request')) {
    return 'به دلایل امنیتی، لطفاً قبل از ارسال درخواست مجدد، اندکی صبر کنید.';
  }
  if (lower.includes('user not found')) {
    return 'کاربری با این آدرس ایمیل پیدا نشد.';
  }
  if (lower.includes('jwt expired')) {
    return 'اعتبار نشست کاری به پایان رسیده است. لطفاً مجدداً وارد شوید.';
  }
  return msg;
}
