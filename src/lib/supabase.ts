import { createClient } from '@supabase/supabase-js';

// User-provided Supabase project credentials
export const DEFAULT_SUPABASE_URL = 'https://fsyfdwgtteeyxtoumltz.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_OAtQRxO5sP6unCn_5BnxMA_Wm0Z7LEN';

export const SUPABASE_STORAGE_KEY = 'ky_supabase_config_v2';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  syncEnabled: boolean;
}

export function getSupabaseConfig(): SupabaseConfig {
  if (typeof window === 'undefined') {
    return {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
      syncEnabled: true,
    };
  }

  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) {
      return {
        url: DEFAULT_SUPABASE_URL,
        anonKey: DEFAULT_SUPABASE_ANON_KEY,
        syncEnabled: true,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      url: parsed.url || DEFAULT_SUPABASE_URL,
      anonKey: parsed.anonKey || DEFAULT_SUPABASE_ANON_KEY,
      syncEnabled: parsed.syncEnabled !== false,
    };
  } catch {
    return {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
      syncEnabled: true,
    };
  }
}

export function saveSupabaseConfig(cfg: SupabaseConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify(cfg));
}

let cachedClient: any = null;
let currentKey = '';

export function getSupabaseClient() {
  const cfg = getSupabaseConfig();
  const key = `${cfg.url}:::${cfg.anonKey}`;
  if (cachedClient && currentKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    currentKey = key;
    return cachedClient;
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
}

/**
 * Test connectivity with Supabase project
 */
export async function testSupabaseConnection(customUrl?: string, customKey?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const url = customUrl?.trim() || getSupabaseConfig().url;
    const anonKey = customKey?.trim() || getSupabaseConfig().anonKey;

    if (!url || !anonKey) {
      return { ok: false, message: 'آدرس URL یا کلید Anon وارد نشده است.' };
    }

    const testClient = createClient(url, anonKey);
    // Ping with a lightweight query using select('*', { count: 'exact', head: true })
    const { error } = await testClient.from('couple_live_states').select('*', { count: 'exact', head: true });
    
    if (error) {
      // 42P01: Table does not exist yet (schema not created), but server connected successfully
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return { ok: true, message: 'ارتباط با سرور Supabase موفقیت‌آمیز است (جدول‌ها هنوز با اسکریپت SQL ساخته نشده‌اند).' };
      }
      return { ok: false, message: `خطای سرور Supabase: ${error.message} (${error.code || 'خطای دسترسی'})` };
    }

    return { ok: true, message: 'اتصال به دیتابیس Supabase پایدار و موفقیت‌آمیز است.' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'خطا در برقراری ارتباط با Supabase' };
  }
}
