import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  BookOpen,
  Presentation,
  AlertTriangle,
  Lightbulb,
  Download,
  CheckCircle2,
  BrainCircuit,
  MessageSquare,
  BarChart2,
  Calendar,
  CalendarCheck,
  Check,
  Camera,
  Eye,
  EyeOff,
  Key,
  Image as ImageIcon,
  Zap,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Upload,
  FileText,
  Trash2,
  FolderPlus,
  Compass,
} from 'lucide-react';
import {
  MistakeCard,
  ProgressEntry,
  Session,
  SlideDeck,
  TopicExplanation,
  MistakesAnalysis,
  StudyResource,
  ScheduleProposal,
  DailyPlan,
  AppSettings,
} from '../../types';
import {
  SUBJECTS,
  SUBJECT_CHAPTERS,
  getSubject,
  KONKOOR_SUBJECTS,
  FINAL_SUBJECTS,
  getGoftarsForChapter,
} from '../../lib/constants';
import { PoofyMascot } from '../common/PoofyMascot';
import {
  explainTopic,
  generateSlides,
  analyzeMistakes,
  consultCoach,
  solvePhotoQuestion,
  PhotoSolveResult,
  extractDocumentText,
  generateProactiveSchedule,
  isAiKeyConfigured,
} from '../../lib/ai';
import { FormattedCoachMessage } from '../FormattedCoachMessage';
import { Subject3DIcon } from '../common/Subject3DIcon';
import { LiveCameraModal } from '../common/LiveCameraModal';
import { loadStudyResources, saveStudyResources, loadSettings, saveSettings, uid } from '../../lib/storage';
import { studyDayKey, faNum } from '../../lib/jalali';
import { compressImage } from '../../lib/imageUtils';

interface AIViewProps {
  sessions: Session[];
  mistakes: MistakeCard[];
  progressList: ProgressEntry[];
  soundEnabled: boolean;
  settings?: AppSettings;
  plans?: DailyPlan[];
  onSavePlan?: (plan: DailyPlan) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
}

