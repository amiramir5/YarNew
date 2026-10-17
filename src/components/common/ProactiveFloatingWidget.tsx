import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  ArrowRight,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  MessageCircle,
  HelpCircle,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Session, AppSettings, MistakeCard, ViewId } from '../../types';
import { studyDayKey, faNum } from '../../lib/jalali';
import { getSubject } from '../../lib/constants';
import { PoofyMascot, PoofyMood } from './PoofyMascot';

interface ProactiveFloatingWidgetProps {
  sessions: Session[];
  mistakes: MistakeCard[];
  settings: AppSettings;
  isTimerRunning: boolean;
  activeSubject: string;
  onNavigate: (view: ViewId) => void;
}

export const ProactiveFloatingWidget: React.FC<ProactiveFloatingWidgetProps> = ({
  sessions,
  mistakes,
  settings,
  isTimerRunning,
  activeSubject,
  onNavigate,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isVoluntaryBubbleVisible, setIsVoluntaryBubbleVisible] = useState(true);
  const [isMutedForSession, setIsMutedForSession] = useState(false);
  const lastThoughtKeyRef = useRef<string>('');

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

    // 1. Single subject skew warning
    const subjKeys = Object.keys(todaySubjectMinutes);
    if (todayMinutes >= 90 && subjKeys.length === 1) {
      const s = getSubject(subjKeys[0]);
      return {
        key: `single_subj_${subjKeys[0]}`,
        text: `امروز تا الان تماماً ${s.name} خوندی! مغزت خسته نشه؟ یه پارت درس دیگه بذار 💡`,
        detail: `بیش از ۹۰ دقیقه متوالی فقط ${s.name} ثبت شده. برای یادگیری پایدار و جلوگیری از فرسودگی، پارت بعدی رو به یک درس اختصاصی دیگه مثل شیمی یا فیزیک بده.`,
        mood: 'worried',
        actionLabel: 'تغییر درس در تایمر',
        actionView: 'timer',
      };
    }

    // 2. Grade 12 bias vs Base grades
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

    // 3. Due cards in Leitner
    if (dueMistakesCount >= 3) {
      return {
        key: `leitner_${dueMistakesCount}`,
        text: `${faNum(dueMistakesCount)} کارت تست منتظر مرور لایتنره! نذار فراموش بشن ⚡`,
        detail: `تست‌های اشتباه خورده قبلی موعد امروزشون فرا رسیده. فقط ۵ دقیقه وقت بذار و مرورشون کن تا توی حافظه بلندمدت حک بشن.`,
        mood: 'curious',
        actionLabel: 'ورود به لایتنر',
        actionView: 'mistakes',
      };
    }

    // 4. Goal reached celebration
    if (todayMinutes >= (settings.dailyGoalMinutes || 600)) {
      return {
        key: 'goal_reached',
        text: `ایول! هدف امروز تیک خورد! فوق‌العاده بودی 🌟`,
        detail: `مجموعاً ${faNum(todayMinutes)} دقیقه مطالعه مفید ثبت کردی و به تارگت روزانه رسیدی. حالا وقت استراحته یا یک مرور فوق سبک!`,
        mood: 'happy',
      };
    }

    // 5. No study session yet
    if (todayMinutes === 0) {
      return {
        key: 'start_day',
        text: `سلام رفیق! هنوز تایمر رو روشن نکردی، با یه پارت ۴۵ دقیقه‌ای شروع کنیم؟ 🚀`,
        detail: `شروع کردن سخت‌ترین بخشه! همین الان یک تایمر سبک راه بنداز و اولین پارت روزت رو شکار کن.`,
        mood: 'idle',
        actionLabel: 'روشن کردن تایمر',
        actionView: 'timer',
      };
    }

    return {
      key: `progress_${todayMinutes}`,
      text: `تا الان ${faNum(todayMinutes)} دقیقه خوندی، پرانرژی ادامه بده! ☕`,
      detail: `روندت رو به پیشرفته! برای تراز عالی آزمون‌های آزمایشی، تعادل تستی و مفهومی رو حفظ کن.`,
      mood: 'happy',
      actionLabel: 'مشاهده آمار',
      actionView: 'stats',
    };
  }, [isTimerRunning, activeSubject, todaySubjectMinutes, todayMinutes, gradeStats, sessions.length, dueMistakesCount, settings.dailyGoalMinutes]);

  // When thought changes, voluntarily pop open the speech bubble!
  useEffect(() => {
    if (thought.key !== lastThoughtKeyRef.current) {
      lastThoughtKeyRef.current = thought.key;
      if (!isMutedForSession) {
        setIsVoluntaryBubbleVisible(true);
      }
    }
  }, [thought.key, isMutedForSession]);

  if (isMutedForSession) {
    return (
      <div className="fixed bottom-24 left-4 sm:left-6 z-60">
        <button
          onClick={() => setIsMutedForSession(false)}
          className="p-2 rounded-full bg-white dark:bg-[#0b172a] border border-blue-200 dark:border-blue-900 shadow-md text-blue-600 dark:text-blue-400 hover:scale-110 transition-transform cursor-pointer"
          title="نمایش مجدد پوفی"
        >
          <PoofyMascot mood="idle" size="xs" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 sm:left-6 z-60 flex flex-col items-start select-none font-sans">
      {/* Voluntary Speech Balloon (حباب گفت‌وگوی خودکار پوفی) */}
      {isVoluntaryBubbleVisible && !isDrawerOpen && (
        <div className="mb-2 max-w-[270px] sm:max-w-xs p-3 rounded-2xl bg-white dark:bg-[#0c1e38] text-slate-800 dark:text-slate-100 border border-blue-200 dark:border-blue-900 shadow-xl shadow-blue-500/10 text-right animate-in fade-in zoom-in-95 duration-200 relative">
          {/* Close & Mute Controls */}
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
            <span className="font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <span>پوفی (همراه هوشمند)</span>
            </span>
            <button
              type="button"
              onClick={() => setIsVoluntaryBubbleVisible(false)}
              className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="بستن حباب پیام"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs leading-relaxed font-bold text-slate-800 dark:text-slate-100">
            {thought.text}
          </p>

          {/* Action Button inside Balloon */}
          {thought.actionLabel && thought.actionView && (
            <div className="mt-2 pt-1.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setIsVoluntaryBubbleVisible(false);
                  onNavigate(thought.actionView!);
                }}
                className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
              >
                <span>{thought.actionLabel}</span>
                <ArrowRight className="w-3 h-3 rotate-180" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsVoluntaryBubbleVisible(false);
                  setIsDrawerOpen(true);
                }}
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer"
              >
                بیشتر بدانید
              </button>
            </div>
          )}

          {/* Speech Bubble Arrow pointing to Poofy Mascot */}
          <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-white dark:bg-[#0c1e38] border-r border-b border-blue-200 dark:border-blue-900 rotate-45" />
        </div>
      )}

      {/* Expanded Interactive Dialogue Card */}
      {isDrawerOpen && (
        <div className="mb-2 w-76 sm:w-84 p-4 rounded-3xl bg-white dark:bg-[#0b172a] border border-blue-200 dark:border-blue-900 shadow-2xl space-y-3.5 text-right animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <PoofyMascot mood={thought.mood} size="sm" />
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  مشاوره همراه پوفی
                </h4>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                  تحلیل زنده عملکرد شما
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
              {thought.detail}
            </p>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            <button
              onClick={() => {
                setIsDrawerOpen(false);
                onNavigate('ai');
              }}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>مشاور تخصصی</span>
            </button>

            <button
              onClick={() => {
                setIsDrawerOpen(false);
                onNavigate('timer');
              }}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>ورود به تایمر</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
            <span>مطالعه امروز: {faNum(todayMinutes)} دقیقه</span>
            <button
              onClick={() => setIsMutedForSession(true)}
              className="hover:text-rose-500 cursor-pointer"
            >
              مخفی‌سازی پوفی
            </button>
          </div>
        </div>
      )}

      {/* The Fluffy Mascot Character Button */}
      <div className="relative group">
        <PoofyMascot
          mood={thought.mood}
          size="md"
          onClick={() => {
            if (isVoluntaryBubbleVisible) {
              setIsVoluntaryBubbleVisible(false);
              setIsDrawerOpen(true);
            } else {
              setIsDrawerOpen(!isDrawerOpen);
            }
          }}
        />

        {/* Unread / Active Ping Indicator */}
        {isVoluntaryBubbleVisible && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse pointer-events-none" />
        )}
      </div>
    </div>
  );
};
