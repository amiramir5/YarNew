import React, { useState, useEffect, useRef } from 'react';
import {
  AppSettings,
  Exam,
  MistakeCard,
  ProgressEntry,
  QuickNote,
  QuizQuestion,
  Session,
  DailyPlan,
  ViewId,
} from './types';
import {
  loadSessions,
  saveSessions,
  loadExams,
  saveExams,
  loadMistakes,
  saveMistakes,
  loadPlans,
  savePlans,
  loadNotes,
  saveNotes,
  loadProgress,
  saveProgress,
  loadSettings,
  saveSettings,
  loadChecklist,
  saveChecklist,
  loadTimerState,
  saveTimerState,
  exportAllDataJson,
  getActiveUserEmail,
  uid,
} from './lib/storage';
import {
  computeStreak,
  studyDayKey,
  addDays,
} from './lib/jalali';
import { LEITNER_DAYS } from './lib/constants';
import { playSound, triggerHaptic } from './lib/audio';
import {
  pushSessionToCloud,
  pushExamToCloud,
  pushMistakeToCloud,
  fetchCloudData,
} from './lib/cloudSync';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { CommandPalette } from './components/CommandPalette';
import { InstallPwaBanner } from './components/common/InstallPwaBanner';
import { AuthModal } from './components/common/AuthModal';

// Views
import { HomeView } from './components/views/HomeView';
import { TimerView } from './components/views/TimerView';
import { ExamsView } from './components/views/ExamsView';
import { MistakesView } from './components/views/MistakesView';
import { SimulatorView } from './components/views/SimulatorView';
import { PlanView } from './components/views/PlanView';
import { StatsView } from './components/views/StatsView';
import { MonthlyView } from './components/views/MonthlyView';
import { CoupleView } from './components/views/CoupleView';
import { AIView } from './components/views/AIView';
import { SettingsView } from './components/views/SettingsView';
import { DiagView } from './components/views/DiagView';

// Modals
import { TimeWheelModal } from './components/common/TimeWheelModal';
import { JalaliDatePickerModal } from './components/common/JalaliDatePickerModal';
import { ImageLightbox } from './components/common/ImageLightbox';
import { AIQuizModal } from './components/common/AIQuizModal';
import { ManualSessionModal } from './components/common/ManualSessionModal';
import { FinishSessionModal } from './components/common/FinishSessionModal';

