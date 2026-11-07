import {
  AppSettings,
  DailyPlan,
  Exam,
  MistakeCard,
  ProgressEntry,
  Session,
} from '../types';
import { getSubject, KONKOOR_SUBJECTS } from './constants';
import {
  addDays,
  calcDaysLeft,
  calcKonkoorPercent,
  computeStreak,
  faNum,
  fmtHM,
  studyDayKey,
} from './jalali';

/**
 * Compact, AI-consumable picture of the student's real state.
 *
 * The study coach used to receive only the *count* of sessions and mistakes, so
 * it could not answer questions like "how far behind am I?" or "which subject is
 * dragging my score down?". Everything it now needs is derived here from the
 * same local data the rest of the app renders, so the answers are grounded in
 * facts instead of generic advice.
 */
export interface StudySnapshotInput {
  sessions?: Session[];
  mistakes?: MistakeCard[];
  exams?: Exam[];
  plans?: DailyPlan[];
  progressList?: ProgressEntry[];
  settings?: AppSettings;
  liveTimerSeconds?: number;
  activeTimerSubject?: string;
  isTimerRunning?: boolean;
}

export interface SubjectStat {
  subject: string;
  subjectName: string;
  minutes: number;
  tests: number;
  percent: number | null;
}

export interface StudySnapshot {
  examTarget: { title: string; date: string; daysLeft: number } | null;
  goals: { dailyMinutes: number; dailyTests: number };
  today: {
    day: string;
    minutes: number;
    /** Progress toward the daily minute goal, 0-100. */
    goalPercent: number;
    tests: number;
    correct: number;
    wrong: number;
    blank: number;
    percent: number | null;
    subjects: SubjectStat[];
    timerRunning: boolean;
    activeSubject: string | null;
  };
  last7Days: {
    minutes: number;
    /** Average minutes per *elapsed* day, including empty days. */
    avgMinutes: number;
    activeDays: number;
    days: Array<{ day: string; minutes: number }>;
  };
  overall: {
    minutes: number;
    sessions: number;
    streak: number;
    firstDay: string | null;
  };
  mistakes: {
    total: number;
    dueToday: number;
    bySubject: Array<{ subject: string; count: number }>;
    byCause: Array<{ cause: string; count: number }>;
    overdue: number;
  };
  exams: {
    count: number;
    avgPercent: number | null;
    recent: Array<{ subject: string; day: string; percent: number }>;
    /** Subjects with the weakest average percent, worst first. */
    weakSubjects: Array<{ subject: string; avgPercent: number; count: number }>;
  };
  subjects: {
    studiedLast7Days: Array<{ subject: string; minutes: number }>;
    neverStudied: string[];
  };
  planToday: {
    day: string;
    wakeTime: string;
    done: number;
    total: number;
    items: Array<{ text: string; done: boolean }>;
  } | null;
  recentProgress: Array<{ day: string; subject: string; chapter: string }>;
}

function minutesOf(seconds: number | null | undefined): number {
  return Math.max(0, Math.round((seconds || 0) / 60));
}

function subjectName(id: string | null | undefined): string {
  if (!id) return 'نامشخص';
  return getSubject(id).name || id;
}

function groupMinutes(
  sessions: Session[],
  subjectGetter: (s: Session) => string
): Record<string, number> {
  const map: Record<string, number> = {};
  sessions.forEach((s) => {
    const key = subjectGetter(s);
    map[key] = (map[key] || 0) + minutesOf(s.seconds);
  });
  return map;
}

/**
 * Builds the full snapshot from raw app data. Pure and side-effect free so it
 * can be unit tested in Node.
 */
