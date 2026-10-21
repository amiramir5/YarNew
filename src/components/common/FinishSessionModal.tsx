import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, BookOpen, Target, Clock, Sparkles, Layers } from 'lucide-react';
import { Session } from '../../types';
import {
  SUBJECTS,
  SUBJECT_CHAPTERS,
  SUBJECT_BOOK_OPTIONS,
  SESSION_TYPES,
  KONKOOR_SUBJECTS,
  FINAL_SUBJECTS,
  getSubject,
  getGoftarsForChapter,
  getTopicsForSubjectAndChapter,
  getChaptersForSubjectAndBook,
  getBookTitle,
} from '../../lib/constants';
import { calcKonkoorPercent, faNum, fmtHM, fmtPercent, studyDayKey, toInt } from '../../lib/jalali';
import { uid } from '../../lib/storage';
import { Subject3DIcon } from './Subject3DIcon';

interface FinishSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (session: Session) => void;
  elapsedSeconds: number;
  initialSubject?: string;
  initialBook?: string;
  initialChapter?: string;
  initialGoftar?: string;
  initialDay?: string;
}

export const FinishSessionModal: React.FC<FinishSessionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  elapsedSeconds,
  initialSubject = 'bio',
  initialBook = 'all',
  initialChapter = '',
  initialGoftar = '',
  initialDay,
}) => {
  const [subject, setSubject] = useState(initialSubject);
  const [book, setBook] = useState(initialBook);
  const [chapter, setChapter] = useState(initialChapter);
  const [goftar, setGoftar] = useState(initialGoftar);
  const [type, setType] = useState('آموزش و مطالعه');
  const [targetDay, setTargetDay] = useState<string>(() => initialDay || studyDayKey());
  const [correct, setCorrect] = useState<string>('0');
  const [wrong, setWrong] = useState<string>('0');
  const [blank, setBlank] = useState<string>('0');
  const [note, setNote] = useState('');

  // Sync initial values when opened
  useEffect(() => {
    if (isOpen) {
      setSubject(initialSubject);
      setBook(initialBook || 'all');
      setChapter(initialChapter || '');
      setGoftar(initialGoftar || '');
      setTargetDay(initialDay || studyDayKey());
      setCorrect('0');
      setWrong('0');
      setBlank('0');
      setNote('');
    }
  }, [isOpen, initialSubject, initialBook, initialChapter, initialGoftar, initialDay]);

  if (!isOpen) return null;

  const currentSubj = getSubject(subject);
  const bookOptions = SUBJECT_BOOK_OPTIONS[subject] || [];
  const chapters = getChaptersForSubjectAndBook(subject, book);
  const availableTopics = chapter ? getTopicsForSubjectAndChapter(subject, chapter) : [];

  const cNum = toInt(correct, 0);
  const wNum = toInt(wrong, 0);
  const bNum = toInt(blank, 0);
  const totalTests = cNum + wNum + bNum;
  const percent = totalTests > 0 ? calcKonkoorPercent(cNum, wNum, bNum) : null;
  const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    // Attribute session to initialDay if timer was started yesterday or custom chosen day
    const day = targetDay || initialDay || studyDayKey();

    // Combine chapter and goftar if applicable
    let finalChapter = chapter.trim();
    if (goftar.trim()) {
      finalChapter = finalChapter ? `${finalChapter} (${goftar.trim()})` : goftar.trim();
    }

    const session: Session = {
      id: uid(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      device_id: 'client',
      subject,
      book: book && book !== 'all' ? book : undefined,
      chapter: finalChapter,
      goftar: goftar.trim() || undefined,
      seconds: elapsedSeconds,
      correct: cNum,
      wrong: wNum,
      blank: bNum,
      note: note.trim() || `پارت تمرکز زمان‌سنج — ${finalChapter || currentSubj.name}`,
      day,
      type,
    };

    onSave(session);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0a1628] rounded-3xl border border-blue-100 dark:border-blue-900/60 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-blue-950/30 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                پایان و ثبت پارت مطالعه
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مشخصات مبحث خوانده‌شده را برای تحلیل دقیق ثبت کنید
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Time summary card */}
          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-bold text-slate-700 dark:text-slate-300">
                مدت زمان ثبت‌شده این پارت:
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-lg text-blue-700 dark:text-blue-300">
                {fmtHM(elapsedMinutes)}
              </span>
              <span className="text-[11px] text-slate-500">
                ({faNum(elapsedMinutes)} دقیقه)
              </span>
            </div>
          </div>

          {/* Day attribution badge (fixes yesterday timer issue) */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-700 dark:text-slate-300 font-bold">
              تاریخ ثبت پارت: <span className="text-blue-600 dark:text-blue-400 font-mono font-black">{targetDay === studyDayKey() ? 'امروز' : 'دیروز (پارت دیشب)'}</span> ({targetDay})
            </span>
            {initialDay && initialDay !== studyDayKey() && (
              <button
                type="button"
                onClick={() => setTargetDay((d) => (d === studyDayKey() ? initialDay : studyDayKey()))}
                className="text-blue-600 dark:text-blue-400 font-extrabold hover:underline cursor-pointer"
              >
                {targetDay === studyDayKey() ? 'ثبت در دیروز' : 'ثبت در امروز'}
              </button>
            )}
          </div>

          {/* Subject Select */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              درس مطالعه‌شده
            </label>
            <div className="flex items-center gap-2">
              <Subject3DIcon subject={currentSubj} size="sm" />
              <select
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setChapter('');
                  setGoftar('');
                }}
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-blue-500"
              >
                <optgroup label="دروس اختصاصی کنکور سراسری (۴ تخصصی + زمین‌شناسی)">
                  {KONKOOR_SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon3d} {s.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="دروس عمومی (امتحانات نهایی)">
                  {FINAL_SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon3d} {s.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Book / Grade Selection if applicable */}
          {bookOptions.length > 1 && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                کتاب و پایه درسی ({currentSubj.name})
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {bookOptions.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setBook(b.id);
                      setChapter('');
                      setGoftar('');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      book === b.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chapter Select */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              فصل کتاب درسی
            </label>
            <select
              value={chapter}
              onChange={(e) => {
                setChapter(e.target.value);
                setGoftar('');
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">— انتخاب فصل مصوب کتاب —</option>
              {chapters.map((ch, idx) => (
                <option key={idx} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          {/* Goftar / Topic Selection (Thematic categorization) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-blue-200/60 dark:border-blue-900/40 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-blue-700 dark:text-blue-300 font-bold">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {subject === 'bio'
                    ? 'گفتار رسمی زیست‌شناسی:'
                    : subject === 'chem'
                    ? 'مبحث موضوعی شیمی:'
                    : subject === 'phy'
                    ? 'مبحث موضوعی فیزیک:'
                    : subject === 'math'
                    ? 'درس موضوعی ریاضی:'
                    : 'گفتار یا زیرمبحث موضوعی:'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">اختیاری / دسته‌بندی موضوعی</span>
            </div>
            {availableTopics.length > 0 ? (
              <select
                value={goftar}
                onChange={(e) => setGoftar(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-blue-500"
              >
                <option value="">
                  {subject === 'bio'
                    ? '— انتخاب گفتار کتاب زیست‌شناسی —'
                    : '— انتخاب مبحث موضوعی —'}
                </option>
                {availableTopics.map((g, idx) => (
                  <option key={idx} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={goftar}
                onChange={(e) => setGoftar(e.target.value)}
                placeholder="مثلاً: گفتار ۱، استوکیومتری یا نکته‌نویسی تستی"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
            )}
          </div>

          {/* Study Type */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              نوع فعالیت این پارت
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2 px-2.5 rounded-xl text-center font-bold transition-all cursor-pointer truncate ${
                    type === t
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tests solved in this session (Optional) */}
          <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-600" />
                <span>تست‌های حل‌شده در این پارت (اختیاری)</span>
              </span>
              {percent !== null && (
                <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                  درصد: {fmtPercent(percent)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div>
                <span className="block text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1">
                  درست
                </span>
                <input
                  type="number"
                  min="0"
                  value={correct}
                  onChange={(e) => setCorrect(e.target.value)}
                  className="w-full p-2 rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-800 font-bold text-center text-blue-600 dark:text-blue-400"
                />
              </div>

              <div>
                <span className="block text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-1">
                  غلط
                </span>
                <input
                  type="number"
                  min="0"
                  value={wrong}
                  onChange={(e) => setWrong(e.target.value)}
                  className="w-full p-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 font-bold text-center text-rose-600 dark:text-rose-400"
                />
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-400 mb-1">
                  نزده
                </span>
                <input
                  type="number"
                  min="0"
                  value={blank}
                  onChange={(e) => setBlank(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 text-center"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              یادداشت یا نکته کلیدی این پارت (اختیاری)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً: مرور شکل‌های صفحات ۵۲ تا ۵۵ کتاب و حل ۲۰ تست دامی"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="flex-1 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ثبت پارت مطالعه در گزارش روزانه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