export const AIView: React.FC<AIViewProps> = ({
  sessions,
  mistakes,
  progressList,
  soundEnabled,
  settings,
  plans,
  onSavePlan,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'coach' | 'schedule' | 'photo' | 'resources' | 'slides' | 'explain' | 'mistakes'>('coach');

  // Quick Key Activator State
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean>(() => isAiKeyConfigured());
  const [quickKeyInput, setQuickKeyInput] = useState('');
  const [quickProvider, setQuickProvider] = useState<'gemini' | 'openrouter'>('gemini');
  const [quickKeySaveSuccess, setQuickKeySaveSuccess] = useState(false);
  const [showQuickKey, setShowQuickKey] = useState(false);

  // Study Resources State
  const [resources, setResources] = useState<StudyResource[]>(() => loadStudyResources());
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);
  const [isResourceUploading, setIsResourceUploading] = useState(false);
  const [resourceError, setResourceError] = useState('');

  // Camera & Image Rotation State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [photoRotation, setPhotoRotation] = useState<number>(0);

  // Coach Chat State
  const [coachGoal, setCoachGoal] = useState('مطالعه روزانه ۱۰ ساعت با تمرکز روی زیست و شیمی کنکور ۱۴۰۶');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([
    {
      role: 'assistant',
      text: 'سلام! من مشاور کنکوریار هستم. پاسخ‌هایم فقط در محدوده کنکور است: مباحث کتاب درسی، تست‌زنی، برنامه‌ریزی و اصلاح اشتباهات. سوال درسی خود را کوتاه بپرس تا جواب فشرده و کاربردی بدهم.',
    },
  ]);
  const [isCoachLoading, setIsCoachLoading] = useState(false);

  // Auto-scroll ref
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isCoachLoading]);

  // Topic Explainer State
  const [explainSubj, setExplainSubj] = useState('bio');
  const [explainChapter, setExplainChapter] = useState('');
  const [explainGoftar, setExplainGoftar] = useState('');
  const [explainCustom, setExplainCustom] = useState('');
  const [isExplainLoading, setIsExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState<TopicExplanation | null>(null);
  const [explainError, setExplainError] = useState('');

  // Slides State
  const [slidesSubj, setSlidesSubj] = useState('bio');
  const [slidesChapter, setSlidesChapter] = useState('');
  const [slidesGoftar, setSlidesGoftar] = useState('');
  const [slidesCustom, setSlidesCustom] = useState('');
  const [slidesCount, setSlidesCount] = useState(6);
  const [isSlidesLoading, setIsSlidesLoading] = useState(false);
  const [slidesResult, setSlidesResult] = useState<SlideDeck | null>(null);
  const [slidesError, setSlidesError] = useState('');

  // Photo Question Solver State (Strictly Iranian High School Textbook Aligned)
  const [photoSubj, setPhotoSubj] = useState('bio');
  const [photoChapter, setPhotoChapter] = useState('');
  const [photoGoftar, setPhotoGoftar] = useState('');
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoCustom, setPhotoCustom] = useState('');
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState<PhotoSolveResult | null>(null);
  const [photoError, setPhotoError] = useState('');

  // Mistake Analysis State
  const [isMistakesLoading, setIsMistakesLoading] = useState(false);
  const [mistakesResult, setMistakesResult] = useState<MistakesAnalysis | null>(null);
  const [mistakesError, setMistakesError] = useState('');

  // Schedule Generator & Diagnostic Assessment State
  const [scheduleGoalHours, setScheduleGoalHours] = useState<number>(10);
  const [scheduleGradeFocus, setScheduleGradeFocus] = useState('ترکیب دوازدهم و پایه (پیشنهادی)');
  const [scheduleWakeTime, setScheduleWakeTime] = useState('06:00');
  const [scheduleWeakSubjects, setScheduleWeakSubjects] = useState<string[]>(['زیست', 'شیمی', 'فیزیک']);
  const [scheduleSchoolStatus, setScheduleSchoolStatus] = useState('فارغ‌التحصیل و پشت کنکور (تمام‌وقت در خانه)');
  const [scheduleTargetExam, setScheduleTargetExam] = useState('کنکور سراسری تجربی - هدف رتبه زیر ۵۰۰ (جهش از رتبه ۲۰ هزار)');
  const [scheduleCurrentPosition, setScheduleCurrentPosition] = useState('سال سوم کنکور؛ مطالعه از صفر؛ ترکیب دوازدهم و دهم (یازدهم هنوز نه)؛ ۳ ساعت زیست ۱۲ + ۱.۵ ساعت زیست ۱۰، ۲ ساعت شیمی ۱۲ + ۱ ساعت شیمی ۱۰، ۲ ساعت فیزیک ۱۲ + ۱ ساعت فیزیک ۱۰ (فردا ریاضی)');
  const [scheduleStudyStyle, setScheduleStudyStyle] = useState('ترکیب تست‌محور سرعتی با مرور خط‌به‌خط قیدهای کتاب درسی');

  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<ScheduleProposal | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSavedSuccess, setScheduleSavedSuccess] = useState(false);

  const handleToggleWeakSubject = (subjName: string) => {
    setScheduleWeakSubjects((prev) =>
      prev.includes(subjName) ? prev.filter((s) => s !== subjName) : [...prev, subjName]
    );
  };

  const handleSaveQuickKey = () => {
    if (!quickKeyInput.trim()) return;
    const current = loadSettings();
    const updated: AppSettings = {
      ...current,
      ai: {
        ...current.ai,
        provider: quickProvider,
        geminiKey: quickProvider === 'gemini' ? quickKeyInput.trim() : current.ai.geminiKey,
        openrouterKey: quickProvider === 'openrouter' ? quickKeyInput.trim() : current.ai.openrouterKey,
      },
    };
    saveSettings(updated);
    onUpdateSettings?.(updated);
    setIsKeyConfigured(true);
    setQuickKeySaveSuccess(true);
    setTimeout(() => setQuickKeySaveSuccess(false), 3000);
  };

  const handleGenerateScheduleTab = async () => {
    setIsScheduleLoading(true);
    setScheduleError('');
    setScheduleSavedSuccess(false);

    try {
      const proposal = await generateProactiveSchedule({
        goalMinutes: scheduleGoalHours * 60,
        weakSubjects: scheduleWeakSubjects.length ? scheduleWeakSubjects : ['زیست', 'شیمی'],
        dayName: 'برنامه اختصاصی شخصی',
        gradeFocus: scheduleGradeFocus,
        wakeTime: scheduleWakeTime,
        schoolStatus: scheduleSchoolStatus,
        targetExam: scheduleTargetExam,
        currentLevelAndPosition: scheduleCurrentPosition,
        studyStyle: scheduleStudyStyle,
      });
      setScheduleResult(proposal);
    } catch (err: any) {
      console.warn('Schedule generation error, using balanced fallback:', err);
      setScheduleResult({
        title: 'برنامه متوازن و هدفمند روزانه',
        day: 'فردا',
        wake_time: scheduleWakeTime,
        description: 'این برنامه با رعایت ریتم زیستی، پارت‌های ۹۰ دقیقه‌ای و تفکیک مباحث پایه و دوازدهم چیده شده است.',
        blocks: [
          { time: `${scheduleWakeTime} - 08:00`, subject: 'زیست‌شناسی', topic: 'مطالعه مفهومی گفتار ۱ و ۲ دوازدهم + ۴۰ تست', type: 'study', color: 'blue' },
          { time: '08:15 - 09:45', subject: 'شیمی', topic: 'تست‌های زمان‌دار استوکیومتری و محلول‌ها', type: 'test', color: 'purple' },
          { time: '10:00 - 11:30', subject: 'فیزیک', topic: 'حرکت‌شناسی و دینامیک + تحلیل غلط‌ها', type: 'test', color: 'emerald' },
          { time: '12:00 - 13:00', subject: 'عمومی/نهایی', topic: 'امتحان نهایی ادبیات فارسی / زبان انگلیسی', type: 'study', color: 'amber' },
          { time: '16:00 - 17:30', subject: 'ریاضی', topic: 'حل تست‌های مبحثی تابع و مثلثات پایه', type: 'study', color: 'cyan' },
          { time: '21:00 - 22:00', subject: 'مرور شبانه', topic: 'مرور فلش‌کارت‌های جعبه لایتنر', type: 'review', color: 'rose' },
        ],
      });
    } finally {
      setIsScheduleLoading(false);
    }
  };

  const handleApplyScheduleToPlan = () => {
    if (!scheduleResult || !onSavePlan) return;
    const today = studyDayKey();
    const planItems = scheduleResult.blocks.map((b) => ({
      text: `${b.time} | ${b.subject}: ${b.topic} (${b.type === 'test' ? 'تست‌زنی' : b.type === 'review' ? 'مرور' : 'مطالعه'})`,
      done: false,
    }));

    const newPlan: DailyPlan = {
      id: 'plan-' + Date.now(),
      day: today,
      wake_time: scheduleResult.wake_time || scheduleWakeTime,
      items: planItems,
      created_at: Date.now(),
      updated_at: Date.now(),
      device_id: settings?.deviceId || 'client',
      deleted_at: null,
    };

    onSavePlan(newPlan);
    setScheduleSavedSuccess(true);
    setTimeout(() => setScheduleSavedSuccess(false), 3000);
  };

  const activeResource = resources.find((r) => r.id === activeResourceId);

  // In-place Image Rotation for Photo Solver
  const handleRotatePhoto = (delta: number) => {
    if (!photoImage) return;
    const newRot = (photoRotation + delta + 360) % 360;
    setPhotoRotation(newRot);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (delta === 90 || delta === -90) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((delta * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      setPhotoImage(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = photoImage;
  };

  // Upload Study Resource (PDF / Textbook)
  const handleResourceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setResourceError('حجم فایل نباید بیش از ۲۰ مگابایت باشد.');
      return;
    }

    setIsResourceUploading(true);
    setResourceError('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          let extracted = '';
          try {
            extracted = await extractDocumentText(base64Data, file.type || 'application/pdf');
          } catch (exErr: any) {
            console.warn('Document text extract failed, keeping file metadata:', exErr);
            extracted = `فایل منبع آموزشی ${file.name}`;
          }

          const newRes: StudyResource = {
            id: uid(),
            name: file.name.replace(/\.[^/.]+$/, ''),
            subject: 'زیست‌شناسی',
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || 'application/pdf',
            extracted_text: extracted,
            created_at: Date.now(),
            updated_at: Date.now(),
          };

          const updated = [newRes, ...resources];
          setResources(updated);
          saveStudyResources(updated);
          setActiveResourceId(newRes.id);
        } catch (err: any) {
          setResourceError(err.message || 'خطا در پردازش فایل منبع');
        } finally {
          setIsResourceUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setResourceError(err.message || 'خطا در خواندن فایل');
      setIsResourceUploading(false);
    }
  };

  const handleDeleteResource = (id: string) => {
    const updated = resources.filter((r) => r.id !== id);
    setResources(updated);
    saveStudyResources(updated);
    if (activeResourceId === id) setActiveResourceId(null);
  };

  // Coach Send
  const handleSendCoach = async (textToSend?: string, mode?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text && !mode) return;

    const newHistory = [...chatMessages, { role: 'user' as const, text: text || mode || '' }];
    setChatMessages(newHistory);
    setChatInput('');
    setIsCoachLoading(true);

    try {
      const context = {
        goal: coachGoal,
        userHistory: 'داوطلب سال سوم کنکور تجربی با اهداف رتبه برتر و تراز بالای کانون قلم‌چی و دانشگاه‌های علوم پزشکی',
        totalSessions: sessions.filter((s) => !s.deleted_at).length,
        totalMistakes: mistakes.filter((m) => !m.deleted_at).length,
        recentProgress: progressList.slice(-10),
        activeResource: activeResource ? { name: activeResource.name, subject: activeResource.subject } : undefined,
      };

      // Streaming draft: last assistant message is edited in place as tokens arrive
      const draft = { role: 'assistant' as const, text: '' };
      setChatMessages((prev) => [...prev, draft]);

      const reply = await consultCoach(
        text,
        context,
        mode || 'عمومی',
        chatMessages,
        undefined,
        activeResource?.extracted_text,
        (partial) => {
          setChatMessages((prev) => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', text: partial };
            return copy;
          });
        }
      );

      setChatMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === 'assistant') {
          copy[copy.length - 1] = { role: 'assistant', text: reply };
        } else {
          copy.push({ role: 'assistant', text: reply });
        }
        return copy;
      });
    } catch (err: any) {
      const errMsg = `خطا در دریافت پاسخ: ${err.message || 'مشکلی رخ داد.'}`;
      setChatMessages((prev) => {
        const copy = [...prev];
        // Replace the still-empty streaming draft with the error, else append
        if (copy.length > 0 && copy[copy.length - 1].role === 'assistant' && !copy[copy.length - 1].text.trim()) {
          copy[copy.length - 1] = { role: 'assistant', text: errMsg };
        } else {
          copy.push({ role: 'assistant', text: errMsg });
        }
        return copy;
      });
    } finally {
      setIsCoachLoading(false);
    }
  };

  // Explain Submit
  const handleExplainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExplainLoading(true);
    setExplainError('');
    setExplainResult(null);

    const topic = explainCustom.trim() || explainChapter || getSubject(explainSubj).name;

    try {
      const res = await explainTopic(topic, getSubject(explainSubj).name, undefined, undefined, activeResource?.extracted_text);
      setExplainResult(res);
    } catch (err: any) {
      setExplainError(err.message || 'خطا در ارتباط با هوش مصنوعی');
    } finally {
      setIsExplainLoading(false);
    }
  };

  // Slides Submit
  const handleSlidesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSlidesLoading(true);
    setSlidesError('');
    setSlidesResult(null);

    try {
      const res = await generateSlides({
        subject: getSubject(slidesSubj).name,
        chapter: slidesChapter,
        goftar: slidesGoftar,
        topic: slidesCustom.trim(),
        count: slidesCount,
        sourceText: activeResource?.extracted_text,
      });
      setSlidesResult(res);
    } catch (err: any) {
      setSlidesError(err.message || 'خطا در ساخت اسلایدها');
    } finally {
      setIsSlidesLoading(false);
    }
  };

  // Photo Question Solver Submit
  const handlePhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoImage && !photoCustom.trim()) {
      setPhotoError('لطفاً تصویر سوال را آپلود کنید یا متن آن را بنویسید.');
      return;
    }

    setIsPhotoLoading(true);
    setPhotoError('');
    setPhotoResult(null);

    try {
      const res = await solvePhotoQuestion({
        imageBase64: photoImage || undefined,
        subject: getSubject(photoSubj).name,
        chapter: photoChapter,
        goftar: photoGoftar,
        customText: photoCustom.trim(),
        sourceText: activeResource?.extracted_text,
      });
      setPhotoResult(res);
    } catch (err: any) {
      setPhotoError(err.message || 'خطا در تحلیل سوال تصویری');
    } finally {
      setIsPhotoLoading(false);
    }
  };

  // Download slides as HTML (Safe with strict HTML escaping & sanitized filename)
  const handleDownloadSlidesHtml = () => {
    if (!slidesResult) return;

    const escapeHtml = (unsafe: any) =>
      String(unsafe ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const safeTitle = escapeHtml(slidesResult.deck_title);
    const safeFilename = String(slidesResult.deck_title ?? 'deck')
      .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_')
      .slice(0, 50);

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #fff; padding: 2rem; margin: 0; }
    .slide { background: #1e293b; border-radius: 1.5rem; padding: 3rem; margin-bottom: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #334155; }
    h1 { color: #60a5fa; font-size: 2rem; border-bottom: 2px solid #334155; padding-bottom: 1rem; }
    h2 { color: #93c5fd; font-size: 1.5rem; }
    ul { font-size: 1.2rem; line-height: 2.2; }
    .image-prompt { background: #0f172a; border-right: 4px solid #3b82f6; padding: 1rem; border-radius: 0.5rem; font-size: 0.9rem; color: #94a3b8; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${slidesResult.slides
    .map(
      (s, idx) => `
    <div class="slide">
      <h2>اسلاید ${idx + 1}: ${escapeHtml(s.title)}</h2>
      <ul>
        ${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
      </ul>
      ${s.image_prompt ? `<div class="image-prompt">نمودار پیشنهادی: ${escapeHtml(s.image_prompt)}</div>` : ''}
    </div>
  `
    )
    .join('')}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slides-${safeFilename}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Analyze Mistakes
  const handleAnalyzeMistakes = async () => {
    setIsMistakesLoading(true);
    setMistakesError('');
    setMistakesResult(null);

    const validItems = mistakes.filter((m) => !m.deleted_at).slice(0, 20);
    if (validItems.length < 2) {
      setMistakesError('حداقل ۲ اشتباه ثبت‌شده در دفترچه نیاز است.');
      setIsMistakesLoading(false);
      return;
    }

    try {
      const res = await analyzeMistakes(
        validItems.map((m) => ({
          subject: getSubject(m.subject).name,
          cause: m.cause,
          question: m.question,
        }))
      );
      setMistakesResult(res);
    } catch (err: any) {
      setMistakesError(err.message || 'خطا در تحلیل اشتباهات');
    } finally {
      setIsMistakesLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      <div className="flex items-center justify-between p-4.5 rounded-3xl bg-gradient-to-r from-blue-50/95 via-indigo-50/80 to-blue-50/95 dark:from-[#0c1c33] dark:via-[#091526] dark:to-[#0c1c33] border border-blue-200/80 dark:border-blue-900/60 shadow-xs">
        <div className="flex items-center gap-3.5">
          <PoofyMascot mood="talking" size="lg" />
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span>پوفی - دستیار پفکی و مشاور هوشمند کنکور</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                Gemini & DeepSeek
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              سلام! من پوفی‌ام 🌟 همراهت برای تنظیم جدول برنامه رنگی، پاسخ به تست‌ها و تحلیل دقیق اشتباهات.
            </p>
          </div>
        </div>
      </div>

      {/* Quick AI Key Activator (if no personal key registered) */}
      {!isKeyConfigured && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 dark:from-[#0d1e38] dark:via-[#112444] dark:to-[#0d1e38] border border-blue-200 dark:border-blue-900 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  فعال‌سازی سریع موتور هوش مصنوعی برای پاسخ‌دهی آنی (زیر ۵ ثانیه)
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                  برای حل مستقیم تست‌ها و حل عکس بدون معطلی، کلید رایگان Google Gemini را از{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-600 dark:text-blue-400 underline"
                  >
                    Google AI Studio
                  </a>{' '}
                  یا کلید OpenRouter را در کادر زیر وارد کنید:
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              اتصال مستقیم
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <select
              value={quickProvider}
              onChange={(e) => setQuickProvider(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <option value="gemini">Google Gemini (رایگان و سریع)</option>
              <option value="openrouter">OpenRouter / DeepSeek</option>
            </select>

            <div className="flex-1 relative">
              <input
                type={showQuickKey ? 'text' : 'password'}
                value={quickKeyInput}
                onChange={(e) => setQuickKeyInput(e.target.value)}
                placeholder={quickProvider === 'gemini' ? 'کلید Gemini (AIzaSy...)' : 'کلید OpenRouter (sk-or-v1-...)'}
                className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-xs font-mono pl-9 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowQuickKey(!showQuickKey)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showQuickKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveQuickKey}
              disabled={!quickKeyInput.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-colors disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
            >
              {quickKeySaveSuccess ? 'فعال شد! ✓' : 'ثبت و فعال‌سازی فوری'}
            </button>
          </div>
        </div>
      )}

      {/* Navigation Segmented Controls */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl max-w-2xl text-xs font-bold overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('coach')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'coach'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>مشاور هوشمند</span>
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'schedule'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <CalendarCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>جدول برنامه رنگی</span>
        </button>

        <button
          onClick={() => setActiveTab('photo')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'photo'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>حل عکس و تست کتاب</span>
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'resources'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <FolderPlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>منابع درسی و جزوات</span>
          {resources.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/80 text-[10px] flex items-center justify-center font-bold">
              {resources.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('slides')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'slides'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <Presentation className="w-3.5 h-3.5" />
          <span>اسلایدساز کتاب</span>
        </button>

        <button
          onClick={() => setActiveTab('explain')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'explain'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>آموزش مفهومی</span>
        </button>

        <button
          onClick={() => setActiveTab('mistakes')}
          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            activeTab === 'mistakes'
              ? 'bg-white dark:bg-[#0c1f38] text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/50 dark:border-blue-800/60 font-black'
              : 'text-slate-600 hover:text-blue-700 dark:hover:text-blue-300'
          }`}
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          <span>تحلیل اشتباهات</span>
        </button>
      </div>

      {/* Active Grounding Resource Banner */}
      {activeResource && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 font-bold">
            <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              منبع استنادی فعال: <b>{activeResource.name}</b> (پاسخ‌های مشاور و تحلیل تست‌ها ۱۰۰٪ مطابق این منبع خواهد بود)
            </span>
          </div>
          <button
            onClick={() => setActiveResourceId(null)}
            className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer shrink-0"
          >
            غیرفعال‌سازی محدودیت منبع
          </button>
        </div>
      )}

      {/* Tab 1: AI Study Coach */}
      {activeTab === 'coach' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-4">
          {/* Goal & constraints settings */}
          <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 space-y-2">
            <span className="text-xs font-extrabold text-blue-900 dark:text-blue-200 block">
              هدف‌گذاری و محدودیت‌های شما برای مشاور:
            </span>
            <input
              type="text"
              value={coachGoal}
              onChange={(e) => setCoachGoal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 text-xs border border-blue-200 dark:border-blue-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => handleSendCoach(undefined, 'وضعیت من را تحلیل کن')}
              className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 hover:border-blue-500 bg-blue-50/30 dark:bg-blue-950/30 text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <BarChart2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>تحلیل جامع وضعیت امروز من</span>
            </button>
            <button
              onClick={() => handleSendCoach(undefined, 'برای فردا و این هفته برنامه عملی بده')}
              className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 hover:border-blue-500 bg-blue-50/30 dark:bg-blue-950/30 text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>تدوین برنامه عملیاتی این هفته</span>
            </button>
            <button
              onClick={() => handleSendCoach(undefined, 'دقیق حساب کن از هدف و بودجه‌بندی چقدر عقب هستم؟')}
              className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 hover:border-blue-500 bg-blue-50/30 dark:bg-blue-950/30 text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>چقدر از بودجه‌بندی عقب یا جلو هستم؟</span>
            </button>
          </div>

          {/* Chat Logs */}
          <div
            ref={chatContainerRef}
            className="h-88 overflow-y-auto space-y-3 p-3 bg-slate-50/70 dark:bg-[#071120] rounded-xl border border-slate-100 dark:border-blue-900/40 text-xs scroll-smooth"
          >
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl leading-relaxed text-right transition-all duration-200 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                      : 'bg-white dark:bg-[#0d1e35] text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-blue-900/60 rounded-tl-xs shadow-xs'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <FormattedCoachMessage content={msg.text} />
                  ) : (
                    <div className="whitespace-pre-line">{msg.text}</div>
                  )}
                </div>
              </div>
            ))}
            {isCoachLoading && !chatMessages[chatMessages.length - 1]?.text?.trim() && (
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs py-2 animate-pulse">
                <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>مشاور در حال تحلیل کارشناسی، بررسی مصوبات و تدوین پاسخ مستند است…</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCoach();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="از مشاور بپرسید… مثلاً: چطور تراز فیزیک را از ۵۰ به ۷۰ برسانم؟"
              className="flex-1 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isCoachLoading || !chatInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ارسال</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab: Colorful AI Study Schedule Table */}
      {activeTab === 'schedule' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  سازنده جدول برنامه مطالعاتی رنگی و متوازن
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  تنظیم هوشمند پارت‌های ۷۵ تا ۹۰ دقیقه‌ای با تفکیک روزانه، تعادل پایه‌ها و پارت تست‌زنی
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              AI Smart Scheduler
            </span>
          </div>

          {/* Configuration Form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                هدف ساعت مطالعه روزانه (ساعت)
              </label>
              <input
                type="number"
                min="4"
                max="16"
                value={scheduleGoalHours}
                onChange={(e) => setScheduleGoalHours(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-center font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                ساعت بیداری پیشنهادی
              </label>
              <input
                type="text"
                value={scheduleWakeTime}
                onChange={(e) => setScheduleWakeTime(e.target.value)}
                placeholder="06:00"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-center font-bold"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                راهبرد توازن پایه‌ها
              </label>
              <select
                value={scheduleGradeFocus}
                onChange={(e) => setScheduleGradeFocus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold"
              >
                <option value="ترکیب دوازدهم و پایه (پیشنهادی)">ترکیب دوازدهم و پایه (پیشنهادی کنکور)</option>
                <option value="تمرکز روی دوازدهم و نهایی">تمرکز ویژه روی دوازدهم و نهایی</option>
                <option value="جمع‌بندی پایه دهم و یازدهم">جمع‌بندی تستی پایه دهم و یازدهم</option>
              </select>
            </div>
          </div>

          {/* Weak Subjects Select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
              دروس با اولویت ویژه برای پوشش بیشتر در برنامه:
            </label>
            <div className="flex flex-wrap gap-2">
              {['زیست', 'شیمی', 'فیزیک', 'ریاضی', 'زمین‌شناسی', 'عمومی/نهایی'].map((subj) => {
                const isSelected = scheduleWeakSubjects.includes(subj);
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => handleToggleWeakSubject(subj)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {subj}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detailed Diagnostic Assessment Section */}
          <div className="p-4 rounded-2xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 space-y-3.5">
            <span className="text-xs font-black text-blue-900 dark:text-blue-200 block">
              ارزیابی اختصاصی مشاور برای شخصی‌سازی دقیق برنامه:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  وضعیت تحصیلی شما
                </label>
                <select
                  value={scheduleSchoolStatus}
                  onChange={(e) => setScheduleSchoolStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold"
                >
                  <option value="دوازدهم تجربی (مدرسه‌رو - ظهر به بعد در خانه)">دوازدهم تجربی (مدرسه‌رو - ظهر به بعد در خانه)</option>
                  <option value="دوازدهم تجربی (غیرحضوری / مرخصی)">دوازدهم تجربی (غیرحضوری / مطالعه تمام‌وقت)</option>
                  <option value="فارغ‌التحصیل و پشت کنکور (تمام‌وقت در خانه)">فارغ‌التحصیل و پشت کنکور (تمام‌وقت در خانه)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  آزمون آزمایشی و تراز هدف
                </label>
                <input
                  type="text"
                  value={scheduleTargetExam}
                  onChange={(e) => setScheduleTargetExam(e.target.value)}
                  placeholder="مثلاً: کانون قلم‌چی - تراز ۶۵۰۰"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الان کجای دروس هستید و چه مباحثی عقبید؟
                </label>
                <input
                  type="text"
                  value={scheduleCurrentPosition}
                  onChange={(e) => setScheduleCurrentPosition(e.target.value)}
                  placeholder="مثلاً: زیست فصل ۳ دوازدهم، شیمی استوکیومتری یازدهم عقبم"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  سبک و مدل مطالعه مورد علاقه
                </label>
                <select
                  value={scheduleStudyStyle}
                  onChange={(e) => setScheduleStudyStyle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold"
                >
                  <option value="ترکیب تست‌محور سرعتی با مرور خط‌به‌خط قیدهای کتاب درسی">ترکیب تست‌محور سرعتی با مرور خط‌به‌خط قیدهای کتاب درسی</option>
                  <option value="تست‌محور سنجشی زمان‌دار برای افزایش تراز">تست‌محور سنجشی زمان‌دار برای افزایش تراز</option>
                  <option value="مفهومی خط‌به‌خط کتاب درسی و حل تشریحی نهایی">مفهومی خط‌به‌خط کتاب درسی و حل تشریحی نهایی</option>
                </select>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleGenerateScheduleTab}
              disabled={isScheduleLoading}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>{isScheduleLoading ? 'در حال طراحی و تنظیم جدول رنگی…' : 'تولید جدول برنامه رنگی متوازن'}</span>
            </button>
          </div>

          {/* Result: Colorful Schedule Table */}
          {scheduleResult && (
            <div className="mt-4 space-y-4 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/80 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>{scheduleResult.title || 'برنامه متوازن روزانه'}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      بیداری: {scheduleResult.wake_time || scheduleWakeTime}
                    </span>
                  </h4>
                  {scheduleResult.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {scheduleResult.description}
                    </p>
                  )}
                </div>

                {onSavePlan && (
                  <button
                    type="button"
                    onClick={handleApplyScheduleToPlan}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {scheduleSavedSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>به برنامه‌ریزی روزانه اضافه شد!</span>
                      </>
                    ) : (
                      <>
                        <CalendarCheck className="w-4 h-4" />
                        <span>افزودن به برنامه‌ریزی روزانه من</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Colorful Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="p-3 w-32 font-mono">بازه زمانی</th>
                      <th className="p-3 w-28">درس</th>
                      <th className="p-3">موضوع و گفتار آموزشی</th>
                      <th className="p-3 w-28 text-center">نوع پارت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {scheduleResult.blocks.map((block, idx) => {
                      const colorMap: Record<string, string> = {
                        blue: 'bg-blue-50/70 hover:bg-blue-100/60 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 text-blue-950 dark:text-blue-200 border-r-4 border-r-blue-500',
                        emerald: 'bg-emerald-50/70 hover:bg-emerald-100/60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 border-r-4 border-r-emerald-500',
                        purple: 'bg-purple-50/70 hover:bg-purple-100/60 dark:bg-purple-950/30 dark:hover:bg-purple-950/50 text-purple-950 dark:text-purple-200 border-r-4 border-r-purple-500',
                        cyan: 'bg-cyan-50/70 hover:bg-cyan-100/60 dark:bg-cyan-950/30 dark:hover:bg-cyan-950/50 text-cyan-950 dark:text-cyan-200 border-r-4 border-r-cyan-500',
                        amber: 'bg-amber-50/70 hover:bg-amber-100/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 text-amber-950 dark:text-amber-200 border-r-4 border-r-amber-500',
                        rose: 'bg-rose-50/70 hover:bg-rose-100/60 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-950 dark:text-rose-200 border-r-4 border-r-rose-500',
                      };

                      const badgeMap: Record<string, { label: string; class: string }> = {
                        study: { label: 'آموزش و یادگیری', class: 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200' },
                        test: { label: 'تست‌زنی و تحلیل', class: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200' },
                        review: { label: 'مرور و تثبیت', class: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200' },
                      };

                      const blockColorClass = colorMap[block.color || 'blue'] || colorMap.blue;
                      const badgeInfo = badgeMap[block.type] || badgeMap.study;

                      return (
                        <tr key={idx} className={`transition-colors ${blockColorClass}`}>
                          <td className="p-3 font-mono font-bold text-xs" dir="ltr">
                            {block.time}
                          </td>
                          <td className="p-3 font-extrabold text-xs">
                            {block.subject}
                          </td>
                          <td className="p-3 font-medium text-xs leading-relaxed">
                            {block.topic}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold ${badgeInfo.class}`}>
                              {badgeInfo.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Topic Explainer */}
      {activeTab === 'explain' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-5">
          <form onSubmit={handleExplainSubmit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  درس
                </label>
                <select
                  value={explainSubj}
                  onChange={(e) => {
                    setExplainSubj(e.target.value);
                    setExplainChapter('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
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

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  فصل مصوب
                </label>
                <select
                  value={explainChapter}
                  onChange={(e) => setExplainChapter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="">— انتخاب فصل یا وارد کردن مبحث دلخواه در پایین —</option>
                  {(SUBJECT_CHAPTERS[explainSubj] || []).map((ch, idx) => (
                    <option key={idx} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                یا نام دقیق مبحث یا تیپ تستی خاص
              </label>
              <input
                type="text"
                value={explainCustom}
                onChange={(e) => setExplainCustom(e.target.value)}
                placeholder="مثلاً: جهش‌های کوچک و جهش‌های کروموزومی در ژنتیک دوازدهم"
                className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
            </div>

            {explainError && (
              <p className="text-blue-700 dark:text-blue-300 text-xs bg-blue-50 dark:bg-blue-950/50 p-2.5 rounded-xl border border-blue-200 dark:border-blue-800">
                {explainError}
              </p>
            )}

            <button
              type="submit"
              disabled={isExplainLoading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isExplainLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>در حال تدوین آموزش مفهومی…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>توضیح مفهومی و تستی مبحث</span>
                </>
              )}
            </button>
          </form>

          {/* Explanation Output */}
          {explainResult && (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 space-y-4 animate-in fade-in text-xs leading-relaxed shadow-xs">
              <h3 className="text-base font-black text-blue-900 dark:text-blue-300">
                {explainResult.title}
              </h3>
              <p className="text-slate-700 dark:text-slate-300">
                {explainResult.intro}
              </p>

              {/* Key points */}
              {explainResult.key_points?.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <h4 className="font-extrabold text-slate-900 dark:text-white">
                    نکات کلیدی و مفهومی:
                  </h4>
                  {explainResult.key_points.map((kp, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-blue-50/40 dark:bg-[#071324] border border-blue-100 dark:border-blue-900/40"
                    >
                      <b className="text-blue-800 dark:text-blue-300 block mb-1">
                        {kp.heading}
                      </b>
                      <p className="text-slate-600 dark:text-slate-300">
                        {kp.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulas */}
              {explainResult.formulas?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/50 space-y-1.5">
                  <span className="font-bold text-sky-900 dark:text-sky-300 block">
                    قواعد و فرمول‌های طلایی تستی:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {explainResult.formulas.map((f, idx) => (
                      <li key={idx}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pitfalls */}
              {explainResult.pitfalls?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-1.5">
                  <span className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                    <span>دام‌های تستی طراحان کنکور:</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {explainResult.pitfalls.map((pf, idx) => (
                      <li key={idx}>{pf}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Study Tip */}
              {explainResult.study_tip && (
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-slate-700 dark:text-slate-300">
                    <b>توصیه مشاور: </b> {explainResult.study_tip}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Photo Question Solver (Strictly Iranian Textbook Aligned) */}
      {activeTab === 'photo' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-5 animate-in fade-in">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-600" />
              <span>حل و تحلیل تخصصی عکس تست و کتاب درسی</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              تصویر سوال، تست کنکور یا شکل کتاب را آپلود کنید تا هوش مصنوعی ۱۰۰٪ مطابق خط‌به‌خط کتاب‌های درسی رسمی ایران (پایه‌های دهم، یازدهم و دوازدهم) آن را تحلیل، حل تشریحی و دام‌شناسی کند.
            </p>
          </div>

          <form onSubmit={handlePhotoSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  درس
                </label>
                <select
                  value={photoSubj}
                  onChange={(e) => {
                    setPhotoSubj(e.target.value);
                    setPhotoChapter('');
                    setPhotoGoftar('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
                >
                  <optgroup label="دروس اختصاصی کنکور سراسری">
                    {KONKOOR_SUBJECTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon3d} {s.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="دروس عمومی نهایی">
                    {FINAL_SUBJECTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon3d} {s.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  فصل کتاب درسی
                </label>
                <select
                  value={photoChapter}
                  onChange={(e) => {
                    setPhotoChapter(e.target.value);
                    setPhotoGoftar('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
                >
                  <option value="">— تشخیص خودکار یا انتخاب فصل —</option>
                  {(SUBJECT_CHAPTERS[photoSubj] || []).map((ch, idx) => (
                    <option key={idx} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>

              {photoSubj === 'bio' && (
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                    گفتار اختصاصی زیست‌شناسی
                  </label>
                  <select
                    value={photoGoftar}
                    onChange={(e) => setPhotoGoftar(e.target.value)}
                    disabled={!photoChapter}
                    className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium disabled:opacity-50"
                  >
                    <option value="">— گفتار فصل یا تشخیص خودکار —</option>
                    {getGoftarsForChapter(photoChapter).map((g, idx) => (
                      <option key={idx} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Image upload and Camera capture box */}
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                تصویر سوال، تست کنکور یا صفحه کتاب درسی
              </label>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsCameraModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black transition-colors cursor-pointer shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>عکس‌برداری لحظه‌ای با دوربین</span>
                  </button>

                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 cursor-pointer transition-colors text-slate-700 dark:text-slate-200 font-bold">
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <span>انتخاب فایل عکس از دستگاه</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setIsPhotoLoading(true);
                          setPhotoError('');
                          try {
                            const compressed = await compressImage(file, 1280, 0.75);
                            setPhotoImage(compressed);
                            setPhotoRotation(0);
                          } catch (err: any) {
                            console.error('Image compression error:', err);
                            const reader = new FileReader();
                            reader.onload = () => {
                              setPhotoImage(reader.result as string);
                              setPhotoRotation(0);
                            };
                            reader.readAsDataURL(file);
                          } finally {
                            setIsPhotoLoading(false);
                          }
                        }
                      }}
                    />
                  </label>
                </div>

                {photoImage && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-blue-200 dark:border-blue-900/60 space-y-3">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-blue-300 dark:border-blue-800 bg-black/10 shrink-0 flex items-center justify-center">
                        <img
                          src={photoImage}
                          alt="Uploaded test"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="space-y-2 flex-1 text-right">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          جهت و زاویه تصویر سوال:
                        </span>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          اگر سوال کج یا برعکس ثبت شده، با دکمه‌های زیر آن را بچرخانید تا متن تست به صورت کاملاً خوانا برای هوش مصنوعی ارسال شود:
                        </p>

                        {/* Rotation Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRotatePhoto(-90)}
                            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>۹۰- درجه</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRotatePhoto(90)}
                            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>۹۰+ درجه</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRotatePhoto(180)}
                            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>۱۸۰ درجه</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPhotoImage(null);
                              setPhotoRotation(0);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold transition-colors cursor-pointer"
                          >
                            حذف تصویر
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                توضیحات تکمیلی یا متن سوال (اختیاری)
              </label>
              <textarea
                value={photoCustom}
                onChange={(e) => setPhotoCustom(e.target.value)}
                placeholder="در صورت تمایل متن تست یا شماره سوال را اینجا بنویسید…"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
            </div>

            {photoError && (
              <p className="text-rose-600 dark:text-rose-400 text-xs bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900">
                {photoError}
              </p>
            )}

            <button
              type="submit"
              disabled={isPhotoLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isPhotoLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>در حال استخراج و تحلیل خط‌به‌خط کتاب درسی…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>حل تشریحی و تحلیل دام تستی (۱۰۰٪ مطابق کتاب)</span>
                </>
              )}
            </button>
          </form>

          {/* Photo Solve Output Cards */}
          {photoResult && (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#071324] border border-blue-200 dark:border-blue-900/60 space-y-4 animate-in fade-in shadow-xs text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="font-extrabold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>مرجع رسمی کتاب درسی: {photoResult.book_reference}</span>
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black">
                  گزینه صحیح: {photoResult.correct_option}
                </span>
              </div>

              {photoResult.transcribed_question && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 font-medium">
                  <span className="text-[10px] text-slate-400 block mb-1">متن استخراج‌شده سوال:</span>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {photoResult.transcribed_question}
                  </p>
                </div>
              )}

              <div>
                <h4 className="font-black text-slate-900 dark:text-white mb-1.5">
                  پاسخ تشریحی و استناد به خط کتاب:
                </h4>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-blue-50/40 dark:bg-blue-950/20 p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/40">
                  {photoResult.detailed_explanation}
                </p>
              </div>

              {photoResult.rejected_options && photoResult.rejected_options.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-black text-rose-700 dark:text-rose-400">
                    علت رد سایر گزینه‌ها (تله‌های طراح):
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {photoResult.rejected_options.map((rej, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                        <b className="text-rose-900 dark:text-rose-300 block mb-0.5">{rej.option}:</b>
                        <span className="text-slate-700 dark:text-slate-300">{rej.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {photoResult.traps_and_pitfalls && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <b className="block mb-0.5">دام تستی طراح کنکور:</b>
                    <span>{photoResult.traps_and_pitfalls}</span>
                  </div>
                </div>
              )}

              {photoResult.study_tip && (
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-blue-900 dark:text-blue-200 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                  <div>
                    <b className="block mb-0.5">توصیه مرور سریع:</b>
                    <span>{photoResult.study_tip}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Slide Deck Generator (With Chapters and Goftar Selection) */}
      {activeTab === 'slides' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Presentation className="w-4 h-4 text-blue-600" />
              <span>اسلایدساز آموزشی منطبق بر کتاب‌های درسی رسمی کنکور</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              اسلایدهای تدریس و خلاصه‌برداری را با تفکیک دقیق فصل و گفتارهای مصوب کنکور سراسری بسازید.
            </p>
          </div>

          <form onSubmit={handleSlidesSubmit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  درس
                </label>
                <select
                  value={slidesSubj}
                  onChange={(e) => {
                    setSlidesSubj(e.target.value);
                    setSlidesChapter('');
                    setSlidesGoftar('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
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

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  فصل کتاب درسی
                </label>
                <select
                  value={slidesChapter}
                  onChange={(e) => {
                    setSlidesChapter(e.target.value);
                    setSlidesGoftar('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
                >
                  <option value="">— انتخاب فصل کتاب درسی —</option>
                  {(SUBJECT_CHAPTERS[slidesSubj] || []).map((ch, idx) => (
                    <option key={idx} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  تعداد اسلایدها (۳ تا ۱۵)
                </label>
                <input
                  type="number"
                  min="3"
                  max="15"
                  value={slidesCount}
                  onChange={(e) => setSlidesCount(Number(e.target.value) || 6)}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-center"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Biology Goftar Dropdown */}
            {slidesSubj === 'bio' && (
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
                <label className="block font-bold text-blue-800 dark:text-blue-300 mb-1">
                  گفتار اختصاصی زیست‌شناسی (دهم / یازدهم / دوازدهم):
                </label>
                <select
                  value={slidesGoftar}
                  onChange={(e) => setSlidesGoftar(e.target.value)}
                  disabled={!slidesChapter}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium disabled:opacity-50"
                >
                  <option value="">— انتخاب گفتار فصل کتاب زیست —</option>
                  {getGoftarsForChapter(slidesChapter).map((g, idx) => (
                    <option key={idx} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                موضوع دقیق اسلایدها یا تیپ تستی خاص (اختیاری)
              </label>
              <input
                type="text"
                value={slidesCustom}
                onChange={(e) => setSlidesCustom(e.target.value)}
                placeholder="مثلاً: جمع‌بندی نکات کنکوری و قیدهای کتاب درسی"
                className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
            </div>

            {slidesError && (
              <p className="text-blue-700 dark:text-blue-300 text-xs bg-blue-50 dark:bg-blue-950/50 p-2.5 rounded-xl border border-blue-200">
                {slidesError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSlidesLoading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isSlidesLoading ? 'در حال تدوین اسلایدهای مصوب کتاب…' : 'ساخت اسلایدهای آموزشی کتاب درسی'}
            </button>
          </form>

          {slidesResult && (
            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {slidesResult.deck_title}
                </h3>
                <button
                  onClick={handleDownloadSlidesHtml}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود فایل HTML</span>
                </button>
              </div>

              <div className="space-y-3">
                {slidesResult.slides.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-[#071324] text-xs space-y-2"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span>{s.title}</span>
                    </div>

                    <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 pr-2 leading-relaxed">
                      {s.bullets.map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>

                    {s.image_prompt && (
                      <p className="text-[11px] text-slate-400 pr-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                        نمودار پیشنهادی: {s.image_prompt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Cognitive Mistake Analyzer */}
      {activeTab === 'mistakes' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              تحلیل شناختی و عمیق دفترچه غلط
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              هوش مصنوعی تست‌های غلط‌خورده شما را ریشه‌یابی کرده و تله‌های شناختی و راهکار رفع آن‌ها را ارائه می‌دهد.
            </p>
          </div>

          <button
            onClick={handleAnalyzeMistakes}
            disabled={isMistakesLoading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-xs cursor-pointer"
          >
            {isMistakesLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>در حال تحلیل شناختی اشتباهات…</span>
              </>
            ) : (
              <>
                <BrainCircuit className="w-4 h-4" />
                <span>اجرای تحلیل عمیق اشتباهات</span>
              </>
            )}
          </button>

          {mistakesError && (
            <p className="text-blue-700 dark:text-blue-300 text-xs bg-blue-50 dark:bg-blue-950/50 p-2.5 rounded-xl border border-blue-200">
              {mistakesError}
            </p>
          )}

          {mistakesResult && (
            <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs leading-relaxed animate-in fade-in">
              {/* Categories */}
              {mistakesResult.categories?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-1.5">
                  <span className="font-bold text-blue-900 dark:text-blue-300 block">
                    مباحث بحرانی و آسیب‌پذیر شما:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {mistakesResult.categories.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Patterns */}
              {mistakesResult.patterns?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 space-y-1.5">
                  <span className="font-bold text-sky-900 dark:text-sky-300 block">
                    الگوهای تکراری بی‌دقتی یا تله تستی:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {mistakesResult.patterns.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              {mistakesResult.actions?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 space-y-1.5">
                  <span className="font-bold text-indigo-900 dark:text-indigo-200 block">
                    راهکارهای عملی برای افزایش درصد:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {mistakesResult.actions.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Honest */}
              {mistakesResult.honest && (
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
                  <b className="text-blue-900 dark:text-blue-300 block mb-1">
                    نتیجه‌گیری و پیام مشاور:
                  </b>
                  <p className="text-slate-700 dark:text-slate-300">
                    {mistakesResult.honest}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Study Resources & PDF Uploads */}
      {activeTab === 'resources' && (
        <div className="rounded-2xl bg-white dark:bg-[#0a1628] border border-blue-100 dark:border-blue-900/50 p-5 shadow-xs space-y-5 animate-in fade-in">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>کتابخانه منابع درسی و جزوات اختصاصی شما</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              فایل‌های PDF کتاب‌های درسی رسمی، جزوات اساتید یا فصول مورد نظرتان را آپلود کنید تا هوش مصنوعی پاسخ‌ها، تحلیل تست‌ها و مشاوره‌هایش را <b>منحصراً به متن همین منابع</b> مقید کند و از افزودن مطالب خارج از کتاب خودداری نماید.
            </p>
          </div>

          {/* Upload Area */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>

            <div>
              <label className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md cursor-pointer transition-colors">
                <span>انتخاب و آپلود فایل PDF یا جزوه کتاب درسی</span>
                <input
                  type="file"
                  accept="application/pdf,text/plain"
                  className="hidden"
                  onChange={handleResourceUpload}
                  disabled={isResourceUploading}
                />
              </label>
              <p className="text-[11px] text-slate-400 mt-2">
                پشتیبانی از فایل‌های PDF کتب درسی دهم، یازدهم، دوازدهم و جزوات متنی (حداکثر ۲۰ مگابایت)
              </p>
            </div>

            {isResourceUploading && (
              <div className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-bold animate-pulse pt-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>در حال پردازش و استخراج هوشمند متن صفحات کتاب درسی…</span>
              </div>
            )}

            {resourceError && (
              <p className="text-xs text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200">
                {resourceError}
              </p>
            )}
          </div>

          {/* Resources List */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>لیست منابع آپلود شده ({resources.length} منبع)</span>
              {activeResourceId && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                  یک منبع به عنوان مرجع فعال تنظیم شده است
                </span>
              )}
            </h4>

            {resources.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                هنوز هیچ منبعی آپلود نکرده‌اید. با آپلود اولین PDF، هوش مصنوعی دقیقاً بر اساس آن به شما درس خواهد داد.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {resources.map((res) => {
                  const isActive = activeResourceId === res.id;

                  return (
                    <div
                      key={res.id}
                      className={`p-4 rounded-2xl border transition-all text-xs space-y-3 ${
                        isActive
                          ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${isActive ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700' : 'bg-blue-100 dark:bg-blue-950 text-blue-700'}`}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 dark:text-white">
                                {res.name}
                              </span>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200 font-extrabold text-[10px]">
                                  منبع استنادی فعال
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 mt-0.5 block">
                              فایل: {res.file_name} • حجم: {Math.round(res.file_size / 1024)} کیلوبایت
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveResourceId(isActive ? null : res.id)}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer text-xs ${
                              isActive
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isActive ? 'منبع فعال است ✓' : 'انتخاب به عنوان منبع فعال'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteResource(res.id)}
                            className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="حذف منبع"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Excerpt */}
                      {res.extracted_text && (
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed max-h-24 overflow-y-auto">
                          <b className="block text-[10px] text-slate-400 mb-1">بخشی از متن استخراج شده:</b>
                          {res.extracted_text.slice(0, 300)}...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Camera & Rotation Modal */}
      <LiveCameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(dataUrl) => {
          setPhotoImage(dataUrl);
          setPhotoRotation(0);
        }}
      />
    </div>
  );
};
