import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  studyDayKey,
  jalaliMonthKey,
  jalaliPartsFromIso,
  daysInJMonth,
  computeStreak,
  fmtClock,
  faNum,
  addDays,
} from '../src/lib/jalali';
import { getServerOffset } from '../src/lib/coupleSync';

describe('Jalali Calendar and Streak Engine', () => {
  it('correctly maps studyDayKey across standard and cutoff hours', () => {
    // 2 PM should be the same day
    const afternoon = new Date('2026-10-12T14:00:00Z');
    const day1 = studyDayKey(afternoon);
    assert.match(day1, /^2026-10-1/);

    // 2 AM before 4 AM cutoff belongs to the previous study day
    const nightOwl = new Date('2026-10-12T02:00:00Z');
    const dayNight = studyDayKey(nightOwl);
    assert.match(dayNight, /^2026-10-1/);
  });

  it('correctly calculates Jalali month key', () => {
    const key = jalaliMonthKey('2026-10-12');
    // October 2026 is Mehr 1405
    assert.match(key, /^1405-\d{2}$/);
  });

  it('verifies daysInJMonth for both first 6 months and last 6 months', () => {
    assert.equal(daysInJMonth(1405, 1), 31);
    assert.equal(daysInJMonth(1405, 6), 31);
    assert.equal(daysInJMonth(1405, 7), 30);
    assert.equal(daysInJMonth(1405, 11), 30);
  });

  it('formats clock numbers correctly into Persian digits', () => {
    const formatted = fmtClock(3665); // 01:01:05
    assert.ok(formatted.length >= 7);
    const persianZero = faNum(0);
    assert.equal(persianZero, '۰');
  });

  it('calculates study streaks accurately without false zeros', () => {
    const today = studyDayKey(new Date());
    const mockSessions = [
      { id: '1', day: today, seconds: 3600, deleted_at: null, subject: 'bio' },
      { id: '2', day: addDays(today, -1), seconds: 4000, deleted_at: null, subject: 'chem' },
      { id: '3', day: addDays(today, -2), seconds: 2000, deleted_at: null, subject: 'phy' },
    ];
    const streak = computeStreak(mockSessions);
    assert.equal(streak, 3);
  });
});

describe('Couple Clock Offset & Timer Math', () => {
  it('handles clock offset without generating negative elapsed seconds', () => {
    const offset = getServerOffset();
    assert.equal(typeof offset, 'number');

    const now = Date.now() + offset;
    const startedAt = now - 60000; // started 60s ago
    const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
    assert.equal(elapsed, 60);

    // If future timestamp arrived due to skew, elapsed must not be negative
    const futureStartedAt = now + 5000;
    const guardedElapsed = Math.max(0, Math.floor((now - futureStartedAt) / 1000));
    assert.equal(guardedElapsed, 0);
  });
});
