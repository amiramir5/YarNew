import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  ArrowRight,
  Sparkles,
  BookOpen,
  Layers,
  Volume2,
  VolumeX,
  Settings2,
  Minimize2,
  Maximize2,
  Compass,
  CheckCircle2,
  Flame,
} from 'lucide-react';
import { Session, AppSettings, MistakeCard, ViewId } from '../../types';
import { studyDayKey, faNum } from '../../lib/jalali';
import { getSubject } from '../../lib/constants';
import { consultPoofyLive } from '../../lib/ai';
import { PoofyMascot, PoofyMood } from './PoofyMascot';

interface ProactiveFloatingWidgetProps {
  sessions: Session[];
  mistakes: MistakeCard[];
  settings: AppSettings;
  isTimerRunning: boolean;
  activeSubject: string;
  onNavigate: (view: ViewId) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
  /** Current app view — the floating Poofy hides itself on the timer tab (only one Poofy at a time). */
  activeView?: ViewId;
}

export const ProactiveFloatingWidget: React.FC<ProactiveFloatingWidgetProps> = ({
  sessions,
  mistakes,
  settings,
  isTimerRunning,
  activeSubject,
  onNavigate,
  onUpdateSettings,
  activeView,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [milestoneToast, setMilestoneToast] = useState<{
    id: string;
    text: string;
    mood: PoofyMood;
  } | null>(null);

  // Minimized micro-state for students who want maximum screen space
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('ky_poofy_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const today = studyDayKey();
  const todaySessions = useMemo(() => sessions.filter((s) => !s.deleted_at && s.day === today), [sessions, today]);
  const todayMinutes = useMemo(
    () => Math.round(todaySessions.reduce((acc, s) => acc + (s.seconds || 0), 0) / 60),
    [todaySessions]
  );

  // Subject breakdown today
  const todaySubjectMinutes = useMemo(() => {
    const map: Record<string, number> = {};
    todaySessions.forEach((s) => {
      map[s.subject] = (map[s.subject] || 0) + Math.round((s.seconds || 0) / 60);
    });
    return map;
  }, [todaySessions]);

  // Due mistakes count
  const dueMistakesCount = useMemo(
    () => mistakes.filter((m) => !m.deleted_at && m.next_review <= today).length,
    [mistakes, today]
  );

  // Grade bias calculation (last 20 sessions)
  const gradeStats = useMemo(() => {
    let g12 = 0;
    let base = 0;
    sessions.slice(-20).forEach((s) => {
      const ch = s.chapter || '';
      if (ch.includes('دوازدهم') || s.book?.includes('دوازدهم')) g12 += s.seconds || 0;
      else if (ch.includes('دهم') || ch.includes('یازدهم') || s.book?.includes('دهم') || s.book?.includes('یازدهم')) {
        base += s.seconds || 0;
      }
    });
    return { g12, base };
  }, [sessions]);

  // Mode and position from settings
  const poofyMode = settings.ai.poofyMode || 'dynamic';
  const poofyPosition = settings.ai.poofyPosition || 'left';

  // ── Poofy live brain ────────────────────────────────────────────────────────
  // Poofy's thought is no longer only local "if/else" rules: whenever the user
  // has an AI key, a very short live thought is generated from their real state
  // (Gemini with OpenRouter rotation/failover). Rules stay as offline fallback.
  const [liveThought, setLiveThought] = useState<string | null>(null);

  // Dynamic intelligent voluntary thought of Poofy
  const thought = useMemo<{
    key: string;
    text: string;
    detail: string;
    mood: PoofyMood;
    actionLabel?: string;
    actionView?: ViewId;
  }>(() => {
    if (isTimerRunning) {
      const subj = getSubject(activeSubject);
      return {
        key: `timer_${activeSubject}`,
        text: `در حال مطالعه ${subj.name}! حواست به قیدهای دقیق کتاب باشه 🎯`,
        detail: `آفرین قهرمان! داری روی درس ${subj.name} با تمرکز کار می‌کنی. هر زمان پارت تموم شد ثبتش کن تا تو نمودارها لحاظ بشه.`,
        mood: 'focus',
      };
    }

    // 1. Goal reached celebration
    if (todayMinutes >= (settings.dailyGoalMinutes || 600)) {
      return {
        key: 'goal_reached',
        text: `ایول! هدف امروز تیک خورد! فوق‌العاده بودی 🌟`,
        detail: `مجموعاً ${faNum(todayMinutes)} دقیقه مطالعه مفید ثبت کردی و به تارگت روزانه رسیدی. حالا وقت استراحته یا یک مرور فوق سبک!`,
        mood: 'happy',
        actionLabel: 'مشاهده آمار کامل',
        actionView: 'stats',
      };
    }

    // 2. Due cards in Leitner
    if (dueMistakesCount >= 3) {
      return {
        key: `leitner_${dueMistakesCount}`,
        text: `${faNum(dueMistakesCount)} تست منتظر مرور لایتنره! نذار فراموش بشن ⚡`,
        detail: `تست‌های اشتباه خورده قبلی موعد امروزشون فرا رسیده. فقط ۵ دقیقه وقت بذار و مرورشون کن تا توی حافظه بلندمدت حک بشن.`,
        mood: 'curious',
        actionLabel: 'ورود به لایتنر',
        actionView: 'mistakes',
      };
    }

    // 3. Single subject skew warning
    const subjKeys = Object.keys(todaySubjectMinutes);
    if (todayMinutes >= 90 && subjKeys.length === 1) {
      const s = getSubject(subjKeys[0]);
      return {
        key: `single_subj_${subjKeys[0]}`,
        text: `امروز تا الان فقط ${s.name} خوندی! برای تنوع ذهن، پارت بعد رو تغییر بده 💡`,
        detail: `بیش از ۹۰ دقیقه متوالی فقط ${s.name} ثبت شده. برای یادگیری پایدار و جلوگیری از فرسودگی، پارت بعدی رو به یک درس دیگه اختصاص بده.`,
        mood: 'worried',
        actionLabel: 'تغییر درس در تایمر',
        actionView: 'timer',
      };
    }

    // 4. Grade 12 bias vs Base grades
    if (gradeStats.g12 > 0 && gradeStats.base === 0 && sessions.length >= 6) {
      return {
        key: 'grade_bias',
        text: `پایه‌های دهم و یازدهم فراموش نشه! ۶۰٪ کنکور از پایه‌ست 📚`,
        detail: `بررسی کردم دیدم جلسات اخیر همگی سال دوازدهم بودن. حتماً در برنامه روزانه‌ات یک پارت مرور تستی برای دهم یا یازدهم قرار بده.`,
        mood: 'worried',
        actionLabel: 'برنامه‌ریزی متوازن',
        actionView: 'ai',
      };
    }

    // 5. No study session yet
    if (todayMinutes === 0) {
      return {
        key: 'start_day',
        text: `سلام رفیق! برای اولین پارت مطالعه آماده‌ای؟ بریم بترکونیم 🚀`,
        detail: `شروع کردن مهم‌ترین قدمه! همین الان یک تایمر سبک راه بنداز و اولین پارت روزت رو شکار کن.`,
        mood: 'idle',
        actionLabel: 'روشن کردن تایمر',
        actionView: 'timer',
      };
    }

    return {
      key: 'general_progress',
      text: `تا الان ${faNum(todayMinutes)} دقیقه مطالعه ثبت شده؛ پرانرژی ادامه بده! ☕`,
      detail: `روندت رو به پیشرفته! برای تراز عالی آزمون‌های آزمایشی، تعادل تستی و مفهومی رو حفظ کن.`,
      mood: 'happy',
      actionLabel: 'مشاهده آمار',
      actionView: 'stats',
    };
  }, [isTimerRunning, activeSubject, todaySubjectMinutes, todayMinutes, gradeStats, sessions.length, dueMistakesCount, settings.dailyGoalMinutes]);

  const displayedThought = useMemo(() => {
    if (!liveThought) return thought;
    return {
      ...thought,
      text: liveThought,
      detail: 'پوفی همین حالا وضعیت واقعی‌ات را با هوش مصنوعی بررسی کرده ✨',
    };
  }, [thought, liveThought]);

  // Live AI thought fetch — throttled to once per 10 minutes (session-cached)
  // so quotas stay safe; silently falls back to the rule engine above.
  useEffect(() => {
    if (poofyMode === 'hidden' || isTimerRunning) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    let cancelled = false;
    const buildContext = () => {
      const goal = settings.dailyGoalMinutes || 600;
      const parts: string[] = [];
      if (todayMinutes === 0) {
        parts.push('هنوز هیچ جلسه مطالعه‌ای امروز ثبت نشده');
      } else {
        parts.push(`امروز ${faNum(todayMinutes)} از ${faNum(goal)} دقیقه هدف مطالعه شده`);
      }
      if (dueMistakesCount > 0) {
        parts.push(`${faNum(dueMistakesCount)} کارت لایتنر موعد مرورش رسیده`);
      }
      const subjNames = Object.keys(todaySubjectMinutes).map((k) => getSubject(k).name);
      if (subjNames.length) parts.push(`درس‌های امروز: ${subjNames.join('، ')}`);
      if (settings.examTitle) parts.push(`هدف نهایی: ${settings.examTitle}`);
      return parts.join('؛ ');
    };

    const fetchLive = async () => {
      try {
        const cacheKey = 'ky_poofy_live_v1';
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') as
          | { t: number; text: string }
          | null;
        if (cached?.text && Date.now() - cached.t < 10 * 60 * 1000) {
          if (!cancelled) setLiveThought(cached.text);
          return;
        }
        const text = await consultPoofyLive(buildContext());
        const clean = (text || '').trim().replace(/^["«»]+|["«»]+$/g, '');
        if (!cancelled && clean) {
          setLiveThought(clean);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), text: clean }));
          } catch {}
        }
      } catch {
        // No AI key / offline / quota — the rule-based thought from above stays.
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poofyMode, isTimerRunning, todayMinutes, dueMistakesCount]);
  // ───────────────────────────────────────────────────────────────────────────

  // Gentle milestone celebration (auto-dismissing toast after 5s, NEVER looping on normal ticks)
  useEffect(() => {
    if (poofyMode === 'quiet' || poofyMode === 'hidden' || isTimerRunning) return;

    // Check if daily goal reached milestone should fire once today
    if (todayMinutes >= (settings.dailyGoalMinutes || 600)) {
      const milestoneKey = `ky_milestone_goal_${today}`;
      try {
        if (!sessionStorage.getItem(milestoneKey)) {
          sessionStorage.setItem(milestoneKey, 'true');
          setMilestoneToast({
            id: milestoneKey,
            text: 'ایول قهرمان! تارگت مطالعه امروز تکمیل شد 🌟',
            mood: 'happy',
          });
          const timer = setTimeout(() => setMilestoneToast(null), 5000);
          return () => clearTimeout(timer);
        }
      } catch {}
    }
  }, [todayMinutes, settings.dailyGoalMinutes, today, poofyMode, isTimerRunning]);

  const toggleMinimize = (min: boolean) => {
    setIsMinimized(min);
    try {
      if (min) sessionStorage.setItem('ky_poofy_minimized', 'true');
      else sessionStorage.removeItem('ky_poofy_minimized');
    } catch {}
  };

  const handleUpdateMode = (mode: 'dynamic' | 'quiet' | 'hidden') => {
    if (!onUpdateSettings) return;
    onUpdateSettings({
      ...settings,
      ai: {
        ...settings.ai,
        poofyMode: mode,
      },
    });
  };

  const handleUpdatePosition = (pos: 'left' | 'right') => {
    if (!onUpdateSettings) return;
    onUpdateSettings({
      ...settings,
      ai: {
        ...settings.ai,
        poofyPosition: pos,
      },
    });
  };

  // If user disabled Poofy, or a view already shows its own Poofy inline
  // (timer tab has Poofy inside the timer circle) — exactly ONE Poofy on screen.
  if (poofyMode === 'hidden' || activeView === 'timer') {
    return null;
  }

  // Positioning classes
  const positionClass =
    poofyPosition === 'right'
      ? 'right-4 sm:right-6 items-end'
      : 'left-4 sm:left-6 items-start';

  // Floating Micro-Toast (Gentle auto-toast for milestones or user curiosity)
  const showToast = milestoneToast && !isDrawerOpen;

  return (
    <div
      className={`fixed bottom-20 sm:bottom-24 z-50 flex flex-col ${positionClass} select-none font-sans transition-all duration-300 pointer-events-none`}
    >
      {/* 1. Milestone Gentle Toast (Auto-dismisses in 5s, non-intrusive) */}
      {showToast && (
        <div className="mb-2 max-w-[260px] sm:max-w-xs p-3 rounded-2xl bg-white/95 dark:bg-[#0c1e38]/95 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-blue-200 dark:border-blue-900 shadow-xl shadow-blue-500/10 text-right animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
            <span className="font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <span>پوفی</span>
            </span>
            <button
              type="button"
              onClick={() => setMilestoneToast(null)}
              className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="بستن پیام"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs font-bold leading-relaxed">{milestoneToast.text}</p>
        </div>
      )}

      {/* 2. Interactive Companion Dialogue Card (Opens ONLY when user clicks Poofy) */}
      {isDrawerOpen && (
        <div className="mb-2 w-76 sm:w-84 p-4 rounded-3xl bg-white/95 dark:bg-[#0b172a]/95 backdrop-blur-md border border-blue-200 dark:border-blue-900 shadow-2xl space-y-3 text-right animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <PoofyMascot mood={displayedThought.mood} size="sm" />
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1">
                  <span>پوفی - همراه هوشمند کنکور</span>
                </h4>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                  {isTimerRunning ? 'تمرکز عمیق روی مطالعه' : 'تحلیل زنده ریتم درس‌خواندن'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Dynamic Insight Bubble */}
          <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
              {displayedThought.text}
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              {displayedThought.detail}
            </p>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            {thought.actionLabel && thought.actionView ? (
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  onNavigate(thought.actionView!);
                }}
                className="col-span-2 p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>{thought.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            ) : null}

            <button
              onClick={() => {
                setIsDrawerOpen(false);
                onNavigate('ai');
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-[11px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>مشاور هوشمند</span>
            </button>

            <button
              onClick={() => {
                setIsDrawerOpen(false);
                onNavigate('timer');
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-[11px]"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>ورود به تایمر</span>
            </button>
          </div>

          {/* Preferences Row (Position & Mode) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
            {/* Mode switch */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleUpdateMode(poofyMode === 'dynamic' ? 'quiet' : 'dynamic')}
                className={`px-2 py-0.5 rounded-lg border cursor-pointer transition-colors ${
                  poofyMode === 'dynamic'
                    ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 text-blue-600 dark:text-blue-400 font-bold'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                }`}
                title={poofyMode === 'dynamic' ? 'حالت فعال و پویا' : 'حالت آرام و ساکت'}
              >
                {poofyMode === 'dynamic' ? '🌟 پویا و فعال' : '🧘 آرام و بی‌صدا'}
              </button>

              {/* Position toggle */}
              <button
                type="button"
                onClick={() => handleUpdatePosition(poofyPosition === 'left' ? 'right' : 'left')}
                className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="تغییر جهت قرارگیری پوفی"
              >
                {poofyPosition === 'left' ? 'جا: چپ' : 'جا: راست'}
              </button>
            </div>

            {/* Minimize button */}
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                toggleMinimize(true);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer flex items-center gap-0.5"
              title="مینی‌کردن پوفی"
            >
              <Minimize2 className="w-3 h-3" />
              <span>مینی</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. The Mascot Character Anchor */}
      {isMinimized ? (
        /* Minimized micro-avatar */
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={() => toggleMinimize(false)}
            className="p-1.5 rounded-2xl bg-white/90 dark:bg-[#0b172a]/90 backdrop-blur-md border border-blue-200 dark:border-blue-900 shadow-md text-blue-600 dark:text-blue-400 hover:scale-110 transition-all cursor-pointer flex items-center gap-1 group"
            title="بزرگ‌نمایی پوفی"
          >
            <PoofyMascot mood={displayedThought.mood} size="xs" />
            <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 pl-1">
              پوفی
            </span>
          </button>
        </div>
      ) : (
        /* Standard Living Mascot */
        <div
          className="relative pointer-events-auto flex items-center gap-2"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Gentle Status Tag when Timer is Running or Hovered */}
          {isTimerRunning && (
            <div className="animate-in fade-in zoom-in-95 duration-200 px-2.5 py-1 rounded-full bg-emerald-50/90 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-black shadow-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>مطالعه {getSubject(activeSubject).name}</span>
            </div>
          )}

          {/* Hover Tooltip (Cute & friendly micro-reaction) */}
          {!isTimerRunning && isHovered && !isDrawerOpen && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-150 px-2.5 py-1 rounded-full bg-white/95 dark:bg-[#0c1e38]/95 border border-blue-200 dark:border-blue-900 shadow-md text-slate-800 dark:text-slate-100 text-[10px] font-bold">
              <span>{todayMinutes > 0 ? `مطالعه امروز: ${faNum(todayMinutes)} دقیقه ✨` : 'سلام! آماده‌ای؟ 🚀'}</span>
            </div>
          )}

          {/* Mascot Character with Click Trigger */}
          <div className="relative cursor-pointer group">
            <PoofyMascot
              mood={isTimerRunning ? 'focus' : displayedThought.mood}
              size="md"
              onClick={() => {
                setMilestoneToast(null);
                setIsDrawerOpen(!isDrawerOpen);
              }}
            />

            {/* Due Leitner Badge */}
            {dueMistakesCount > 0 && !isTimerRunning && (
              <span
                className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-black shadow-xs pointer-events-none"
                title={`${dueMistakesCount} تست منتظر مرور`}
              >
                {faNum(dueMistakesCount)}
              </span>
            )}

            {/* Daily Goal Completed Star */}
            {todayMinutes >= (settings.dailyGoalMinutes || 600) && !isTimerRunning && (
              <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-amber-400 text-amber-950 text-[10px] flex items-center justify-center font-black shadow-xs pointer-events-none animate-bounce">
                ★
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
