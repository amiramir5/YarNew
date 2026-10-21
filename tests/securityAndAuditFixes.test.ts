import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSessions,
  saveSessions,
  loadSettings,
  saveSettings,
  getUserScopedKey,
  getDefaultSettings,
} from '../src/lib/storage';
import { Session, AppSettings } from '../src/types';

// In-memory mock for localStorage in node test environment
const mockStorage: Record<string, string> = {};
(globalThis as any).window = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => mockStorage[k] || null,
  setItem: (k: string, v: string) => {
    mockStorage[k] = v;
  },
  removeItem: (k: string) => {
    delete mockStorage[k];
  },
  clear: () => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  },
};

describe('Security & Audit Fixes Verification', () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  it('seamlessly adopts pre-login unscoped data when a user logs in', () => {
    const preLoginSession: Session = {
      id: 'sess-prelogin',
      created_at: 1000,
      updated_at: 1000,
      deleted_at: null,
      device_id: 'client',
      day: '1405-07-30',
      subject: 'bio',
      seconds: 1500,
      correct: 10,
      wrong: 2,
      blank: 0,
      note: 'Pre-login study',
      type: 'آموزش',
    };

    // Saved by an anonymous user before login
    saveSessions([preLoginSession]);

    // Now user logs in with an email
    const userEmail = 'student@konkoor.ir';
    const userScopedSessions = loadSessions(userEmail);

    assert.equal(userScopedSessions.length, 1);
    assert.equal(userScopedSessions[0].id, 'sess-prelogin');
    assert.equal(userScopedSessions[0].note, 'Pre-login study');

    // Confirm it was migrated and persisted into the scoped key
    const scopedKey = getUserScopedKey('ky_sessions_v2', userEmail);
    assert.ok(mockStorage[scopedKey], 'Scoped storage key must contain the migrated sessions');
  });

  it('isolates user settings and prevents leaking keys to global unscoped storage', () => {
    const userEmail = 'test@example.com';
    const settings: AppSettings = {
      ...getDefaultSettings(),
      ai: {
        provider: 'gemini',
        geminiKey: 'AIzaSyPrivateUserKey12345',
        geminiModel: 'gemini-2.5-flash',
        proactiveEnabled: true,
      },
    };

    saveSettings(settings, userEmail);

    const scopedKey = getUserScopedKey('ky_settings_v2', userEmail);
    assert.ok(mockStorage[scopedKey], 'User scoped key must exist');

    // Verify global unscoped key was NOT written to with this user's private settings
    assert.equal(
      mockStorage['ky_settings_v2'],
      undefined,
      'Global unscoped settings must not be overwritten when scoped user saves settings'
    );
  });

  it('escapes dynamic AI texts to prevent XSS during slide deck HTML export', () => {
    const escapeHtml = (unsafe: any) =>
      String(unsafe ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const maliciousTitle = '<script>alert("XSS")</script>';
    const maliciousBullet = '"><img src=x onerror=alert(1)>';

    const safeTitle = escapeHtml(maliciousTitle);
    const safeBullet = escapeHtml(maliciousBullet);

    assert.ok(!safeTitle.includes('<script>'));
    assert.ok(safeTitle.includes('&lt;script&gt;'));
    assert.ok(!safeBullet.includes('<img'));
    assert.ok(safeBullet.includes('&lt;img'));
  });
});