export function buildStudySnapshot(input: StudySnapshotInput): StudySnapshot {
  const settings = input.settings;
  const today = studyDayKey();
  const dailyGoalMinutes = settings?.dailyGoalMinutes || 600;
  const dailyGoalTests = settings?.dailyGoalTests || 100;

  const liveSessions = (input.sessions || []).filter((s) => s && !s.deleted_at);
  const liveMistakes = (input.mistakes || []).filter((m) => m && !m.deleted_at);
  const liveExams = (input.exams || []).filter((e) => e && !e.deleted_at);

  // ── Today ────────────────────────────────────────────────────────────────
  const todaySessions = liveSessions.filter((s) => s.day === today);
  const todayStaticSeconds = todaySessions.reduce((acc, s) => acc + (s.seconds || 0), 0);
  const liveSeconds = input.isTimerRunning ? Math.max(0, input.liveTimerSeconds || 0) : 0;
  const todayMinutes = Math.round((todayStaticSeconds + liveSeconds) / 60);

  const todayCorrect = todaySessions.reduce((acc, s) => acc + (s.correct || 0), 0);
  const todayWrong = todaySessions.reduce((acc, s) => acc + (s.wrong || 0), 0);
  const todayBlank = todaySessions.reduce((acc, s) => acc + (s.blank || 0), 0);
  const todayTests = todayCorrect + todayWrong + todayBlank;

  const todaySubjectMap = groupMinutes(todaySessions, (s) => s.subject);
  const todaySubjects: SubjectStat[] = Object.entries(todaySubjectMap)
    .map(([subject, minutes]) => {
      const rows = todaySessions.filter((s) => s.subject === subject);
      const c = rows.reduce((a, s) => a + (s.correct || 0), 0);
      const w = rows.reduce((a, s) => a + (s.wrong || 0), 0);
      const b = rows.reduce((a, s) => a + (s.blank || 0), 0);
      const tests = c + w + b;
      return {
        subject,
        subjectName: subjectName(subject),
        minutes,
        tests,
        percent: tests > 0 ? calcKonkoorPercent(c, w, b) : null,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  // ── Last 7 study days (today included) ───────────────────────────────────
  const days: Array<{ day: string; minutes: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const minutes = liveSessions
      .filter((s) => s.day === day)
      .reduce((acc, s) => acc + minutesOf(s.seconds), 0);
    days.push({ day, minutes: i === 0 ? Math.max(minutes, todayMinutes) : minutes });
  }
  const weekMinutes = days.reduce((acc, d) => acc + d.minutes, 0);
  const activeDays = days.filter((d) => d.minutes > 0).length;

  // ── Overall ──────────────────────────────────────────────────────────────
  const totalMinutes = liveSessions.reduce((acc, s) => acc + minutesOf(s.seconds), 0);
  const sortedDays = liveSessions.map((s) => s.day).filter(Boolean).sort();

  // ── Mistakes / Leitner ───────────────────────────────────────────────────
  const dueToday = liveMistakes.filter((m) => m.next_review && m.next_review <= today).length;
  const overdue = liveMistakes.filter(
    (m) => m.next_review && m.next_review < today
  ).length;

  const mistakeSubjectMap: Record<string, number> = {};
  const mistakeCauseMap: Record<string, number> = {};
  liveMistakes.forEach((m) => {
    mistakeSubjectMap[m.subject] = (mistakeSubjectMap[m.subject] || 0) + 1;
    if (m.cause) mistakeCauseMap[m.cause] = (mistakeCauseMap[m.cause] || 0) + 1;
  });

  // ── Exams ────────────────────────────────────────────────────────────────
  const examPercents = liveExams
    .filter((e) => Number.isFinite(e.percent))
    .map((e) => e.percent);
  const avgPercent = examPercents.length
    ? Math.round((examPercents.reduce((a, b) => a + b, 0) / examPercents.length) * 10) / 10
    : null;

  const recentExams = [...liveExams]
    .sort((a, b) => (b.day || '').localeCompare(a.day || ''))
    .slice(0, 6)
    .map((e) => ({ subject: e.subject, day: e.day, percent: e.percent }));

  const examBySubject: Record<string, number[]> = {};
  liveExams.forEach((e) => {
    if (Number.isFinite(e.percent)) {
      (examBySubject[e.subject] ||= []).push(e.percent);
    }
  });
  const weakSubjects = Object.entries(examBySubject)
    .map(([subject, list]) => ({
      subject,
      avgPercent:
        Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
      count: list.length,
    }))
    .sort((a, b) => a.avgPercent - b.avgPercent)
    .slice(0, 4);

  // ── Subject coverage ─────────────────────────────────────────────────────
  const weekDates = new Set(days.map((d) => d.day));
  const weekSubjectMap = groupMinutes(
    liveSessions.filter((s) => weekDates.has(s.day)),
    (s) => s.subject
  );
  const studiedLast7Days = Object.entries(weekSubjectMap)
    .map(([subject, minutes]) => ({ subject, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  // Only the canonical konkur subjects count as gaps; extra custom subjects a
  // student invents must not be reported as "never studied".
  const neverStudied = KONKOOR_SUBJECTS.map((s) => s.id)
    .filter((id) => !weekSubjectMap[id])
    .slice(0, 8);

  // ── Today's plan ─────────────────────────────────────────────────────────
  const plan = (input.plans || []).find((p) => p && !p.deleted_at && p.day === today);
  const planToday = plan
    ? {
        day: plan.day,
        wakeTime: plan.wake_time || '—',
        done: plan.items.filter((i) => i.done).length,
        total: plan.items.length,
        items: plan.items.slice(0, 12).map((i) => ({ text: i.text, done: i.done })),
      }
    : null;

  // ── Recent progress notes ────────────────────────────────────────────────
  const recentProgress = [...(input.progressList || [])]
    .filter((p) => p && !p.deleted_at)
    .sort((a, b) => (b.day || '').localeCompare(a.day || ''))
    .slice(0, 8)
    .map((p) => ({ day: p.day, subject: p.subject, chapter: p.chapter }));

  const examDate = settings?.examDate;
  const examTarget = examDate
    ? {
        title: settings?.examTitle || 'کنکور',
        date: examDate,
        daysLeft: Math.max(0, calcDaysLeft(examDate)),
      }
    : null;

  return {
    examTarget,
    goals: { dailyMinutes: dailyGoalMinutes, dailyTests: dailyGoalTests },
    today: {
      day: today,
      minutes: todayMinutes,
      goalPercent: dailyGoalMinutes
        ? Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100))
        : 0,
      tests: todayTests,
      correct: todayCorrect,
      wrong: todayWrong,
      blank: todayBlank,
      percent: todayTests > 0 ? calcKonkoorPercent(todayCorrect, todayWrong, todayBlank) : null,
      subjects: todaySubjects,
      timerRunning: !!input.isTimerRunning,
      activeSubject: input.isTimerRunning ? subjectName(input.activeTimerSubject) : null,
    },
    last7Days: {
      minutes: weekMinutes,
      avgMinutes: Math.round(weekMinutes / 7),
      activeDays,
      days,
    },
    overall: {
      minutes: totalMinutes,
      sessions: liveSessions.length,
      streak: computeStreak(liveSessions),
      firstDay: sortedDays.length ? sortedDays[0] : null,
    },
    mistakes: {
      total: liveMistakes.length,
      dueToday,
      overdue,
      bySubject: Object.entries(mistakeSubjectMap)
        .map(([subject, count]) => ({ subject, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      byCause: Object.entries(mistakeCauseMap)
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
    exams: {
      count: liveExams.length,
      avgPercent,
      recent: recentExams,
      weakSubjects,
    },
    subjects: { studiedLast7Days, neverStudied },
    planToday,
    recentProgress,
  };
}

/**
 * Renders the snapshot as a short, dense Persian block. The model reads this far
 * more reliably than a raw JSON dump and it keeps the prompt small.
 */
export function formatSnapshotForPrompt(snapshot: StudySnapshot): string {
  const lines: string[] = [];
  const t = snapshot.today;

  if (snapshot.examTarget) {
    lines.push(
      `آزمون هدف: ${snapshot.examTarget.title} — ${faNum(snapshot.examTarget.daysLeft)} روز مانده`
    );
  }
  lines.push(
    `هدف روزانه: ${faNum(snapshot.goals.dailyMinutes)} دقیقه مطالعه و ${faNum(
      snapshot.goals.dailyTests
    )} تست`
  );

  const todaySubj = t.subjects.length
    ? t.subjects
        .map((s) =>
          s.percent === null
            ? `${s.subjectName} ${faNum(s.minutes)}د`
            : `${s.subjectName} ${faNum(s.minutes)}د (${faNum(s.tests)} تست، ${faNum(s.percent)}٪)`
        )
        .join('، ')
    : 'بدون مطالعه';
  lines.push(
    `امروز: ${faNum(t.minutes)} دقیقه (${faNum(t.goalPercent)}٪ هدف)` +
      (t.tests > 0
        ? `، ${faNum(t.tests)} تست با درصد ${faNum(t.percent ?? 0)}٪ (درست ${faNum(
            t.correct
          )}، غلط ${faNum(t.wrong)}، نزده ${faNum(t.blank)})`
        : '، بدون تست') +
      ` | دروس: ${todaySubj}`
  );
  if (t.timerRunning && t.activeSubject) {
    lines.push(`همین حالا تایمر روی «${t.activeSubject}» در حال اجراست.`);
  }

  const week = snapshot.last7Days;
  lines.push(
    `۷ روز اخیر: ${fmtHM(week.minutes)} مجموع، میانگین ${faNum(
      week.avgMinutes
    )} دقیقه/روز، ${faNum(week.activeDays)} روز فعال`
  );
  const weekDays = week.days
    .map((d) => `${faNum(d.minutes)}`)
    .join(' / ');
  lines.push(`دقیقه روزهای ۷ روز اخیر (قدیم به جدید): ${weekDays}`);

  lines.push(
    `کل: ${fmtHM(snapshot.overall.minutes)} در ${faNum(
      snapshot.overall.sessions
    )} جلسه، زنجیره ${faNum(snapshot.overall.streak)} روز`
  );

  const m = snapshot.mistakes;
  if (m.total) {
    const bySubj = m.bySubject
      .map((s) => `${subjectName(s.subject)} ${faNum(s.count)}`)
      .join('، ');
    const byCause = m.byCause
      .map((c) => `${c.cause} ${faNum(c.count)}`)
      .join('، ');
    lines.push(
      `لایتنر: ${faNum(m.total)} کارت، ${faNum(m.dueToday)} موعد مرور امروز` +
        (m.overdue ? ` (${faNum(m.overdue)} عقب‌افتاده)` : '') +
        (bySubj ? ` | دروس: ${bySubj}` : '') +
        (byCause ? ` | علل غلط: ${byCause}` : '')
    );
  } else {
    lines.push('لایتنر: هنوز کارت اشتباهی ثبت نشده.');
  }

  const e = snapshot.exams;
  if (e.count) {
    const recent = e.recent
      .map((x) => `${subjectName(x.subject)} ${faNum(x.percent)}٪`)
      .join('، ');
    const weak = e.weakSubjects
      .map((w) => `${subjectName(w.subject)} ${faNum(w.avgPercent)}٪`)
      .join('، ');
    lines.push(
      `آزمون‌ها: ${faNum(e.count)} آزمون، میانگین ${faNum(e.avgPercent ?? 0)}٪` +
        (recent ? ` | اخیر: ${recent}` : '') +
        (weak ? ` | ضعیف‌ترین: ${weak}` : '')
    );
  } else {
    lines.push('آزمون‌ها: هنوز آزمونی ثبت نشده.');
  }

  if (snapshot.subjects.studiedLast7Days.length) {
    lines.push(
      `توزیع دروس ۷ روز اخیر: ${snapshot.subjects.studiedLast7Days
        .map((s) => `${subjectName(s.subject)} ${faNum(s.minutes)}د`)
        .join('، ')}`
    );
  }
  if (snapshot.subjects.neverStudied.length) {
    lines.push(
      `دروس بدون مطالعه در ۷ روز اخیر: ${snapshot.subjects.neverStudied
        .map(subjectName)
        .join('، ')}`
    );
  }

  if (snapshot.planToday) {
    const p = snapshot.planToday;
    lines.push(
      `برنامه امروز: ${faNum(p.done)} از ${faNum(p.total)} آیتم انجام شده` +
        (p.items.length
          ? ` | آیتم‌ها: ${p.items
              .map((i) => `${i.done ? '✓' : '•'} ${i.text}`)
              .join('؛ ')}`
          : '')
    );
  } else {
    lines.push('برنامه امروز: ثبت نشده.');
  }

  if (snapshot.recentProgress.length) {
    lines.push(
      `آخرین مباحث کارشده: ${snapshot.recentProgress
        .map((p) => `${subjectName(p.subject)} - ${p.chapter}`)
        .join('؛ ')}`
    );
  }

  return lines.join('\n');
}