export default function App() {
  // App Core State
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [exams, setExams] = useState<Exam[]>(() => loadExams());
  const [mistakes, setMistakes] = useState<MistakeCard[]>(() => loadMistakes());
  const [plans, setPlans] = useState<DailyPlan[]>(() => loadPlans());
  const [notes, setNotes] = useState<QuickNote[]>(() => loadNotes());
  const [progressList, setProgressList] = useState<ProgressEntry[]>(() => loadProgress());
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => loadChecklist());

  const [activeView, setActiveView] = useState<ViewId>('home');

  // Study Timer Core State (Resilient to tab switch, page reload, and lock screen)
  const [activeSubject, setActiveSubject] = useState<string>('bio');
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [accumulatedMs, setAccumulatedMs] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Modals state
  const [cmdOpen, setCmdOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [timeWheelOpen, setTimeWheelOpen] = useState(false);
  const [timeWheelCurrent, setTimeWheelCurrent] = useState('06:00');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'exam' | 'session'>('exam');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [manualSessionOpen, setManualSessionOpen] = useState(false);
  const [finishSessionOpen, setFinishSessionOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState('');
  const [activeGoftar, setActiveGoftar] = useState('');
  const [activeBook, setActiveBook] = useState('all');

  // AI Quiz Runner Modal state
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizSubject, setQuizSubject] = useState('bio');
  const [quizTopic, setQuizTopic] = useState('');

  // Sync theme to root html element and body
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [settings.theme]);

  // Restore saved timer state on mount
  useEffect(() => {
    const saved = loadTimerState();
    if (saved) {
      setActiveSubject(saved.subject || 'bio');
      setAccumulatedMs(saved.accumulated_ms || 0);

      if (saved.status === 'running' && saved.started_at) {
        setTimerStartedAt(saved.started_at);
        setIsTimerRunning(true);
        setIsTimerPaused(false);
        const diffSecs = Math.floor(
          ((saved.accumulated_ms || 0) + (Date.now() - saved.started_at)) / 1000
        );
        setElapsedSeconds(diffSecs);
      } else if (saved.status === 'paused') {
        setIsTimerRunning(false);
        setIsTimerPaused(true);
        setElapsedSeconds(Math.floor((saved.accumulated_ms || 0) / 1000));
      }
    }
  }, []);

  // Initial Cloud Sync (merge remote Supabase records with local)
  useEffect(() => {
    fetchCloudData().then((remote) => {
      if (!remote) return;
      if (remote.sessions && remote.sessions.length > 0) {
        setSessions((prev) => {
          const prevMap = new Map(prev.map((s) => [s.id, s]));
          remote.sessions?.forEach((s) => prevMap.set(s.id, s));
          const merged = Array.from(prevMap.values()).sort((a, b) => b.created_at - a.created_at);
          saveSessions(merged);
          return merged;
        });
      }
      if (remote.exams && remote.exams.length > 0) {
        setExams((prev) => {
          const prevMap = new Map(prev.map((e) => [e.id, e]));
          remote.exams?.forEach((e) => prevMap.set(e.id, e));
          const merged = Array.from(prevMap.values()).sort((a, b) => b.created_at - a.created_at);
          saveExams(merged);
          return merged;
        });
      }
      if (remote.mistakes && remote.mistakes.length > 0) {
        setMistakes((prev) => {
          const prevMap = new Map(prev.map((m) => [m.id, m]));
          remote.mistakes?.forEach((m) => prevMap.set(m.id, m));
          const merged = Array.from(prevMap.values()).sort((a, b) => b.created_at - a.created_at);
          saveMistakes(merged);
          return merged;
        });
      }
    });
  }, []);

  // Timer Tick Interval
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerStartedAt) {
      interval = setInterval(() => {
        const totalMs = accumulatedMs + (Date.now() - timerStartedAt);
        setElapsedSeconds(Math.floor(totalMs / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerStartedAt, accumulatedMs]);

  // Persist timer state to storage whenever it changes
  useEffect(() => {
    const currentStatus = isTimerRunning ? 'running' : isTimerPaused ? 'paused' : 'idle';
    if (currentStatus === 'idle') {
      saveTimerState(null);
    } else {
      saveTimerState({
        subject: activeSubject,
        status: currentStatus,
        started_at: timerStartedAt,
        accumulated_ms: accumulatedMs,
        day: studyDayKey(),
      });
    }
  }, [isTimerRunning, isTimerPaused, timerStartedAt, accumulatedMs, activeSubject]);

  // Timer control handlers
  const handleStartTimer = () => {
    const now = Date.now();
    setTimerStartedAt(now);
    setIsTimerRunning(true);
    setIsTimerPaused(false);
  };

  const handlePauseTimer = () => {
    if (!timerStartedAt) return;
    const additional = Date.now() - timerStartedAt;
    const newAccum = accumulatedMs + additional;
    setAccumulatedMs(newAccum);
    setTimerStartedAt(null);
    setIsTimerRunning(false);
    setIsTimerPaused(true);
    setElapsedSeconds(Math.floor(newAccum / 1000));
  };

  const handleResumeTimer = () => {
    setTimerStartedAt(Date.now());
    setIsTimerRunning(true);
    setIsTimerPaused(false);
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setIsTimerPaused(false);
    setTimerStartedAt(null);
    setAccumulatedMs(0);
    setElapsedSeconds(0);
    saveTimerState(null);
  };

  const handleFinishTimer = () => {
    if (elapsedSeconds < 5) {
      handleResetTimer();
      return;
    }
    // Pause timer while modal is open so time doesn't jump
    if (isTimerRunning) {
      handlePauseTimer();
    }
    setFinishSessionOpen(true);
  };

  const handleSaveFinishedSession = (newSession: Session) => {
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    pushSessionToCloud(newSession);

    setActiveChapter('');
    setActiveGoftar('');
    handleResetTimer();
    setFinishSessionOpen(false);
    setActiveView('home');
  };

  // Data Actions
  const handleAddSession = (session: Session) => {
    const updated = [session, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    pushSessionToCloud(session);
  };

  const handleAddExam = (exam: Exam) => {
    const updated = [exam, ...exams];
    setExams(updated);
    saveExams(updated);
    pushExamToCloud(exam);
  };

  const handleDeleteExam = (id: string) => {
    const updated = exams.map((e) => (e.id === id ? { ...e, deleted_at: Date.now() } : e));
    setExams(updated);
    saveExams(updated);
  };

  const handleAddMistake = (card: MistakeCard) => {
    const updated = [card, ...mistakes];
    setMistakes(updated);
    saveMistakes(updated);
    pushMistakeToCloud(card);
  };

  const handleReviewResult = (cardId: string, remembered: boolean) => {
    const today = studyDayKey();
    const updated = mistakes.map((card) => {
      if (card.id !== cardId) return card;
      const curBox = card.box || 1;
      const nextBox = remembered ? Math.min(5, curBox + 1) : 1;
      const intervalDays = LEITNER_DAYS[nextBox - 1];
      const nextReview = addDays(today, intervalDays);

      const history = card.history || [];
      return {
        ...card,
        box: nextBox,
        next_review: nextReview,
        updated_at: Date.now(),
        history: [
          ...history,
          { ts: Date.now(), right: remembered, box: nextBox, interval: intervalDays },
        ],
      };
    });

    setMistakes(updated);
    saveMistakes(updated);
  };

  const handleDeleteMistake = (cardId: string) => {
    const updated = mistakes.map((m) =>
      m.id === cardId ? { ...m, deleted_at: Date.now() } : m
    );
    setMistakes(updated);
    saveMistakes(updated);
  };

  const handleSavePlan = (plan: DailyPlan) => {
    const idx = plans.findIndex((p) => p.id === plan.id);
    let updated: DailyPlan[];
    if (idx >= 0) {
      updated = [...plans];
      updated[idx] = plan;
    } else {
      updated = [plan, ...plans];
    }
    setPlans(updated);
    savePlans(updated);
  };

  const handleAddProgress = (entry: ProgressEntry) => {
    const updated = [entry, ...progressList];
    setProgressList(updated);
    saveProgress(updated);
  };

  const handleDeleteProgress = (id: string) => {
    const updated = progressList.map((p) => (p.id === id ? { ...p, deleted_at: Date.now() } : p));
    setProgressList(updated);
    saveProgress(updated);
  };

  const handleAddNote = (note: QuickNote) => {
    const updated = [note, ...notes];
    setNotes(updated);
    saveNotes(updated);
  };

  const handleDeleteNote = (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, deleted_at: Date.now() } : n));
    setNotes(updated);
    saveNotes(updated);
  };

  const handleToggleChecklistItem = (key: string) => {
    const updated = { ...checklist, [key]: !checklist[key] };
    setChecklist(updated);
    saveChecklist(updated);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleWipeCategory = (cat: 'sessions' | 'exams' | 'mistakes' | 'plans') => {
    const now = Date.now();
    if (cat === 'sessions') {
      const updated = sessions.map((s) => ({ ...s, deleted_at: now }));
      setSessions(updated);
      saveSessions(updated);
    } else if (cat === 'exams') {
      const updated = exams.map((e) => ({ ...e, deleted_at: now }));
      setExams(updated);
      saveExams(updated);
    } else if (cat === 'mistakes') {
      const updated = mistakes.map((m) => ({ ...m, deleted_at: now }));
      setMistakes(updated);
      saveMistakes(updated);
    } else if (cat === 'plans') {
      const updated = plans.map((p) => ({ ...p, deleted_at: now }));
      setPlans(updated);
      savePlans(updated);
    }
  };

  const handleRefreshData = (targetEmail?: string) => {
    const email = targetEmail || getActiveUserEmail();
    setSessions(loadSessions(email));
    setExams(loadExams(email));
    setMistakes(loadMistakes(email));
    setPlans(loadPlans(email));
    setNotes(loadNotes(email));
    setProgressList(loadProgress(email));
    setChecklist(loadChecklist());
    setSettings(loadSettings());

    // Also pull latest records from Supabase for this account
    if (email) {
      fetchCloudData(email).then((remote) => {
        if (!remote) return;
        if (remote.sessions && remote.sessions.length > 0) {
          setSessions(remote.sessions);
          saveSessions(remote.sessions, email);
        }
        if (remote.exams && remote.exams.length > 0) {
          setExams(remote.exams);
          saveExams(remote.exams, email);
        }
        if (remote.mistakes && remote.mistakes.length > 0) {
          setMistakes(remote.mistakes);
          saveMistakes(remote.mistakes, email);
        }
        if (remote.plans && remote.plans.length > 0) {
          setPlans(remote.plans);
          savePlans(remote.plans, email);
        }
      });
    }
  };

  // Launch AI Quiz Runner
  const handleLaunchQuizModal = (questions: QuizQuestion[], subj: string, topic: string) => {
    setQuizQuestions(questions);
    setQuizSubject(subj);
    setQuizTopic(topic);
    setQuizModalOpen(true);
  };

  const handleSaveQuizResult = (session: Session, exam: Exam) => {
    handleAddSession(session);
    handleAddExam(exam);
  };

  // Streak calculation
  const streak = computeStreak(sessions);
  const dueMistakesCount = mistakes.filter(
    (m) => !m.deleted_at && m.next_review <= studyDayKey()
  ).length;

  const todayPlan = plans.find((p) => !p.deleted_at && p.day === studyDayKey());
  const dueTasksCount = todayPlan ? todayPlan.items.filter((it) => !it.done).length : 0;

  const isDark = settings.theme === 'dark';

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        isDark
          ? 'dark bg-[#0B132B] text-slate-100'
          : 'bg-white text-slate-900'
      }`}
    >
      {/* Top Header */}
      <Header
        settings={settings}
        streak={streak}
        activeView={activeView}
        onNavigate={setActiveView}
        onToggleTheme={() =>
          handleUpdateSettings({
            ...settings,
            theme: settings.theme === 'dark' ? 'light' : 'dark',
          })
        }
        onToggleSound={() =>
          handleUpdateSettings({
            ...settings,
            soundEnabled: !settings.soundEnabled,
          })
        }
        onOpenCommandPalette={() => setCmdOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* PWA Direct Installation Banner for Mobile & Chrome */}
      <InstallPwaBanner />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          dueMistakesCount={dueMistakesCount}
          dueTasksCount={dueTasksCount}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-5xl">
          {activeView === 'home' && (
            <HomeView
              sessions={sessions}
              exams={exams}
              mistakes={mistakes}
              settings={settings}
              streak={streak}
              liveTimerSeconds={elapsedSeconds}
              isTimerRunning={isTimerRunning}
              activeTimerSubject={activeSubject}
              onNavigate={setActiveView}
              onOpenQuickSessionModal={() => setManualSessionOpen(true)}
              onEditExamDate={() => {
                setDatePickerTarget('exam');
                setDatePickerOpen(true);
              }}
            />
          )}

          {activeView === 'timer' && (
            <TimerView
              elapsedSeconds={elapsedSeconds}
              isRunning={isTimerRunning}
              isPaused={isTimerPaused}
              activeSubject={activeSubject}
              activeBook={activeBook}
              activeChapter={activeChapter}
              activeGoftar={activeGoftar}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.vibrationEnabled}
              theme={settings.theme}
              sessions={sessions}
              onSelectSubject={setActiveSubject}
              onSelectBook={setActiveBook}
              onSelectChapter={setActiveChapter}
              onSelectGoftar={setActiveGoftar}
              onStart={handleStartTimer}
              onPause={handlePauseTimer}
              onResume={handleResumeTimer}
              onReset={handleResetTimer}
              onFinish={handleFinishTimer}
              onOpenManualModal={() => setManualSessionOpen(true)}
            />
          )}

          {activeView === 'exams' && (
            <ExamsView
              exams={exams}
              onAddExam={handleAddExam}
              onDeleteExam={handleDeleteExam}
              onLaunchQuizModal={handleLaunchQuizModal}
            />
          )}

          {activeView === 'mistakes' && (
            <MistakesView
              mistakes={mistakes}
              checklist={checklist}
              onAddMistake={handleAddMistake}
              onReviewResult={handleReviewResult}
              onDeleteMistake={handleDeleteMistake}
              onToggleChecklistItem={handleToggleChecklistItem}
              onOpenLightbox={setLightboxSrc}
            />
          )}

          {activeView === 'sim' && (
            <SimulatorView
              onSaveExam={(exam, session) => {
                handleAddExam(exam);
                handleAddSession(session);
              }}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.vibrationEnabled}
            />
          )}

          {activeView === 'plan' && (
            <PlanView
              plans={plans}
              progressList={progressList}
              notes={notes}
              sessions={sessions}
              onSavePlan={handleSavePlan}
              onAddProgress={handleAddProgress}
              onDeleteProgress={handleDeleteProgress}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onOpenTimeWheelModal={(cur) => {
                setTimeWheelCurrent(cur || '06:00');
                setTimeWheelOpen(true);
              }}
              onAiSuggestPlan={() => setActiveView('ai')}
            />
          )}

          {activeView === 'stats' && (
            <StatsView sessions={sessions} exams={exams} streak={streak} />
          )}

          {activeView === 'monthly' && (
            <MonthlyView sessions={sessions} exams={exams} />
          )}

          {activeView === 'couple' && (
            <CoupleView
              sessions={sessions}
              liveTimerSeconds={elapsedSeconds}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              activeTimerSubject={activeSubject}
              isTimerRunning={isTimerRunning}
            />
          )}

          {activeView === 'ai' && (
            <AIView
              sessions={sessions}
              mistakes={mistakes}
              progressList={progressList}
              soundEnabled={settings.soundEnabled}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              settings={settings}
              sessions={sessions}
              exams={exams}
              mistakes={mistakes}
              onUpdateSettings={handleUpdateSettings}
              onDataImported={handleRefreshData}
              onWipeCategory={handleWipeCategory}
              onOpenDatePicker={() => {
                setDatePickerTarget('exam');
                setDatePickerOpen(true);
              }}
            />
          )}

          {activeView === 'diag' && (
            <DiagView
              settings={settings}
              sessions={sessions}
              exams={exams}
              mistakes={mistakes}
              onRefresh={handleRefreshData}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Bar */}
      <BottomNav
        activeView={activeView}
        onNavigate={setActiveView}
        dueMistakesCount={dueMistakesCount}
      />

      {/* Modals */}
      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={(view) => {
          setActiveView(view);
          setCmdOpen(false);
        }}
        onToggleTheme={() =>
          handleUpdateSettings({
            ...settings,
            theme: settings.theme === 'dark' ? 'light' : 'dark',
          })
        }
        onToggleSound={() =>
          handleUpdateSettings({
            ...settings,
            soundEnabled: !settings.soundEnabled,
          })
        }
        onExport={exportAllDataJson}
      />

      <TimeWheelModal
        isOpen={timeWheelOpen}
        initialTime={timeWheelCurrent}
        onClose={() => setTimeWheelOpen(false)}
        onSave={(timeStr) => {
          const today = studyDayKey();
          const plan = todayPlan || {
            id: uid(),
            day: today,
            wake_time: '06:00',
            items: [],
            created_at: Date.now(),
            updated_at: Date.now(),
            device_id: 'client',
            deleted_at: null,
          };
          handleSavePlan({
            ...plan,
            wake_time: timeStr,
            updated_at: Date.now(),
          });
        }}
      />

      <JalaliDatePickerModal
        isOpen={datePickerOpen}
        initialIso={settings.examDate}
        onClose={() => setDatePickerOpen(false)}
        onSelect={(iso) => {
          if (datePickerTarget === 'exam') {
            handleUpdateSettings({
              ...settings,
              examDate: iso,
            });
          }
        }}
        title={datePickerTarget === 'exam' ? 'تعیین تاریخ کنکور سراسری' : 'انتخاب تاریخ'}
      />

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <AIQuizModal
        isOpen={quizModalOpen}
        onClose={() => setQuizModalOpen(false)}
        questions={quizQuestions}
        subject={quizSubject}
        topicTitle={quizTopic}
        soundEnabled={settings.soundEnabled}
        onSaveResult={handleSaveQuizResult}
      />

      <ManualSessionModal
        isOpen={manualSessionOpen}
        onClose={() => setManualSessionOpen(false)}
        onSave={handleAddSession}
        defaultSubject={activeSubject}
      />

      <FinishSessionModal
        isOpen={finishSessionOpen}
        onClose={() => setFinishSessionOpen(false)}
        onSave={handleSaveFinishedSession}
        elapsedSeconds={elapsedSeconds}
        initialSubject={activeSubject}
        initialBook={activeBook}
        initialChapter={activeChapter}
        initialGoftar={activeGoftar}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={() => {
          handleRefreshData();
        }}
      />
    </div>
  );
}
