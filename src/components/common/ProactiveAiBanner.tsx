import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Clock,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
  CalendarCheck,
  BrainCircuit,
  Zap,
} from 'lucide-react';
import { DailyPlan, Exam, MistakeCard, Session, ScheduleProposal, AppSettings, ViewId } from '../../types';
import { studyDayKey, faNum } from '../../lib/jalali';
import { getSubject } from '../../lib/constants';
import { generateProactiveSchedule } from '../../lib/ai';
import { PoofyMascot, PoofyMood } from './PoofyMascot';

interface ProactiveAiBannerProps {
  sessions: Session[];
  exams: Exam[];
  mistakes: MistakeCard[];
  plans: DailyPlan[];
  settings: AppSettings;
  onSavePlan?: (plan: DailyPlan) => void;
  onNavigate?: (view: ViewId) => void;
}

export const ProactiveAiBanner: React.FC<ProactiveAiBannerProps> = ({
  sessions,
  exams,
  mistakes,
  plans,
  settings,
  onSavePlan,
  onNavigate,
}) => {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('ky_poofy_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('ky_poofy_banner_dismissed', 'true');
    } catch {}
  };

  const handleReopen = () => {
    setIsDismissed(false);
    try {
      sessionStorage.removeItem('ky_poofy_banner_dismissed');
    } catch {}
  };

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [proposedSchedule, setProposedSchedule] = useState<ScheduleProposal | null>(null);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);

  const today = studyDayKey();

  // 1. Calculate today's study metrics
  const todaySessions = useMemo(() => {
    return sessions.filter((s) => !s.deleted_at && s.day === today);
  }, [sessions, today]);

  const todayMinutes = useMemo(() => {
    return Math.round(todaySessions.reduce((acc, s) => acc + (s.seconds || 0), 0) / 60);
  }, [todaySessions]);

  // Subject breakdown today
  const todaySubjectMinutes = useMemo(() => {
    const map: Record<string, number> = {};
    todaySessions.forEach((s) => {
      map[s.subject] = (map[s.subject] || 0) + Math.round((s.seconds || 0) / 60);
    });
    return map;
  }, [todaySessions]);

  // 2. Due Leitner cards
  const dueCardsCount = useMemo(() => {
    return mistakes.filter((m) => !m.deleted_at && m.next_review <= today).length;
  }, [mistakes, today]);

  // 3. Days to exam
  const daysToExam = useMemo(() => {
    if (!settings.examDate) return 0;
    const diff = new Date(settings.examDate).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [settings.examDate]);

  // 4. Grade distribution in the last 7 days
  const gradeStats = useMemo(() => {
    const recent = sessions.filter((s) => !s.deleted_at);
    let grade12Count = 0;
    let baseGradeCount = 0;

    recent.slice(-30).forEach((s) => {
      const ch = s.chapter || '';
      if (ch.includes('دوازدهم') || s.book?.includes('دوازدهم')) {
        grade12Count += s.seconds || 0;
      } else if (ch.includes('دهم') || ch.includes('یازدهم') || s.book?.includes('دهم') || s.book?.includes('یازدهم')) {
        baseGradeCount += s.seconds || 0;
      }
    });

    return { grade12Count, baseGradeCount };
  }, [sessions]);

  // Proactive Intelligence Warnings & Nudges
  const alerts = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      message: string;
      severity: 'warning' | 'alert' | 'info' | 'success';
      actionLabel?: string;
      onAction?: () => void;
    }> = [];

    // Check 1: Single subject skew
    const subjKeys = Object.keys(todaySubjectMinutes);
    if (todayMinutes >= 90 && subjKeys.length === 1) {
      const subj = getSubject(subjKeys[0]);
      list.push({
        id: 'single_subject',
        title: `حواست به تنوع دروس هست؟`,
        message: `امروز تا الان تمام ${faNum(todayMinutes)} دقیقه را فقط ${subj.name} خواندی! برای فرسوده نشدن ذهن و تراز کنکور، پارت بعدی را به درسی دیگر مثل شیمی یا ریاضی اختصاص بده.`,
        severity: 'warning',
      });
    }

    // Check 2: Grade 12 bias vs Base grades (10 & 11)
    if (gradeStats.grade12Count > 0 && gradeStats.baseGradeCount === 0 && sessions.length >= 5) {
      list.push({
        id: 'grade_bias',
        title: 'پایه‌های دهم و یازدهم را فراموش نکن!',
        message: 'تمرکز جلسات اخیر فقط روی دوازدهم بوده است. ۶۰٪ بودجه‌بندی کنکور از پایه است؛ حتماً یک پارت مرور پایه در برنامه‌ات قرار بده.',
        severity: 'alert',
      });
    }

    // Check 3: Leitner cards due
    if (dueCardsCount >= 5) {
      list.push({
        id: 'leitner_due',
        title: `${faNum(dueCardsCount)} تست منتظر مرور لایتنر`,
        message: 'اگر تست‌های علامت‌دار امروز را مرور نکنی، زحمات قبلی در حافظه موقت کمرنگ می‌شوند.',
        severity: 'warning',
        actionLabel: 'ورود به لایتنر',
        onAction: () => onNavigate?.('mistakes'),
      });
    }

    // Check 4: Low study volume relative to goal in late hours
    const currentHour = new Date().getHours();
    if (currentHour >= 18 && todayMinutes < settings.dailyGoalMinutes * 0.4) {
      list.push({
        id: 'low_volume',
        title: 'فرصت طلایی شب هنوز باقیست',
        message: `هدف روزانه‌ات ${faNum(Math.round(settings.dailyGoalMinutes / 60))} ساعت است و تا الان ${faNum(Math.round(todayMinutes / 60))} ساعت ثبت شده. یک پارت تست‌زنی ۹۰ دقیقه‌ای می‌تواند روزت را نجات دهد!`,
        severity: 'info',
        actionLabel: 'شروع تایمر',
        onAction: () => onNavigate?.('timer'),
      });
    }

    return list;
  }, [todayMinutes, todaySubjectMinutes, gradeStats, dueCardsCount, settings.dailyGoalMinutes, onNavigate, sessions.length]);

  const handleGenerateSchedule = async () => {
    setIsGeneratingSchedule(true);
    setScheduleModalOpen(true);
    setAcceptedSuccess(false);

    try {
      const weakSubjs: string[] = [];
      const allKonkoor = ['زیست', 'شیمی', 'فیزیک', 'ریاضی'];
      allKonkoor.forEach((s) => {
        if (!todaySubjectMinutes[s]) weakSubjs.push(s);
      });

      const proposal = await generateProactiveSchedule({
        goalMinutes: settings.dailyGoalMinutes || 600,
        weakSubjects: weakSubjs.length ? weakSubjs : ['شیمی', 'زیست'],
        dayName: 'فردا',
        gradeFocus: 'ترکیب دوازدهم و پایه دهم/یازدهم',
        wakeTime: '06:00',
      });
      setProposedSchedule(proposal);
    } catch (err: any) {
      console.warn('Error generating AI schedule proposal:', err);
      // Fallback structured proposal
      setProposedSchedule({
        title: 'برنامه متوازن پیشنهادی هوشمند',
        day: 'فردا',
        wake_time: '06:00',
        description: 'این برنامه با رعایت چرخه تمرکز ۹۰ دقیقه‌ای و پوشش هم‌زمان دروس اختصاصی و پایه طراحی شده است.',
        blocks: [
          { time: '06:30 - 08:00', subject: 'زیست‌شناسی', topic: 'مطالعه خط‌به‌خط فصل ۳ دوازدهم', type: 'study', color: 'blue' },
          { time: '08:15 - 09:45', subject: 'شیمی', topic: 'تست‌های ترکیبی استوکیومتری یازدهم', type: 'test', color: 'purple' },
          { time: '10:00 - 11:30', subject: 'فیزیک', topic: 'حرکت‌شناسی دوازدهم + تست زمان‌دار', type: 'test', color: 'emerald' },
          { time: '12:00 - 13:00', subject: 'عمومی/نهایی', topic: 'فارسی دوازدهم (آرایه‌ها)', type: 'study', color: 'amber' },
          { time: '16:00 - 17:30', subject: 'ریاضی', topic: 'تابع و مشتق + حل اشکالات آزمون', type: 'study', color: 'cyan' },
          { time: '21:00 - 22:00', subject: 'مرور شبانه', topic: 'مرور کارت‌های جعبه لایتنر', type: 'review', color: 'rose' },
        ],
      });
    } finally {
      setIsGeneratingSchedule(false);
    }
  };

  const handleAcceptSchedule = () => {
    if (!proposedSchedule) return;

    // Convert proposed blocks into DailyPlan items
    const planItems = proposedSchedule.blocks.map((b) => ({
      text: `${b.time} | ${b.subject}: ${b.topic} (${b.type === 'test' ? 'تست‌زنی' : b.type === 'review' ? 'مرور' : 'مطالعه'})`,
      done: false,
    }));

    const newPlan: DailyPlan = {
      id: 'plan-' + Date.now(),
      day: today,
      wake_time: proposedSchedule.wake_time || '06:00',
      items: planItems,
      created_at: Date.now(),
      updated_at: Date.now(),
      device_id: settings.deviceId || 'client',
      deleted_at: null,
    };

    onSavePlan?.(newPlan);
    setAcceptedSuccess(true);
    setTimeout(() => {
      setScheduleModalOpen(false);
      setAcceptedSuccess(false);
    }, 1800);
  };

  if (isDismissed && !scheduleModalOpen) {
    return (
      <div className="flex justify-end">
        <button
          onClick={handleReopen}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-white dark:bg-[#0c1c33] border border-blue-200 dark:border-blue-900 shadow-xs hover:shadow-md text-xs font-bold text-blue-700 dark:text-blue-300 transition-all cursor-pointer group"
          title="باز کردن پیام پوفی"
        >
          <PoofyMascot mood="idle" size="xs" />
          <span>مشاوره پوفی</span>
        </button>
      </div>
    );
  }

  const primaryAlert = alerts[0];

  const poofyMood: PoofyMood = useMemo(() => {
    if (!primaryAlert) return 'happy';
    const t = primaryAlert.title || '';
    if (t.includes('تک‌درسی') || t.includes('نامتوازن') || t.includes('عقب‌افتادگی') || t.includes('پایه')) return 'worried';
    if (t.includes('لایتنر') || t.includes('مرور')) return 'curious';
    return 'talking';
  }, [primaryAlert]);

  return (
    <>
      <div className="rounded-3xl border border-blue-200 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/95 via-indigo-50/80 to-blue-50/95 dark:from-[#0d1f38] dark:via-[#0c1a2f] dark:to-[#0d1f38] p-4.5 shadow-sm space-y-3.5 transition-all animate-in fade-in duration-200 text-right">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center sm:items-start gap-3.5">
            {/* The Living Poofy Mascot Character */}
            <div
              className="shrink-0 flex flex-col items-center cursor-pointer group transition-transform hover:scale-105"
              onClick={() => onNavigate?.('ai')}
              title="مشاور هوشمند پوفی - برای گفت‌وگو کلیک کنید"
            >
              <PoofyMascot mood={poofyMood} size="lg" />
              <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 mt-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80">
                پوفی
              </span>
            </div>

            {/* Conversational Comic Balloon from Poofy */}
            <div className="flex-1 relative p-3.5 rounded-2xl bg-white dark:bg-[#0f2442] border border-blue-100 dark:border-blue-900/50 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-black text-blue-950 dark:text-blue-100 flex items-center gap-1.5">
                  <span>پیام اختصاصی پوفی</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/80 text-blue-900 dark:text-blue-200">
                    همراه هوشمند کنکور
                  </span>
                </span>
                {primaryAlert && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                    {primaryAlert.title}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                {primaryAlert?.message ||
                  `سلام قهرمان! تا ${settings.examTitle || 'کنکور'} فقط ${faNum(daysToExam)} روز فرصت داریم. من اینجام تا به تعادل درس‌ها، خواب منظم و مرور به موقع کمکت کنم!`}
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 cursor-pointer shrink-0"
            title="بستن موقت"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-blue-200/50 dark:border-blue-900/40 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateSchedule}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>پیشنهاد جدول برنامه روزانه متوازن</span>
            </button>

            {primaryAlert?.actionLabel && primaryAlert.onAction && (
              <button
                onClick={primaryAlert.onAction}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-50 transition-colors cursor-pointer"
              >
                {primaryAlert.actionLabel}
              </button>
            )}
          </div>

          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            مطالعه امروز: <b>{faNum(todayMinutes)} دقیقه</b> / هدف:{' '}
            <b>{faNum(settings.dailyGoalMinutes)} دقیقه</b>
          </span>
        </div>
      </div>

      {/* Proactive Colorful Timetable Modal */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[92vh] bg-white dark:bg-[#0b1728] rounded-3xl border border-slate-200 dark:border-blue-900/60 shadow-2xl flex flex-col overflow-hidden text-right">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{proposedSchedule?.title || 'جدول برنامه‌ریزی متوازن روزانه'}</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      طراحی هوشمند مشاور
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {proposedSchedule?.description || 'تنظیم خودکار پارت‌ها بر اساس اصول توازن دروس و پیش‌نیازها'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setScheduleModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Timetable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {isGeneratingSchedule ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-bold">
                    مشاور هوشمند در حال تنظیم جدول رنگی و متعادل بر اساس نقاط قوت و ضعف شماست…
                  </p>
                </div>
              ) : proposedSchedule ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50 text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      ساعت بیداری پیشنهادی:
                    </span>
                    <span className="font-black font-mono text-sm px-3 py-1 rounded-xl bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {proposedSchedule.wake_time}
                    </span>
                  </div>

                  {/* Colorful Table */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                    <div className="bg-slate-100 dark:bg-slate-800/90 px-4 py-2.5 text-xs font-black text-slate-700 dark:text-slate-300 grid grid-cols-12 gap-2 text-right">
                      <div className="col-span-3 sm:col-span-3">بازه زمانی</div>
                      <div className="col-span-3 sm:col-span-3">درس</div>
                      <div className="col-span-4 sm:col-span-4">مبحث و هدف پارت</div>
                      <div className="col-span-2 sm:col-span-2 text-center">نوع فعالیت</div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900/60 text-xs">
                      {proposedSchedule.blocks.map((b, idx) => {
                        const colorMap: Record<string, string> = {
                          blue: 'bg-blue-50/80 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 border-r-4 border-r-blue-500',
                          purple: 'bg-purple-50/80 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200 border-r-4 border-r-purple-500',
                          emerald: 'bg-emerald-50/80 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border-r-4 border-r-emerald-500',
                          amber: 'bg-amber-50/80 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border-r-4 border-r-amber-500',
                          rose: 'bg-rose-50/80 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 border-r-4 border-r-rose-500',
                          cyan: 'bg-cyan-50/80 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200 border-r-4 border-r-cyan-500',
                        };

                        const rowClass = colorMap[b.color] || colorMap.blue;

                        return (
                          <div
                            key={idx}
                            className={`px-4 py-3 grid grid-cols-12 gap-2 items-center transition-colors ${rowClass}`}
                          >
                            <div className="col-span-3 sm:col-span-3 font-mono font-bold text-[11px] ltr text-right">
                              {b.time}
                            </div>
                            <div className="col-span-3 sm:col-span-3 font-black text-xs">
                              {b.subject}
                            </div>
                            <div className="col-span-4 sm:col-span-4 font-medium text-[11px] leading-relaxed">
                              {b.topic}
                            </div>
                            <div className="col-span-2 sm:col-span-2 text-center">
                              <span
                                className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                                  b.type === 'test'
                                    ? 'bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200'
                                    : b.type === 'review'
                                    ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                                    : 'bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200'
                                }`}
                              >
                                {b.type === 'test' ? 'تست‌زنی' : b.type === 'review' ? 'مرور' : 'مطالعه'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
              <div className="text-[11px] text-slate-500">
                {acceptedSuccess ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>برنامه با موفقیت در پلن روزانه ثبت شد!</span>
                  </span>
                ) : (
                  <span>با کلیک روی تایید، آیتم‌ها در برنامه‌ریزی روزانه ثبت خواهند شد.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  رد یا بستن
                </button>

                <button
                  type="button"
                  onClick={handleAcceptSchedule}
                  disabled={!proposedSchedule || isGeneratingSchedule || acceptedSuccess}
                  className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>قبول و ثبت در برنامه روزانه</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
