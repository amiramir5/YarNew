import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultSettings,
  loadSettings,
  saveSettings,
  ALLOWED_GEMINI_MODELS,
} from '../src/lib/storage';

describe('AI Settings & Allowed Models Configuration', () => {
  it('defaults to gemini-3.5-flash and has no OpenRouter fields in default settings', () => {
    const defaults = getDefaultSettings();
    assert.equal(defaults.ai.geminiModel, 'gemini-3.5-flash');
    assert.equal(typeof defaults.ai.geminiKey, 'string');
    // Ensure openrouter and legacy provider fields do not exist
    assert.equal((defaults.ai as any).primaryProvider, undefined);
    assert.equal((defaults.ai as any).fallbackEnabled, undefined);
    assert.equal((defaults.ai as any).openrouterKey, undefined);
    assert.equal((defaults.ai as any).openrouterModel, undefined);
  });

  it('ALLOWED_GEMINI_MODELS matches expected candidate models', () => {
    assert.deepEqual(Array.from(ALLOWED_GEMINI_MODELS), [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
    ]);
  });

  it('resets invalid or obsolete models like gemini-3.8-flash back to default gemini-3.5-flash in loadSettings', () => {
    // Mock localStorage in global scope for Node test
    const storageStore: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => storageStore[key] || null,
      setItem: (key: string, val: string) => { storageStore[key] = val; },
      removeItem: (key: string) => { delete storageStore[key]; },
    };
    (globalThis as any).window = {};
    (globalThis as any).localStorage = mockStorage;

    saveSettings({
      ...getDefaultSettings(),
      ai: {
        geminiKey: 'AIzaSyTestKey',
        geminiModel: 'gemini-3.8-flash', // obsolete model
      },
    } as any);

    const loaded = loadSettings();
    assert.equal(loaded.ai.geminiModel, 'gemini-3.5-flash');
    assert.equal(loaded.ai.geminiKey, 'AIzaSyTestKey');
    assert.equal((loaded.ai as any).openrouterKey, undefined);
  });

  it('preserves approved candidate models in loadSettings', () => {
    saveSettings({
      ...getDefaultSettings(),
      ai: {
        geminiKey: 'AIzaSyTestKey',
        geminiModel: 'gemini-3.1-flash-lite',
      },
    });

    const loaded = loadSettings();
    assert.equal(loaded.ai.geminiModel, 'gemini-3.1-flash-lite');
  });
});
