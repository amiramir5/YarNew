import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Layers,
  Calendar,
  Star,
  BookOpen,
  Eye,
  CheckCircle2,
  FileQuestion,
  HelpCircle,
} from 'lucide-react';
import { MistakeCard } from '../../types';
import { faNum } from '../../lib/jalali';
import { getSubject } from '../../lib/constants';
import { Subject3DIcon } from './Subject3DIcon';

interface LeitnerBoxInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxNumber: number; // 1 to 5
  intervalDays: number;
  cards: MistakeCard[];
  onOpenLightbox?: (src: string) => void;
}

export const LeitnerBoxInspectModal: React.FC<LeitnerBoxInspectModalProps> = ({
  isOpen,
  onClose,
  boxNumber,
  intervalDays,
  cards,
  onOpenLightbox,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (card.box !== boxNumber || card.deleted_at) return false;

      if (selectedSubject !== 'all' && card.subject !== selectedSubject) {
        return false;
      }

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const subj = getSubject(card.subject);
      const subjName = subj.name.toLowerCase();
      const question = (card.question || '').toLowerCase();
      const chapter = (card.chapter || '').toLowerCase();
      const source = (card.source || '').toLowerCase();
      const cause = (card.cause || '').toLowerCase();

      return (
        subjName.includes(q) ||
        question.includes(q) ||
        chapter.includes(q) ||
        source.includes(q) ||
        cause.includes(q)
      );
    });
  }, [cards, boxNumber, selectedSubject, searchQuery]);

  // Extract unique subjects in this box
  const boxSubjects = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.box === boxNumber && !c.deleted_at) {
        set.add(c.subject);
      }
    });
    return Array.from(set);
  }, [cards, boxNumber]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#0b1728] rounded-3xl border border-slate-200 dark:border-blue-900/60 shadow-2xl flex flex-col overflow-hidden text-right">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100/70 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>بازرسی کارت‌های مرحله {faNum(boxNumber)} لایتنر</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold border border-blue-200/60 dark:border-blue-800/60">
                  دوره {faNum(intervalDays)} روزه
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                مشاهده موقت و مرور سریع تست‌های ثبت‌شده بدون ایجاد تغییر در چرخه فاصله‌دار لایتنر
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-white dark:bg-[#0b1728]">
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی شماره تست، منبع کتاب، مبحث یا بخشی از متن سوال…"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {boxSubjects.length > 1 && (
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full sm:w-44 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-800 dark:text-slate-200 font-bold"
              >
                <option value="all">همه دروس این مرحله</option>
                {boxSubjects.map((sId) => {
                  const s = getSubject(sId);
                  return (
                    <option key={sId} value={sId}>
                      {s.name}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
            <span>
              نمایش <b>{faNum(filteredCards.length)}</b> کارت از مجموع{' '}
              <b>{faNum(cards.filter((c) => c.box === boxNumber && !c.deleted_at).length)}</b> کارت
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              حالت مشاهده موقت (وضعیت کارت دست‌نخورده می‌ماند)
            </span>
          </div>
        </div>

        {/* Cards Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredCards.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <FileQuestion className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p>هیچ کارتی با این مشخصات در مرحله {faNum(boxNumber)} یافت نشد.</p>
            </div>
          ) : (
            filteredCards.map((card) => {
              const subj = getSubject(card.subject);
              const isExpanded = expandedCardId === card.id;

              return (
                <div
                  key={card.id}
                  className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 hover:border-blue-300 dark:hover:border-blue-800 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <Subject3DIcon subject={subj} size="sm" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                            {subj.name}
                          </span>
                          {card.chapter && (
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                              — {card.chapter}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100/70 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold border border-blue-200/50 dark:border-blue-900/50">
                            {card.cause}
                          </span>
                        </div>

                        {card.source && (
                          <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            <span>منبع / شماره تست: <b>{card.source}</b></span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < card.importance
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200 dark:text-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Question snippet / text */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                    {isExpanded ? card.question : card.question.slice(0, 180)}
                    {card.question.length > 180 && !isExpanded && '...'}
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <div className="flex items-center gap-3 text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        نوبت مرور: {card.next_review}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {card.question.length > 180 && (
                        <button
                          type="button"
                          onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                          className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                        >
                          {isExpanded ? 'بستن متن' : 'مشاهده کامل متن'}
                        </button>
                      )}

                      {card.image_data && onOpenLightbox && (
                        <button
                          type="button"
                          onClick={() => onOpenLightbox(card.image_data!)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200/50 dark:border-blue-900/50 hover:bg-blue-100 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>عکس تست</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end bg-slate-50/50 dark:bg-slate-900/40">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            بستن پنجره بازرسی
          </button>
        </div>
      </div>
    </div>
  );
};
