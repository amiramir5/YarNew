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
  runNightlyAutoBackup,
  buildBackupPayload,
} from './lib/storage';
import {
  computeStreak,
  studyDayKey,
  addDays,
} from './lib/jalali';
import { LEITNER_DAYS, getSubject } from './lib/constants';
import { playSound, triggerHaptic } from './lib/audio';
import {
  pushSessionToCloud,
  pushExamToCloud,
  pushMistakeToCloud,
  pushPlanToCloud,
  pushNoteToCloud,
  pushProgressToCloud,
  pushChecklistToCloud,
  fetchCloudData,
  fetchCloudSettings,
  mergeWithLastWriteWins,
  flushOutboxQueue,
  syncAllLocalDataToCloud,
  pushAutoBackupToCloud,
} from './lib/cloudSync';
import {
  broadcastMyState,
  fetchRemotePartnerState,
  subscribeToPartnerRealtime,
  getStoredPartnerState,
  savePartnerState,
  CoupleMemberState,
} from './lib/coupleSync';
import { requestAppWakeLock, releaseAppWakeLock } from './lib/wakeLock';
import {
  checkAuthUrl,
  isPasswordRecoveryRequested,
  consumePasswordRecoveryRequested,
} from './lib/auth';

import { getSupabaseClient } from './lib/supabase';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { CommandPalette } from './components/CommandPalette';
import { AuthModal } from './components/common/AuthModal';
import { ProactiveFloatingWidget } from './components/common/ProactiveFloatingWidget';

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

  const [activeView, setActiveView] = useState<ViewId>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'leitner') return 'mistakes';
      if (tab === 'daily') return 'plan';
      if (tab === 'weekly') return 'stats';
      const validTabs: ViewId[] = [
        'home',
        'timer',
        'exams',
        'mistakes',
        'sim',
        'plan',
        'stats',
        'monthly',
        'ai',
        'couple',
        'settings',
        'diag',
      ];
      if (tab && validTabs.includes(tab as ViewId)) {
        return tab as ViewId;
      }
    }
    return 'home';
  });

  // Keep URL query parameter synchronized with active view (supports PWA shortcuts and browser history)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (activeView === 'home') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', activeView);
    }
    window.history.replaceState({}, '', url.toString());

    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search);
      const currentTab = p.get('tab') as ViewId;
      if (currentTab) setActiveView(currentTab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeView]);

  // Study Timer Core State (Resilient to tab switch, page reload, and lock screen)
  const [activeSubject, setActiveSubject] = useState<string>('bio');
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [accumulatedMs, setAccumulatedMs] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [timerDay, setTimerDay] = useState<string>(() => studyDayKey());

  // Global Partner Live State & Realtime
  const [partnerLiveState, setPartnerLiveState] = useState<CoupleMemberState>(() => getStoredPartnerState());

  // Modals state
  const [cmdOpen, setCmdOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | 'reset' | 'update_password'>('signin');
  const [authInitialError, setAuthInitialError] = useState('');
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

  // Handle Supabase password recovery events & URL auth parameters reliably
  useEffect(() => {
    const handlePasswordRecovery = () => {
      setAuthModalMode('update_password');
      setAuthInitialError('');
      setAuthModalOpen(true);
    };

    window.addEventListener('ky_password_recovery_requested', handlePasswordRecovery);

    // Initial check on mount: captures recovery event fired before listener mount or recovery/error tokens in URL
    const authUrlStatus = checkAuthUrl();
    if (authUrlStatus.isRecovery || isPasswordRecoveryRequested()) {
      consumePasswordRecoveryRequested();
      setAuthModalMode('update_password');
      if (authUrlStatus.error) {
        setAuthInitialError(authUrlStatus.error);
      }
      setAuthModalOpen(true);
    } else if (authUrlStatus.error) {
      setAuthModalMode('signin');
      setAuthInitialError(authUrlStatus.error);
      setAuthModalOpen(true);
    }

    return () => {
      window.removeEventListener('ky_password_recovery_requested', handlePasswordRecovery);
    };
  }, []);

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
      if (saved.day) {
        setTimerDay(saved.day);
      }

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

  // Refs for resilient background & realtime sync
  const isTimerRunningRef = useRef(isTimerRunning);
  const elapsedSecondsRef = useRef(elapsedSeconds);
  const activeSubjectRef = useRef(activeSubject);
  const sessionsRef = useRef(sessions);
  const timerStartedAtRef = useRef(timerStartedAt);
  const accumulatedMsRef = useRef(accumulatedMs);

  // Critical fix: heartbeats read these refs — they were NEVER synced to live state,
  // so the partner always received todaySeconds: 0 and a frozen session from launch time.
  useEffect(() => {
    isTimerRunningRef.current = isTimerRunning;
    elapsedSecondsRef.current = elapsedSeconds;
    activeSubjectRef.current = activeSubject;
    sessionsRef.current = sessions;
    timerStartedAtRef.current = timerStartedAt;
    accumulatedMsRef.current = accumulatedMs;
  }, [isTimerRunning, elapsedSeconds, activeSubject, sessions, timerStartedAt, accumulatedMs]);

  const requestWakeLock = async () => {
    await requestAppWakeLock();
  };

  const releaseWakeLock = () => {
    releaseAppWakeLock();
  };

  // Initial Cloud Sync — robust against restored auth session arriving after mount.
  // The old version ran once with no account loaded and silently skipped the pull forever.
  const initialSyncRanRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const tryInitialSync = () => {
      if (cancelled || initialSyncRanRef.current) return;
      const email = getActiveUserEmail();
      if (email) {
        initialSyncRanRef.current = true;
        handleRefreshData(email);
        flushOutboxQueue();
      } else if (++attempts <= 5) {
        // Auth session restore can take a moment — retry, then fall back to anonymous flow
        setTimeout(tryInitialSync, 1200);
      }
    };
    tryInitialSync();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nightly automatic backup: one rolling snapshot per study-day (localStorage,
  // 7-day window) + a cloud copy queued through the outbox so it survives
  // daylong outages. Runs on mount and re-checks hourly / on window focus.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const meta = runNightlyAutoBackup();
        if (meta) {
          // Re-build the payload (keys stripped) and ship it via the outbox
          const payload = buildBackupPayload(true, false);
          if (payload) {
            await pushAutoBackupToCloud({
              id: `backup-${meta.day}`,
              data: payload,
              takenAt: meta.takenAt,
              deviceId: payload?.data?.settings?.deviceId,
            });
          }
        }
      } catch (err) {
        console.warn('[AutoBackup] failed:', err);
      } finally {
        busy = false;
      }
    };
    tick();
    const interval = window.setInterval(tick, 60 * 60 * 1000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Partner Live State Sync & Realtime Subscription
  useEffect(() => {
    let isMounted = true;

    // 1. Initial remote fetch from Supabase
    fetchRemotePartnerState().then((remote) => {
      if (remote && isMounted) {
        setPartnerLiveState(remote);
      }
    });

    // 2. Realtime channel subscription (broadcast & postgres changes)
    const unsubscribe = subscribeToPartnerRealtime((incoming) => {
      if (isMounted) {
        setPartnerLiveState(incoming);
      }
    });

    // 3. Fallback active polling every 20 seconds only when tab is visible
    const pollInterval = setInterval(() => {
      if (!isMounted || (typeof document !== 'undefined' && document.hidden)) return;
      fetchRemotePartnerState().then((remote) => {
        if (remote && isMounted) {
          setPartnerLiveState(remote);
        }
      });
    }, 20000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  // Smooth local second-by-second increment when partner is actively studying
  useEffect(() => {
    const tick = setInterval(() => {
      setPartnerLiveState((prev) => {
        if (!prev.isStudying) return prev;
        // Staleness guard: if we haven't received an authoritative heartbeat in over a
        // minute, stop extrapolating locally (stale data ticks were unknowingly counting forward).
        if (prev.lastHeartbeat && Date.now() - prev.lastHeartbeat > 60000) return prev;
        return {
          ...prev,
          sessionElapsedSeconds: prev.sessionElapsedSeconds + 1,
          todaySeconds: prev.todaySeconds + 1,
          lastHeartbeat: Date.now(),
        };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Background, Visibility & Lockscreen lifecycle handlers
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Immediate sync on returning from lock screen / background
        if (isTimerRunningRef.current && timerStartedAtRef.current) {
          const now = Date.now();
          const totalMs = accumulatedMsRef.current + (now - timerStartedAtRef.current);
          setElapsedSeconds(Math.floor(totalMs / 1000));
          requestWakeLock();
        }
        broadcastMyState({ online: true });
        fetchRemotePartnerState().then((remote) => {
          if (remote) setPartnerLiveState(remote);
        });
        flushOutboxQueue();
      } else {
        broadcastMyState({ online: false });
      }
    };

    const handlePageHide = () => {
      broadcastMyState({ online: false });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // Listen to profile switch (Amir <-> Armita) to reload user data seamlessly
  useEffect(() => {
    const handleProfileSwitch = () => {
      setSessions(loadSessions());
      setExams(loadExams());
      setMistakes(loadMistakes());
      setPlans(loadPlans());
      setNotes(loadNotes());
      setProgressList(loadProgress());
      setChecklist(loadChecklist());
      fetchRemotePartnerState().then((remote) => {
        if (remote) setPartnerLiveState(remote);
      });
    };

    window.addEventListener('konkoor_profile_switched', handleProfileSwitch);
    return () => window.removeEventListener('konkoor_profile_switched', handleProfileSwitch);
  }, []);

  // Helper to calculate current user's today study statistics
  const getTodayOwnStats = () => {
    const todayKey = studyDayKey();
    const todaySessions = (sessions || []).filter((s) => s && !s.deleted_at && s.day === todayKey);
    const completedSecs = todaySessions.reduce((acc, s) => acc + (s.seconds || 0), 0);
    const totalSecs = completedSecs + (isTimerRunning ? elapsedSeconds : 0);
    const totalTests = todaySessions.reduce(
      (acc, s) => acc + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0),
      0
    );
    return { totalSecs, totalTests };
  };

  // Timer Tick Interval
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerStartedAt) {
      requestWakeLock();
      interval = setInterval(() => {
        const totalMs = accumulatedMs + (Date.now() - timerStartedAt);
        setElapsedSeconds(Math.floor(totalMs / 1000));
      }, 1000);
    } else {
      releaseWakeLock();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerStartedAt, accumulatedMs]);

  // Periodic heartbeat broadcast to Supabase Realtime every 3.5 seconds while timer is active
  // Critical fix: depends ONLY on isTimerRunning, reads live values via refs so it NEVER gets reset every second!
  useEffect(() => {
    if (!isTimerRunning) return;

    const heartbeatTimer = setInterval(() => {
      const todayKey = studyDayKey();
      const todaySessions = (sessionsRef.current || []).filter((s) => s && !s.deleted_at && s.day === todayKey);
      const completedSecs = todaySessions.reduce((acc, s) => acc + (s.seconds || 0), 0);
      const totalSecs = completedSecs + elapsedSecondsRef.current;
      const totalTests = todaySessions.reduce(
        (acc, s) => acc + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0),
        0
      );

      broadcastMyState({
        isStudying: true,
        subject: activeSubjectRef.current,
        subjectName: getSubject(activeSubjectRef.current).name,
        timerStartedAt: timerStartedAtRef.current,
        accumulatedSeconds: Math.floor(accumulatedMsRef.current / 1000),
        sessionElapsedSeconds: elapsedSecondsRef.current,
        todaySeconds: totalSecs,
        todayTests: totalTests,
      });
    }, 3500);

    return () => clearInterval(heartbeatTimer);
  }, [isTimerRunning]);

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

  // Timer control handlers with immediate Supabase broadcast & DB milestone persistence
  const handleStartTimer = () => {
    if (isTimerRunning) return; // already running — don't restart clock
    const now = Date.now();
    const day = studyDayKey();
    setTimerDay(day);
    setTimerStartedAt(now);
    setIsTimerRunning(true);
    setIsTimerPaused(false);
    saveTimerState({
      subject: activeSubject,
      status: 'running',
      started_at: now,
      accumulated_ms: accumulatedMs,
      day,
    });

    const stats = getTodayOwnStats();
    broadcastMyState(
      {
        isStudying: true,
        subject: activeSubject,
        subjectName: getSubject(activeSubject).name,
        timerStartedAt: now,
        accumulatedSeconds: Math.floor(accumulatedMs / 1000),
        sessionElapsedSeconds: 0,
        todaySeconds: stats.totalSecs,
        todayTests: stats.totalTests,
      },
      { persistToDb: true }
    );
  };

  const handlePauseTimer = () => {
    if (!timerStartedAt) return;
    const additional = Date.now() - timerStartedAt;
    const newAccum = accumulatedMs + additional;
    const newElapsed = Math.floor(newAccum / 1000);
    setAccumulatedMs(newAccum);
    setTimerStartedAt(null);
    setIsTimerRunning(false);
    setIsTimerPaused(true);
    setElapsedSeconds(newElapsed);
    saveTimerState({
      subject: activeSubject,
      status: 'paused',
      started_at: null,
      accumulated_ms: newAccum,
      day: timerDay || studyDayKey(),
    });

    const stats = getTodayOwnStats();
    broadcastMyState(
      {
        isStudying: false,
        subject: activeSubject,
        subjectName: getSubject(activeSubject).name,
        timerStartedAt: null,
        accumulatedSeconds: newElapsed,
        sessionElapsedSeconds: newElapsed,
        todaySeconds: stats.totalSecs,
        todayTests: stats.totalTests,
      },
      { persistToDb: true }
    );
  };

  const handleResumeTimer = () => {
    if (isTimerRunning) return; // guard against double-tap resuming twice
    const now = Date.now();
    setTimerStartedAt(now);
    setIsTimerRunning(true);
    setIsTimerPaused(false);
    saveTimerState({
      subject: activeSubject,
      status: 'running',
      started_at: now,
      accumulated_ms: accumulatedMs,
      day: timerDay || studyDayKey(),
    });

    const stats = getTodayOwnStats();
    broadcastMyState(
      {
        isStudying: true,
        subject: activeSubject,
        subjectName: getSubject(activeSubject).name,
        timerStartedAt: now,
        accumulatedSeconds: Math.floor(accumulatedMs / 1000),
        sessionElapsedSeconds: elapsedSeconds,
        todaySeconds: stats.totalSecs,
        todayTests: stats.totalTests,
      },
      { persistToDb: true }
    );
  };

  const handleResetTimer = (skipStaleBroadcast = false) => {
    setIsTimerRunning(false);
    setIsTimerPaused(false);
    setTimerStartedAt(null);
    setAccumulatedMs(0);
    setElapsedSeconds(0);
    setTimerDay(studyDayKey());
    saveTimerState(null);
    // Save/finish flows broadcast the *correct* totals themselves; here only the plain reset broadcasts
    if (!skipStaleBroadcast) {
      const stats = getTodayOwnStats();
      broadcastMyState(
        {
          isStudying: false,
          subject: activeSubject,
          subjectName: getSubject(activeSubject).name,
          timerStartedAt: null,
          accumulatedSeconds: 0,
          sessionElapsedSeconds: 0,
          todaySeconds: stats.totalSecs,
          todayTests: stats.totalTests,
        },
        { persistToDb: true }
      );
    }
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

  const handleSaveFinishedSession = async (newSession: Session) => {
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    pushSessionToCloud(newSession);

    setActiveChapter('');
    setActiveGoftar('');
    // Skip reset's stale broadcast (its totals don't include the just-saved session);
    // a single ordered authoritative broadcast below closes the race that regressed partner totals.
    handleResetTimer(true);
    setFinishSessionOpen(false);
    setActiveView('home');

    // Broadcast new updated today totals after finishing session
    const todayKey = studyDayKey();
    const todayUpdated = updated.filter((s) => s && !s.deleted_at && s.day === todayKey);
    const newTotalSecs = todayUpdated.reduce((acc, s) => acc + (s.seconds || 0), 0);
    const newTotalTests = todayUpdated.reduce(
      (acc, s) => acc + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0),
      0
    );

    await broadcastMyState(
      {
        isStudying: false,
        subject: activeSubject,
        subjectName: getSubject(activeSubject).name,
        timerStartedAt: null,
        accumulatedSeconds: 0,
        sessionElapsedSeconds: 0,
        todaySeconds: newTotalSecs,
        todayTests: newTotalTests,
      },
      { persistToDb: true }
    );
  };

  // Data Actions
  const handleAddSession = (session: Session) => {
    const updated = [session, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    pushSessionToCloud(session);

    // Manual sessions also refresh the partner's "today" view
    const todayKey = studyDayKey();
    const todayUpdated = updated.filter((s) => s && !s.deleted_at && s.day === todayKey);
    broadcastMyState(
      {
        isStudying: false,
        subject: session.subject,
        todaySeconds: todayUpdated.reduce((acc, s) => acc + (s.seconds || 0), 0),
        todayTests: todayUpdated.reduce(
          (acc, s) => acc + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0),
          0
        ),
      },
      { persistToDb: true }
    );
  };

  const handleAddExam = (exam: Exam) => {
    const updated = [exam, ...exams];
    setExams(updated);
    saveExams(updated);
    pushExamToCloud(exam);
  };

  const handleDeleteExam = (id: string) => {
    const now = Date.now();
    const target = exams.find((e) => e.id === id);
    if (target) {
      pushExamToCloud({ ...target, deleted_at: now, updated_at: now });
    }
    const updated = exams.map((e) => (e.id === id ? { ...e, deleted_at: now, updated_at: now } : e));
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
    let updatedCard: MistakeCard | null = null;
    const updated = mistakes.map((card) => {
      if (card.id !== cardId) return card;
      const curBox = card.box || 1;
      const nextBox = remembered ? Math.min(5, curBox + 1) : 1;
      const intervalDays = LEITNER_DAYS[nextBox - 1];
      const nextReview = addDays(today, intervalDays);

      const history = card.history || [];
      updatedCard = {
        ...card,
        box: nextBox,
        next_review: nextReview,
        updated_at: Date.now(),
        history: [
          ...history,
          { ts: Date.now(), right: remembered, box: nextBox, interval: intervalDays },
        ],
      };
      return updatedCard;
    });

    setMistakes(updated);
    saveMistakes(updated);
    if (updatedCard) {
      pushMistakeToCloud(updatedCard);
    }
  };

  const handleDeleteMistake = (cardId: string) => {
    const now = Date.now();
    const target = mistakes.find((m) => m.id === cardId);
    if (target) {
      pushMistakeToCloud({ ...target, deleted_at: now, updated_at: now });
    }
    const updated = mistakes.map((m) =>
      m.id === cardId ? { ...m, deleted_at: now, updated_at: now } : m
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
    pushPlanToCloud(plan);
  };

  const handleAddProgress = (entry: ProgressEntry) => {
    const updated = [entry, ...progressList];
    setProgressList(updated);
    saveProgress(updated);
    pushProgressToCloud(entry);
  };

  const handleDeleteProgress = (id: string) => {
    const now = Date.now();
    const target = progressList.find((p) => p.id === id);
    if (target) {
      pushProgressToCloud({ ...target, deleted_at: now, updated_at: now } as any);
    }
    const updated = progressList.map((p) => (p.id === id ? { ...p, deleted_at: now, updated_at: now } : p));
    setProgressList(updated);
    saveProgress(updated);
  };

  const handleAddNote = (note: QuickNote) => {
    const updated = [note, ...notes];
    setNotes(updated);
    saveNotes(updated);
    pushNoteToCloud(note);
  };

  const handleDeleteNote = (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (target) {
      pushNoteToCloud({ ...target, deleted_at: Date.now(), updated_at: Date.now() } as any);
    }
    const updated = notes.map((n) => (n.id === id ? { ...n, deleted_at: Date.now(), updated_at: Date.now() } : n));
    setNotes(updated);
    saveNotes(updated);
  };

  const handleToggleChecklistItem = (key: string) => {
    const updated = { ...checklist, [key]: !checklist[key] };
    setChecklist(updated);
    saveChecklist(updated);
    pushChecklistToCloud(studyDayKey(), updated);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleWipeCategory = (cat: 'sessions' | 'exams' | 'mistakes' | 'plans') => {
    const now = Date.now();
    if (cat === 'sessions') {
      const updated = sessions.map((s) => ({ ...s, deleted_at: now, updated_at: now }));
      setSessions(updated);
      saveSessions(updated);
      updated.forEach((s) => pushSessionToCloud(s));
    } else if (cat === 'exams') {
      const updated = exams.map((e) => ({ ...e, deleted_at: now, updated_at: now }));
      setExams(updated);
      saveExams(updated);
      updated.forEach((e) => pushExamToCloud(e));
    } else if (cat === 'mistakes') {
      const updated = mistakes.map((m) => ({ ...m, deleted_at: now, updated_at: now }));
      setMistakes(updated);
      saveMistakes(updated);
      updated.forEach((m) => pushMistakeToCloud(m));
    } else if (cat === 'plans') {
      const updated = plans.map((p) => ({ ...p, deleted_at: now, updated_at: now }));
      setPlans(updated);
      savePlans(updated);
      updated.forEach((p) => pushPlanToCloud(p));
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
    setChecklist(loadChecklist(email));
    setSettings(loadSettings(email));

    // Pull and merge records from Supabase for this account with LWW (never overwrite local data)
    if (email) {
      fetchCloudData(email).then((remote) => {
        if (!remote) return;
        if (remote.sessions !== undefined) {
          setSessions((prev) => {
            const merged = mergeWithLastWriteWins(prev, remote.sessions || []);
            saveSessions(merged, email);
            return merged;
          });
        }
        if (remote.exams !== undefined) {
          setExams((prev) => {
            const merged = mergeWithLastWriteWins(prev, remote.exams || []);
            saveExams(merged, email);
            return merged;
          });
        }
        if (remote.mistakes !== undefined) {
          setMistakes((prev) => {
            const merged = mergeWithLastWriteWins(prev, remote.mistakes || []);
            saveMistakes(merged, email);
            return merged;
          });
        }
        if (remote.plans !== undefined) {
          setPlans((prev) => {
            const merged = mergeWithLastWriteWins(prev, remote.plans || []);
            savePlans(merged, email);
            return merged;
          });
        }
        if (remote.notes !== undefined) {
          setNotes((prev) => {
            const merged = mergeWithLastWriteWins(prev, remote.notes || []);
            saveNotes(merged, email);
            return merged;
          });
        }
        if (remote.progress !== undefined) {
          setProgressList((prev) => {
            const merged = mergeWithLastWriteWins(prev, remote.progress || []);
            saveProgress(merged, email);
            return merged;
          });
        }
        if (remote.checklist !== undefined && Object.keys(remote.checklist).length > 0) {
          setChecklist((prev) => {
            const merged = { ...prev, ...remote.checklist };
            saveChecklist(merged, email);
            return merged;
          });
        }
      });

      // Also pull and merge user settings from cloud
      fetchCloudSettings().then((cloudSettings) => {
        if (cloudSettings) {
          setSettings((cur) => {
            const merged: AppSettings = {
              ...cur,
              ...cloudSettings,
              ai: {
                ...cur.ai,
                ...cloudSettings.ai,
                geminiKey: cur.ai.geminiKey,
                openrouterKey: cur.ai.openrouterKey,
              },
            };
            saveSettings(merged, email);
            return merged;
          });
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
        onOpenAuth={() => {
          setAuthModalMode('signin');
          setAuthInitialError('');
          setAuthModalOpen(true);
        }}
      />

      {/* PWA install banner removed (2026-10-22): noisy for users who already installed */}


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
              plans={plans}
              settings={settings}
              streak={streak}
              liveTimerSeconds={elapsedSeconds}
              isTimerRunning={isTimerRunning}
              activeTimerSubject={activeSubject}
              partnerState={partnerLiveState}
              onNavigate={setActiveView}
              onOpenQuickSessionModal={() => setManualSessionOpen(true)}
              onEditExamDate={() => {
                setDatePickerTarget('exam');
                setDatePickerOpen(true);
              }}
              onSavePlan={handleSavePlan}
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
              mistakes={mistakes}
              plans={plans}
              exams={exams}
              settings={settings}
              partnerState={partnerLiveState}
              onNavigate={setActiveView}
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
              onSavePlan={handleSavePlan}
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
              settings={settings}
              plans={plans}
              onSavePlan={handleSavePlan}
              onUpdateSettings={handleUpdateSettings}
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

      {/* Omnipresent Proactive AI Counselor Widget */}
      {settings.ai.proactiveEnabled !== false && activeView !== 'ai' && (
        <ProactiveFloatingWidget
          sessions={sessions}
          mistakes={mistakes}
          settings={settings}
          isTimerRunning={isTimerRunning}
          activeSubject={activeSubject}
          onNavigate={setActiveView}
          onUpdateSettings={handleUpdateSettings}
          activeView={activeView}
        />
      )}

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
        initialDay={timerDay}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        initialErrorMessage={authInitialError}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthInitialError('');
        }}
        onLoginSuccess={async () => {
          handleRefreshData();
          try {
            const client = getSupabaseClient();
            if (client) {
              const { data } = await client.auth.getSession();
              const uid = data?.session?.user?.id;
              if (uid) {
                await syncAllLocalDataToCloud(uid);
                flushOutboxQueue();
              }
            }
          } catch {}
        }}
      />
    </div>
  );
}
