import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Session } from '../../types';
import { SUBJECTS, SUBJ_MAP, getSubject, SUBJECT_BOOK_OPTIONS, getBookTitle } from '../../lib/constants';
import { faNum, fmtHM, studyDayKey, getWeekDays } from '../../lib/jalali';
import { Subject3DIcon } from './Subject3DIcon';
import { Clock, PieChart as PieIcon, Layers, Calendar, ChevronDown, Sparkles } from 'lucide-react';

interface StudyDistributionPieChartProps {
  sessions: Session[];
  className?: string;
  defaultPeriod?: 'today' | 'week' | 'all';
  initialRange?: 'today' | 'week' | 'all';
}

interface SliceData {
  key: string;
  name: string;
  subjectId: string;
  minutes: number;
  percentage: number;
  color: string;
  sessionsCount: number;
  bookLabel?: string;
}

export const StudyDistributionPieChart: React.FC<StudyDistributionPieChartProps> = ({
  sessions,
  className = '',
  defaultPeriod = 'today',
  initialRange,
}) => {
  const [period, setPeriod] = useState<'today' | 'week' | 'all'>(initialRange || defaultPeriod);
  const [groupMode, setGroupMode] = useState<'subject' | 'book'>('subject');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const today = studyDayKey();
  const weekDays = useMemo(() => getWeekDays(today), [today]);
  const weekIsoSet = useMemo(() => new Set(weekDays.map((w) => w.iso)), [weekDays]);

  // Filter sessions by selected period
  const filteredSessions = useMemo(() => {
    const valid = sessions.filter((s) => !s.deleted_at && s.seconds > 0);
    if (period === 'today') {
      return valid.filter((s) => s.day === today);
    }
    if (period === 'week') {
      return valid.filter((s) => weekIsoSet.has(s.day));
    }
    return valid;
  }, [sessions, period, today, weekIsoSet]);

  // Compute aggregation data based on groupMode ('subject' or 'book')
  const chartData = useMemo(() => {
    const totalSecs = filteredSessions.reduce((acc, s) => acc + s.seconds, 0);
    if (totalSecs === 0) return { slices: [], totalMinutes: 0, totalSeconds: 0 };

    const map: Record<
      string,
      {
        name: string;
        subjectId: string;
        seconds: number;
        sessionsCount: number;
        color: string;
        bookLabel?: string;
      }
    > = {};

    filteredSessions.forEach((s) => {
      const subj = getSubject(s.subject);

      if (groupMode === 'subject') {
        const key = s.subject || 'other';
        if (!map[key]) {
          map[key] = {
            name: subj.name,
            subjectId: subj.id,
            seconds: 0,
            sessionsCount: 0,
            color: subj.color,
          };
        }
        map[key].seconds += s.seconds;
        map[key].sessionsCount += 1;
      } else {
        // Group by book / grade
        let bookKey = s.book;
        let bookLabel = s.book;

        // Auto-extract book grade from chapter if book wasn't explicitly saved
        if (!bookKey && s.chapter) {
          if (s.chapter.includes('دهم') || s.chapter.startsWith('دهم:')) {
            bookKey = 'دهم';
          } else if (s.chapter.includes('یازدهم') || s.chapter.startsWith('یازدهم:')) {
            bookKey = 'یازدهم';
          } else if (s.chapter.includes('دوازدهم') || s.chapter.startsWith('دوازدهم:')) {
            bookKey = 'دوازدهم';
          }
        }

        if (bookKey) {
          bookLabel = getBookTitle(subj.id, bookKey);
        } else {
          bookLabel = `${subj.name} (عمومی/جامع)`;
        }

        const key = `${subj.id}_${bookKey || 'general'}`;
        if (!map[key]) {
          map[key] = {
            name: bookLabel,
            subjectId: subj.id,
            seconds: 0,
            sessionsCount: 0,
            color: subj.color,
            bookLabel,
          };
        }
        map[key].seconds += s.seconds;
        map[key].sessionsCount += 1;
      }
    });

    const slices: SliceData[] = Object.entries(map)
      .map(([key, item]) => {
        const mins = Math.max(1, Math.round(item.seconds / 60));
        const pct = Math.round((item.seconds / totalSecs) * 100);
        return {
          key,
          name: item.name,
          subjectId: item.subjectId,
          minutes: mins,
          percentage: pct,
          color: item.color,
          sessionsCount: item.sessionsCount,
          bookLabel: item.bookLabel,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

    // Adjust slight rounding variance to ensure clean 100% display
    const totalMinutes = Math.round(totalSecs / 60);
    return { slices, totalMinutes, totalSeconds: totalSecs };
  }, [filteredSessions, groupMode]);

  // Color palette helper with distinct tints if multiple books of same subject exist
  const getSliceColor = (slice: SliceData, index: number): string => {
    if (groupMode === 'subject') return slice.color;
    // For books of the same subject, tint slightly
    const subj = getSubject(slice.subjectId);
    if (slice.name.includes('دهم')) return subj.c1 || slice.color;
    if (slice.name.includes('یازدهم')) return slice.color;
    if (slice.name.includes('دوازدهم')) return subj.c2 || slice.color;
    return slice.color;
  };

  const periodLabel =
    period === 'today' ? 'امروز' : period === 'week' ? 'این هفته' : 'کل دوره‌ها';

  return (
    <div
      className={`rounded-3xl border border-slate-200/80 dark:border-blue-900/40 bg-white/90 dark:bg-[#0a1628]/90 backdrop-blur-sm p-4 sm:p-5 shadow-xs transition-all ${className}`}
    >
      {/* Header with Title and Control Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <PieIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>توزیع زمان مطالعه</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                {periodLabel}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              نمودار دایره‌ای سهم موضوعی کتاب‌ها و دروس
            </p>
          </div>
        </div>

        {/* Filters: Period Toggle & Grouping Toggle */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Period Toggle */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                period === 'today'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                period === 'week'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              این هفته
            </button>
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                period === 'all'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              کل
            </button>
          </div>

          {/* Group Mode Toggle: Subject vs Book */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setGroupMode('subject')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                groupMode === 'subject'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="دسته‌بندی بر اساس عناوین کلی دروس"
            >
              بر اساس دروس
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('book')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                groupMode === 'book'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="دسته‌بندی بر اساس کتاب‌ها و پایه‌ها (زیست ۱ دهم، زیست ۲ یازدهم و...)"
            >
              کتاب و پایه
            </button>
          </div>
        </div>
      </div>

      {/* Chart & Legend Content */}
      {chartData.slices.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-500 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
            هنوز در بازه زمانی {periodLabel} مطالعه‌ای ثبت نشده است
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            با شروع تایمر یا ثبت دستی پارت مطالعه، نمودار توزیع زمانی به شکل خودکار رسم می‌شود.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Donut Chart Canvas */}
          <div className="md:col-span-6 flex flex-col items-center justify-center relative min-h-[220px]">
            <div className="w-full h-52 sm:h-56 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as SliceData;
                        return (
                          <div className="rounded-xl bg-slate-900/95 text-white p-2.5 text-xs shadow-xl border border-slate-700 backdrop-blur-sm z-50">
                            <div className="flex items-center gap-1.5 font-black mb-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: data.color }}
                              />
                              <span>{data.name}</span>
                            </div>
                            <div className="space-y-0.5 text-[11px] text-slate-300">
                              <div>زمان: {faNum(fmtHM(data.minutes))}</div>
                              <div>سهم: {faNum(data.percentage)}٪ از کل</div>
                              <div>تعداد پارت‌ها: {faNum(data.sessionsCount)} جلسه</div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={chartData.slices}
                    dataKey="minutes"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    startAngle={90}
                    endAngle={-270}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {chartData.slices.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.key}`}
                        fill={getSliceColor(entry, index)}
                        stroke="transparent"
                        className="transition-transform duration-200 cursor-pointer"
                        style={{
                          filter:
                            activeIndex === index
                              ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))'
                              : 'none',
                          transform: activeIndex === index ? 'scale(1.04)' : 'scale(1)',
                          transformOrigin: 'center center',
                        }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-slate-400 dark:text-slate-400 font-bold">
                  مجموع {periodLabel}
                </span>
                <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  {faNum(fmtHM(chartData.totalMinutes))}
                </span>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  {faNum(chartData.slices.length)} موضوع / درس
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Legend and Percent Breakdown */}
          <div className="md:col-span-6 space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
            {chartData.slices.map((slice, idx) => {
              const subj = getSubject(slice.subjectId);
              const isHovered = activeIndex === idx;
              return (
                <div
                  key={slice.key}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all border ${
                    isHovered
                      ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 shadow-xs translate-x-[-2px]'
                      : 'bg-slate-50/60 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-md shrink-0 shadow-xs"
                      style={{ backgroundColor: getSliceColor(slice, idx) }}
                    />
                    <div className="truncate">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                        <Subject3DIcon subject={subj} size="xs" />
                        <span className="truncate">{slice.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {faNum(slice.sessionsCount)} پارت مطالعه
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div className="font-black text-slate-900 dark:text-white">
                      {faNum(fmtHM(slice.minutes))}
                    </div>
                    <div className="text-[10px] font-black text-blue-600 dark:text-blue-400">
                      {faNum(slice.percentage)}٪
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
