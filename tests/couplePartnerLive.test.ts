import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePartnerLive, CoupleSettings } from '../src/lib/coupleSync';
import { studyDayKey } from '../src/lib/jalali';

describe('computePartnerLive Unified Live State Engine', () => {
  const mockSettings: CoupleSettings = {
    myRole: 'husband',
    pairCode: 'PAIR123',
    myName: 'علی',
    partnerName: 'سارا',
    myEmail: 'ali@example.com',
    partnerEmail: 'sara@example.com',
    simulationEnabled: false,
  };

  const now = 1775985000000; // Fixed deterministic baseline timestamp
  const today = studyDayKey();

  it('حالت ۱: مطالعه در حال اجرا (Active studying in foreground) با اصلاح باگ شمارش دوباره', () => {
    // Partner has 1800s before this session. At heartbeat, session elapsed was 600s, today_seconds = 2400s.
    // Now at 900s into session (15m elapsed):
    const row = {
      pair_code: 'PAIR123',
      role: 'wife',
      display_name: 'سارا',
      is_studying: true,
      online: true,
      subject: 'bio',
      subject_name: 'زیست‌شناسی',
      timer_started_at: now - 900000, // 900s ago
      accumulated_seconds: 0,
      session_elapsed_seconds: 600,
      today_seconds: 2400,
      today_tests: 15,
      study_day: today,
      updated_at: new Date(now - 10000).toISOString(), // 10s ago (< 45s fresh)
    };

    const state = computePartnerLive(row, mockSettings, now);

    assert.equal(state.isStudying, true, 'isStudying must be true');
    assert.equal(state.online, true, 'online must be true');
    assert.equal(state.sessionElapsedSeconds, 900, 'live session should tick to 900 seconds');
    // baseToday = 2400 - 600 = 1800. liveToday = 1800 + 900 = 2700.
    assert.equal(state.todaySeconds, 2700, 'liveToday must not double-count (2700s, not 3300s)');
    assert.equal(state.subject, 'bio');
    assert.equal(state.subjectName, 'زیست‌شناسی');
    assert.equal(state.name, 'سارا');
  });

  it('حالت ۲: حالت stale در فرانت‌اند (Online heartbeat older than 45 seconds)', () => {
    const row = {
      pair_code: 'PAIR123',
      role: 'wife',
      display_name: 'سارا',
      is_studying: true,
      online: true,
      subject: 'bio',
      subject_name: 'زیست‌شناسی',
      timer_started_at: now - 300000,
      accumulated_seconds: 0,
      session_elapsed_seconds: 120,
      today_seconds: 120,
      today_tests: 0,
      study_day: today,
      updated_at: new Date(now - 50000).toISOString(), // 50s ago (> 45s stale)
    };

    const state = computePartnerLive(row, mockSettings, now);

    assert.equal(state.isStudying, false, 'isStudying must become false when heartbeat is stale');
    assert.equal(state.online, false, 'online must become false when heartbeat is stale');
    assert.equal(state.sessionElapsedSeconds, 120, 'session elapsed should retain stored snapshot');
    assert.equal(state.todaySeconds, 120, 'today seconds should retain stored snapshot');
  });

  it('حالت ۲-ب: حالت stale در پس‌زمینه بیش از ۳ ساعت (Background study older than 3 hours)', () => {
    const threeAndHalfHoursAgo = now - 3.5 * 3600 * 1000;
    const row = {
      pair_code: 'PAIR123',
      role: 'wife',
      display_name: 'سارا',
      is_studying: true,
      online: false, // app in background
      subject: 'bio',
      subject_name: 'زیست‌شناسی',
      timer_started_at: threeAndHalfHoursAgo,
      accumulated_seconds: 0,
      session_elapsed_seconds: 600,
      today_seconds: 1800,
      today_tests: 10,
      study_day: today,
      updated_at: new Date(threeAndHalfHoursAgo).toISOString(), // > 3 hours ago
    };

    const state = computePartnerLive(row, mockSettings, now);

    assert.equal(state.isStudying, false, 'Background study exceeding 3 hours must become stale');
    assert.equal(state.online, false, 'online remains false');
  });

  it('حالت ۳: مطالعه در پس‌زمینه (Background active study up to 3 hours with online=false)', () => {
    // 40 minutes into study session. Updated 20 minutes ago.
    // Online is false because browser tab/app went to background.
    const fortyMinutesAgo = now - 40 * 60 * 1000;
    const twentyMinutesAgo = now - 20 * 60 * 1000;

    const row = {
      pair_code: 'PAIR123',
      role: 'wife',
      display_name: 'سارا',
      is_studying: true,
      online: false, // background
      subject: 'chem',
      subject_name: 'شیمی',
      timer_started_at: fortyMinutesAgo,
      accumulated_seconds: 0,
      session_elapsed_seconds: 1200, // 20m at last update
      today_seconds: 2200, // 1000 earlier + 1200
      today_tests: 5,
      study_day: today,
      updated_at: new Date(twentyMinutesAgo).toISOString(), // 20m ago (>> 45s, but well under 3h)
    };

    const state = computePartnerLive(row, mockSettings, now);

    assert.equal(state.isStudying, true, 'isStudying must stay true up to 3 hours in background');
    assert.equal(state.online, false, 'online must remain false to indicate background mode');
    assert.equal(state.sessionElapsedSeconds, 2400, 'session elapsed should tick 40 minutes (2400s)');
    // baseToday = 2200 - 1200 = 1000. liveToday = 1000 + 2400 = 3400.
    assert.equal(state.todaySeconds, 3400, 'todaySeconds accurately tracks 1000s base + 2400s live');
  });

  it('حالت ۴: متوقف / استراحت (Resting / Stopped state)', () => {
    const row = {
      pair_code: 'PAIR123',
      role: 'wife',
      display_name: 'سارا',
      is_studying: false,
      online: true,
      subject: 'bio',
      subject_name: 'زیست‌شناسی',
      timer_started_at: null,
      accumulated_seconds: 0,
      session_elapsed_seconds: 0,
      today_seconds: 3600,
      today_tests: 40,
      study_day: today,
      updated_at: new Date(now - 15000).toISOString(), // 15s ago
    };

    const state = computePartnerLive(row, mockSettings, now);

    assert.equal(state.isStudying, false, 'isStudying must be false');
    assert.equal(state.online, true, 'online should be true if fresh');
    assert.equal(state.sessionElapsedSeconds, 0, 'session elapsed should be 0');
    assert.equal(state.todaySeconds, 3600, 'today seconds preserved');
  });

  it('حالت ۵: ردیف دیروز نباید در «امروز» نشت کند (Cross-day leak guard)', () => {
    const row = {
      pair_code: 'PAIR123',
      role: 'wife',
      display_name: 'سارا',
      is_studying: true,
      online: false, // background
      subject: 'bio',
      subject_name: 'زیست‌شناسی',
      timer_started_at: now - 600000,
      accumulated_seconds: 0,
      session_elapsed_seconds: 600,
      today_seconds: 3600,
      today_tests: 40,
      study_day: '2020-01-01', // stale day, long past
      updated_at: new Date(now - 15000).toISOString(),
    };

    const state = computePartnerLive(row, mockSettings, now);

    assert.equal(state.isStudying, false, 'stale-day background study must not count as active today');
    assert.equal(state.todaySeconds, 0, "yesterday's totals must not leak into today's display");
  });
});
