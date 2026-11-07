import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudySnapshot, formatSnapshotForPrompt } from '../src/lib/studySnapshot';
import { getDefaultSettings } from '../src/lib/storage';
import { studyDayKey, addDays } from '../src/lib/jalali';
import type { Session, MistakeCard, Exam, DailyPlan, AppSettings } from '../src/types';

function session(overrides: Partial<Session>): Session {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    device_id: 'd1',
    subject: 'bio',
    seconds: 0,
    correct: 0,
    wrong: 0,
    blank: 0,
    note: '',
    day: studyDayKey(),
    type: 'مطالعه',
    ...overrides,
  };
}

function settingsWithGoal(minutes: number, tests: number): AppSettings {
  const s = getDefaultSettings();
  s.dailyGoalMinutes = minutes;
  s.dailyGoalTests = tests;
  s.examDate = addDays(studyDayKey(), 120);
  s.examTitle = 'کنکور تجربی ۱۴۰۶';
  return s;
}

describe('Study Snapshot for AI Coach', () => {
  const today = studyDayKey();

  it('computes today minutes, tests and goal percent from real sessions', () => {
    const snap = buildStudySnapshot({
      sessions: [
        session({ subject: 'bio', seconds: 3600, correct: 18, wrong: 2, blank: 0 }),
        session({ subject: 'chem', seconds: 1800, correct: 5, wrong: 5, blank: 0 }),
      ],
      settings: settingsWithGoal(600, 100),
    });

    assert.equal(snap.today.minutes, 90);
    assert.equal(snap.today.tests, 30);
    assert.equal(snap.today.goalPercent, 15);
    assert.equal(snap.today.subjects.length, 2);
    assert.equal(snap.today.subjects[0].subject, 'bio');
    assert.equal(snap.today.subjects[0].minutes, 60);
  });

  it('includes the live running timer in today minutes', () => {
    const snap = buildStudySnapshot({
      sessions: [session({ seconds: 600 })],
      settings: settingsWithGoal(600, 100),
      isTimerRunning: true,
      liveTimerSeconds: 300,
      activeTimerSubject: 'bio',
    });
    assert.equal(snap.today.minutes, 15);
    assert.equal(snap.today.timerRunning, true);
    assert.ok(snap.today.activeSubject);
  });

  it('excludes soft-deleted rows everywhere', () => {
    const snap = buildStudySnapshot({
      sessions: [
        session({ seconds: 3600 }),
        session({ seconds: 3600, deleted_at: Date.now() }),
      ],
      mistakes: [{ id: 'm', deleted_at: Date.now() } as MistakeCard],
      settings: settingsWithGoal(600, 100),
    });
    assert.equal(snap.today.minutes, 60);
    assert.equal(snap.overall.sessions, 1);
    assert.equal(snap.mistakes.total, 0);
  });

  it('summarises last 7 days and ignores older sessions', () => {
    const snap = buildStudySnapshot({
      sessions: [
        session({ day: today, seconds: 3600 }),
        session({ day: addDays(today, -1), seconds: 1800 }),
        session({ day: addDays(today, -30), seconds: 3600 }),
      ],
      settings: settingsWithGoal(600, 100),
    });
    assert.equal(snap.last7Days.minutes, 90);
    assert.equal(snap.last7Days.activeDays, 2);
    assert.equal(snap.overall.minutes, 150);
  });

  it('finds due and overdue Leitner cards plus weak exam subjects', () => {
    const snap = buildStudySnapshot({
      settings: settingsWithGoal(600, 100),
      mistakes: [
        { id: '1', subject: 'bio', cause: 'بی‌دقتی', next_review: today, deleted_at: null },
        { id: '2', subject: 'bio', cause: 'بی‌دقتی', next_review: addDays(today, -2), deleted_at: null },
        { id: '3', subject: 'math', cause: 'نقص دانش', next_review: addDays(today, 5), deleted_at: null },
      ] as MistakeCard[],
      exams: [
        { id: 'e1', subject: 'bio', day: today, percent: 80, deleted_at: null },
        { id: 'e2', subject: 'math', day: today, percent: 30, deleted_at: null },
        { id: 'e3', subject: 'math', day: addDays(today, -1), percent: 40, deleted_at: null },
      ] as Exam[],
    });

    assert.equal(snap.mistakes.dueToday, 2);
    assert.equal(snap.mistakes.overdue, 1);
    assert.equal(snap.mistakes.bySubject[0].subject, 'bio');
    assert.equal(snap.exams.count, 3);
    assert.equal(snap.exams.weakSubjects[0].subject, 'math');
    assert.equal(snap.exams.weakSubjects[0].avgPercent, 35);
  });

  it('renders a prompt block containing the key real numbers', () => {
    const snap = buildStudySnapshot({
      sessions: [session({ seconds: 3600, correct: 20, wrong: 5, blank: 5 })],
      settings: settingsWithGoal(600, 100),
      plans: [
        {
          id: 'p',
          day: today,
          wake_time: '06:00',
          items: [{ text: 'مرور زیست', done: true }, { text: 'تست شیمی', done: false }],
          created_at: 0,
          updated_at: 0,
          device_id: 'd1',
          deleted_at: null,
        } as DailyPlan,
      ],
    });

    const text = formatSnapshotForPrompt(snap);
    assert.match(text, /امروز: ۶۰ دقیقه/);
    assert.match(text, /۳۰ تست/);
    assert.match(text, /برنامه امروز/);
    assert.match(text, /روز مانده/);
  });
});
