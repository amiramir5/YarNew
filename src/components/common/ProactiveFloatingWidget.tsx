import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  MessageCircle,
  X,
  Clock,
  BookOpen,
  ArrowRight,
  Zap,
  Smile,
  AlertCircle,
  Send,
} from 'lucide-react';
import { Session, AppSettings, MistakeCard, ViewId } from '../../types';
import { studyDayKey, faNum } from '../../lib/jalali';
import { getSubject } from '../../lib/constants';

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
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const today = studyDayKey();
  const todaySessions = useMemo(() => sessions.filter((s) => !s.deleted_at && s.day === today), [sessions, today]);
  const todayMinutes = useMemo(() => Math.round(todaySessions.reduce((acc, s) => acc + (s.seconds || 0), 0) / 60), [todaySessions]);

  const dueMistakesCount = useMemo(
    () => mistakes.filter((m) => !m.deleted_at && m.next_review <= today).length,
    [mistakes, today]
  );

  // Dynamic proactive thought based on user live state
  const proactiveThought = useMemo(() => {
    if (isTimerRunning) {
      const subj = getSubject(activeSubject);
      return {
        pill: `در حال مطالعه ${subj.name} — با تمرکز ادامه بده! 🎯`,
        mood: 'focus',
        fullMessage: `آفرین! داری روی ${subj.name} تمرکز می‌کنی. حواست باشه قیدهای کتاب درسی رو مو‌به‌مو علامت بزنی. هر زمان پارت تموم شد، ثبتش کن.`,
      };
    }

    if (todayMinutes === 0) {
      return {
        pill: 'هنوز جلسه مطالعه‌ای ثبت نشده! بیا شروع کنیم 🚀',
        mood: 'start',
        fullMessage: 'سلام قهرمان! روز بدون مطالعه مثل آزمون بدون مداده! همین الان تایمر رو برای یک پارت ۴۵ یا ۷۵ دقیقه‌ای روشن کن تا زنجیره‌ات نشکنه.',
      };
    }

    if (todayMinutes >= settings.dailyGoalMinutes) {
      return {
        pill: 'هدف روزانه‌ات تیک خورد! فوق‌العاده‌ای 🌟',
        mood: 'celebrate',
        fullMessage: `ایول! ${faNum(todayMinutes)} دقیقه مطالعه ثبت کردی و به هدف روزانه رسیدی. حالا وقت استراحت یا یک مرور سبک شبانه در لایتنره.`,
      };
    }

    if (dueMistakesCount >= 3) {
      return {
        pill: `${faNum(dueMistakesCount)} کارت لایتنر منتظر مروره 📚`,
        mood: 'warning',
        fullMessage: `تست‌های غلط‌خورده قبلی الان آماده مرور در جعبه لایتنر هستند. ۵ دقیقه وقت بذار و مرورشون کن تا فراموش نشن.`,
      };
    }

    return {
      pill: `مشاور همراه: ${faNum(todayMinutes)} دقیقه خوندی، ادامه بده! ⚡`,
      mood: 'steady',
      fullMessage: `عالی پیش رفتی! حواست به تعادل دروس اختصاصی (زیست، شیمی، فیزیک، ریاضی) باشه تا ترازت در آزمون‌های آزمایشی همگن رشد کنه.`,
    };
  }, [isTimerRunning, activeSubject, todayMinutes, settings.dailyGoalMinutes, dueMistakesCount]);

  if (isDismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 flex flex-col items-start select-none">
      {/* Expanded Advice Popover */}
      {isOpen && (
        <div className="mb-2 w-72 sm:w-80 p-4 rounded-3xl bg-white dark:bg-[#0c1e36] border border-blue-200 dark:border-blue-900 shadow-2xl space-y-3 text-right animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-black text-slate-900 dark:text-white">
                مشاور لحظه‌ای کنکوریار
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {proactiveThought.fullMessage}
          </p>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setIsOpen(false);
                onNavigate('ai');
              }}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>گفتگو با مشاور هوشمند</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </button>

            <button
              onClick={() => setIsDismissed(true)}
              className="text-[10px] text-slate-400 hover:underline cursor-pointer"
            >
              مخفی کردن
            </button>
          </div>
        </div>
      )}

      {/* Floating Pill and Avatar Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 transition-all transform hover:scale-105 cursor-pointer"
          title="مشاور هوشمند کنکوریار"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            {isTimerRunning && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-ping" />
            )}
          </div>
          <span className="hidden sm:inline text-xs font-black">
            {proactiveThought.pill}
          </span>
        </button>
      </div>
    </div>
  );
};
