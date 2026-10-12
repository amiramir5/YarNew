/**
 * Centralized Wake Lock Management for YarNew 2.0
 * Prevents competition between views, safely handles visibility change & page locks.
 */

let wakeLockSentinel: any = null;
let isRequestedByApp = false;

export async function requestAppWakeLock(): Promise<boolean> {
  isRequestedByApp = true;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }

  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return true;
    }

    wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch (err) {
    console.warn('WakeLock request notice:', err);
    return false;
  }
}

export async function releaseAppWakeLock(): Promise<void> {
  isRequestedByApp = false;
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch (_) {}
    wakeLockSentinel = null;
  }
}

export function isAppWakeLockActive(): boolean {
  return Boolean(wakeLockSentinel && !wakeLockSentinel.released);
}

// Automatically re-acquire when returning from background if user had it requested
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isRequestedByApp) {
      await requestAppWakeLock();
    }
  });
}
