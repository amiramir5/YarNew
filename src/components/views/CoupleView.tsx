import React, { useState, useEffect } from 'react';
import {
  Heart,
  Clock,
  Trophy,
  Users,
  Settings,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Award,
  BookOpen,
  ArrowUpRight,
  TrendingUp,
  Database,
  Radio,
  Copy,
  LogOut,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Key,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { AppSettings, Session } from '../../types';
import { faNum, fmtHM, fmtPercent, getWeekDays, studyDayKey, jalaliMonthKey, jalaliPartsFromIso } from '../../lib/jalali';
import {
  CoupleMemberState,
  getCoupleSettings,
  saveCoupleSettings,
  getStoredPartnerState,
  savePartnerState,
  broadcastMyState,
  fetchRemotePartnerState,
  subscribeToPartnerRealtime,
  createPairRoom,
  joinPairRoom,
  leavePairRoom,
  fetchMyPairStatus,
  regenerateInviteCode,
  DEFAULT_PAIR_CODE,
} from '../../lib/coupleSync';
import { testSupabaseConnection } from '../../lib/supabase';
import { fetchPartnerSessions } from '../../lib/cloudSync';
import { getSubject } from '../../lib/constants';
import { Avatar3DBadge } from '../common/Avatar3DBadge';
import { CANONICAL_SUPABASE_SQL } from '../../lib/sqlSchema';
import { ConfirmModal } from '../common/ConfirmModal';

interface CoupleViewProps {
  sessions: Session[];
  liveTimerSeconds: number;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  activeTimerSubject?: string;
  isTimerRunning?: boolean;
}

export const CoupleView: React.FC<CoupleViewProps> = ({
  sessions,
  liveTimerSeconds,
  activeTimerSubject = 'bio',
  isTimerRunning = false,
}) => {
  const today = studyDayKey();
  const weekDays = getWeekDays(today);
  const coupleConfig = getCoupleSettings();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'monthly' | 'settings'>('today');

  // Pair Settings State
  const [myRole, setMyRole] = useState<'husband' | 'wife'>(coupleConfig.myRole);
  const [myEmail, setMyEmail] = useState(coupleConfig.myEmail || '');
  const [partnerEmail, setPartnerEmail] = useState(coupleConfig.partnerEmail || '');
  const [myName, setMyName] = useState(coupleConfig.myName);
  const [partnerName, setPartnerName] = useState(coupleConfig.partnerName);
  const [pairCode, setPairCode] = useState(coupleConfig.pairCode);
  const [pairSavedSuccess, setPairSavedSuccess] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // Pair Room Management via Secure RPC
  const [pairStatus, setPairStatus] = useState<any>(null);
  const [inviteInput, setInviteInput] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [pairActionError, setPairActionError] = useState<string | null>(null);
  const [isPairActionLoading, setIsPairActionLoading] = useState(false);

  // Partner State (Live & Synced via Supabase)
  const [partnerState, setPartnerState] = useState<CoupleMemberState>(() => getStoredPartnerState());
  const [partnerSessions, setPartnerSessions] = useState<Session[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  // Load Partner Sessions for weekly/monthly comparison
  useEffect(() => {
    if (pairCode) {
      fetchPartnerSessions(pairCode, partnerEmail).then((res) => {
        if (res && res.length > 0) {
          setPartnerSessions(res);
        }
      });
    }
  }, [pairCode, partnerEmail]);

  // Load Pair Status on Mount
  useEffect(() => {
    fetchMyPairStatus().then((status) => {
      setPairStatus(status);
      if (status && status.inPair && status.pairCode) {
        setPairCode(status.pairCode);
        if (status.inviteCode) setCreatedInviteCode(status.inviteCode);
      }
    });
  }, []);

  // Sync state whenever settings change
  useEffect(() => {
    const syncState = () => {
      const cur = getCoupleSettings();
      setMyRole(cur.myRole);
      setMyEmail(cur.myEmail || '');
      setPartnerEmail(cur.partnerEmail || '');
      setPairCode(cur.pairCode);
      setMyName(cur.myName);
      setPartnerName(cur.partnerName);
    };

    syncState();
    window.addEventListener('konkoor_profile_switched', syncState);

    const handleSyncError = (e: any) => {
      const msg = e?.detail?.message;
      if (msg) {
        setPairActionError(msg);
      }
    };
    window.addEventListener('ky_pair_sync_error', handleSyncError);

    return () => {
      window.removeEventListener('konkoor_profile_switched', syncState);
      window.removeEventListener('ky_pair_sync_error', handleSyncError);
    };
  }, []);

  const displayMyName = myRole === 'husband' ? (myName || 'امیرمحمد') : (myName || 'آرمیتا');
  const displayPartnerName =
    myRole === 'husband'
      ? (partnerName && partnerName !== displayMyName ? partnerName : 'آرمیتا')
      : (partnerName && partnerName !== displayMyName ? partnerName : 'امیرمحمد');

  // Supabase status
  const [sbStatus, setSbStatus] = useState<string | null>(null);

  // Calculate my own today statistics
  const todaySessions = (sessions || []).filter(
    (s) => s && !s.deleted_at && s.day === today
  );
  const ownTodaySessionSeconds = todaySessions.reduce((sum, s) => sum + (s.seconds || 0), 0);
  const ownTodayTotalSeconds = ownTodaySessionSeconds + (liveTimerSeconds || 0);
  const ownTodayMinutes = Math.round(ownTodayTotalSeconds / 60);

  const ownTodayTests = todaySessions.reduce(
    (sum, s) => sum + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0),
    0
  );

  // 1. Initial remote fetch from Supabase
  useEffect(() => {
    let isMounted = true;
    fetchRemotePartnerState().then((remote) => {
      if (remote && isMounted) {
        setPartnerState(remote);
      }
    });

    // 2. Realtime subscription to Supabase broadcast and table changes
    const unsubscribe = subscribeToPartnerRealtime((incoming) => {
      if (isMounted) {
        setPartnerState(incoming);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [pairCode, myRole]);

  // 3. Local tick if partner is actively studying
  useEffect(() => {
    const timer = setInterval(() => {
      setPartnerState((prev) => {
        if (!prev.isStudying) return prev;
        // Verify partner heartbeat is not stale (> 2 minutes without remote ping)
        if (prev.lastHeartbeat && Date.now() - prev.lastHeartbeat > 120_000) {
          return {
            ...prev,
            isStudying: false,
            online: false,
          };
        }
        return {
          ...prev,
          sessionElapsedSeconds: prev.sessionElapsedSeconds + 1,
          todaySeconds: prev.todaySeconds + 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 4. Broadcast my state to Supabase whenever my timer ticks or status updates
  useEffect(() => {
    broadcastMyState({
      isStudying: isTimerRunning,
      subject: activeTimerSubject,
      subjectName: getSubject(activeTimerSubject).name,
      sessionElapsedSeconds: liveTimerSeconds,
      todaySeconds: ownTodayTotalSeconds,
      todayTests: ownTodayTests,
    });
  }, [isTimerRunning, liveTimerSeconds, activeTimerSubject, ownTodayTotalSeconds, ownTodayTests]);

  const partnerTodayMinutes = Math.round(partnerState.todaySeconds / 60);
  const diffMinutes = ownTodayMinutes - partnerTodayMinutes;
  const isAhead = diffMinutes >= 0;

  const handleCreateRoom = async () => {
    setIsPairActionLoading(true);
    setPairActionError(null);
    const res = await createPairRoom();
    setIsPairActionLoading(false);
    if (!res.ok) {
      setPairActionError(res.error || 'خطا در ایجاد اتاق');
    } else if (res.data) {
      setPairCode(res.data.pair_code);
      setCreatedInviteCode(res.data.invite_code);
      setPairStatus({
        inPair: true,
        pairCode: res.data.pair_code,
        role: res.data.role,
        inviteCode: res.data.invite_code,
        memberCount: 1,
      });
      fetchRemotePartnerState().then((remote) => {
        if (remote) setPartnerState(remote);
      });
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;
    setIsPairActionLoading(true);
    setPairActionError(null);
    const res = await joinPairRoom(inviteInput.trim());
    setIsPairActionLoading(false);
    if (!res.ok) {
      setPairActionError(res.error || 'کد دعوت نامعتبر یا منقضی شده است.');
    } else if (res.data) {
      setPairCode(res.data.pair_code);
      setInviteInput('');
      const status = await fetchMyPairStatus();
      setPairStatus(status);
      fetchRemotePartnerState().then((remote) => {
        if (remote) setPartnerState(remote);
      });
    }
  };

  const handleLeaveRoom = () => {
    setConfirmLeaveOpen(true);
  };

  const handleExecuteLeave = async () => {
    setConfirmLeaveOpen(false);
    setIsPairActionLoading(true);
    await leavePairRoom();
    setPairCode('');
    setCreatedInviteCode(null);
    setPairStatus({ inPair: false });
    setPartnerSessions([]);
    setIsPairActionLoading(false);
  };

  const handleRegenerateInvite = async () => {
    setIsPairActionLoading(true);
    setPairActionError(null);
    const res = await regenerateInviteCode();
    setIsPairActionLoading(false);
    if (!res.ok) {
      setPairActionError(res.error || 'خطا در تمدید کد دعوت.');
    } else if (res.invite_code) {
      setCreatedInviteCode(res.invite_code);
      setPairStatus((prev: any) => ({
        ...prev,
        inviteCode: res.invite_code,
        expiresAt: res.expires_at,
      }));
    }
  };

  const handleSavePairSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMyEmail = myEmail.trim();
    const cleanPartnerEmail = partnerEmail.trim();
    const cleanMyName = myName.trim() || (myRole === 'husband' ? 'کاربر ۱' : 'کاربر ۲');
    const cleanPartnerName = partnerName.trim() || (myRole === 'husband' ? 'کاربر ۲' : 'کاربر ۱');
    const cleanPairCode = pairCode.trim();

    saveCoupleSettings({
      myRole,
      pairCode: cleanPairCode,
      myName: cleanMyName,
      partnerName: cleanPartnerName,
      myEmail: cleanMyEmail,
      partnerEmail: cleanPartnerEmail,
    });
    setPairSavedSuccess(true);
    setTimeout(() => setPairSavedSuccess(false), 2500);

    // Re-fetch after settings save
    fetchRemotePartnerState().then((remote) => {
      if (remote) setPartnerState(remote);
    });
    if (cleanPairCode) {
      fetchPartnerSessions(cleanPairCode, cleanPartnerEmail).then((res) => {
        if (res) setPartnerSessions(res);
      });
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSbStatus('در حال اتصال و همگام‌سازی با سرور Supabase...');
    const res = await testSupabaseConnection();
    const remote = await fetchRemotePartnerState();
    if (pairCode) {
      const pSessions = await fetchPartnerSessions(pairCode, partnerEmail);
      if (pSessions) setPartnerSessions(pSessions);
    }
    if (remote) {
      setPartnerState(remote);
      setSbStatus('همگام‌سازی داده‌های زنده با موفقیت انجام شد.');
    } else {
      setSbStatus(res.message);
    }
    setTimeout(() => setIsSyncing(false), 600);
  };

  // Generate Weekly Comparative Data using actual stored records for both partners
  const weeklyData = weekDays.map((wd) => {
    const daySessions = (sessions || []).filter(
      (s) => s && !s.deleted_at && s.day === wd.iso
    );
    const daySecs = daySessions.reduce((sum, s) => sum + (s.seconds || 0), 0);
    const isToday = wd.iso === today;
    const myMins = Math.round((daySecs + (isToday ? liveTimerSeconds : 0)) / 60);

    // Actual stored partner sessions for this day
    const pDaySessions = (partnerSessions || []).filter(
      (s) => s && !s.deleted_at && s.day === wd.iso
    );
    const pDaySecs = pDaySessions.reduce((sum, s) => sum + (s.seconds || 0), 0);
    const partnerMins = isToday
      ? Math.max(partnerTodayMinutes, Math.round(pDaySecs / 60))
      : Math.round(pDaySecs / 60);

    return {
      day: wd.weekdayName,
      [myName]: myMins,
      [partnerName]: partnerMins,
      myTests: daySessions.reduce((s, it) => s + (it.correct || 0) + (it.wrong || 0), 0),
      partnerTests: isToday
        ? partnerState.todayTests
        : pDaySessions.reduce((s, it) => s + (it.correct || 0) + (it.wrong || 0), 0),
    };
  });

  const totalWeekMyMinutes = weeklyData.reduce((sum, d) => sum + (Number(d[myName]) || 0), 0);
  const totalWeekPartnerMinutes = weeklyData.reduce((sum, d) => sum + (Number(d[partnerName]) || 0), 0);
  const weekWinner = totalWeekMyMinutes >= totalWeekPartnerMinutes ? myName : partnerName;

  // Genuine Jalali Monthly Aggregation
  const curJalaliMonthKey = jalaliMonthKey(today);
  const curJalaliParts = jalaliPartsFromIso(today) || [1405, 1, 1];
  const passedDaysInMonth = Math.max(1, curJalaliParts[2]);

  const myMonthSessions = (sessions || []).filter(
    (s) => !s.deleted_at && jalaliMonthKey(s.day) === curJalaliMonthKey
  );
  const myMonthTotalMinutes = Math.round(
    (myMonthSessions.reduce((sum, s) => sum + (s.seconds || 0), 0) + liveTimerSeconds) / 60
  );

  const partnerMonthSessions = (partnerSessions || []).filter(
    (s) => !s.deleted_at && jalaliMonthKey(s.day) === curJalaliMonthKey && s.day !== today
  );
  const partnerMonthTotalMinutes =
    Math.round(partnerMonthSessions.reduce((sum, s) => sum + (s.seconds || 0), 0) / 60) +
    partnerTodayMinutes;

  const myDailyAvgInMonth = Math.round(myMonthTotalMinutes / passedDaysInMonth);
  const partnerDailyAvgInMonth = Math.round(partnerMonthTotalMinutes / passedDaysInMonth);

  return (
    <div className="space-y-6 pb-14 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight break-words">
              رقابت مطالعه دونفره من و همسرم
            </h2>
            <span className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 shadow-xs shrink-0">
              <Heart className="w-4 h-4 fill-blue-600 dark:fill-blue-400 text-blue-600 dark:text-blue-400" />
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            مشاهده زنده تایمر هم‌مسیر، مقایسه روزانه و هفتگی بدون پیام‌های واسطه
          </p>
        </div>

        {/* Live sync indicator & trigger */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl neu-inset text-[11px] font-bold text-blue-700 dark:text-blue-300">
            <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse shrink-0" />
            <span>اتصال زنده دونفره فعال</span>
          </div>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="p-2 rounded-xl neu-raised-sm text-slate-600 dark:text-slate-300 hover:text-blue-600 cursor-pointer transition-all disabled:opacity-50"
            title="بروزرسانی داده‌های زنده"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="p-1 rounded-2xl neu-inset flex gap-1 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'today'
              ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>تایمرهای زنده امروز</span>
        </button>

        <button
          onClick={() => setActiveTab('weekly')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'weekly'
              ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>مقایسه هفتگی (Recharts)</span>
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'monthly'
              ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          <span>مقایسه ماهانه</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'settings'
              ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>اتصال و تنظیمات</span>
        </button>
      </div>

      {/* TAB 1: TODAY LIVE BATTLE */}
      {activeTab === 'today' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {!pairCode && (
            <div className="neu-card p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-extrabold text-sm">اتاق مطالعه دونفره هنوز متصل نشده است</p>
                  <p className="text-[11px] opacity-80 mt-0.5">برای مشاهده زنده تایمر همسر و همگام‌سازی ابری، یک اتاق دونفره بسازید یا با کد دعوت ملحق شوید.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="px-4 py-2 rounded-xl neu-btn-primary font-bold shrink-0 cursor-pointer self-start sm:self-auto text-xs"
              >
                ساخت یا پیوستن به اتاق
              </button>
            </div>
          )}

          {/* Who is Ahead Banner */}
          <div className="neu-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
                <Trophy className="w-5 h-5 text-yellow-300" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  وضعیت رقابت امروز
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                  {diffMinutes === 0
                    ? 'هر دو نفر در وضعیت مطالعه همگام و برابر هستید.'
                    : isAhead
                    ? `شما در حال حاضر ${faNum(Math.abs(diffMinutes))} دقیقه در مطالعه امروز جلوتر هستید.`
                    : `${partnerName} در حال حاضر ${faNum(Math.abs(diffMinutes))} دقیقه جلوتر است.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-black px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                اختلاف: {faNum(Math.abs(diffMinutes))} دقیقه
              </span>
            </div>
          </div>

          {/* Side-by-Side Dual Live Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. MY CARD */}
            <div className="neu-card p-6 space-y-5 border-t-4 border-t-blue-600">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar3DBadge role={myRole} size="md" isStudying={isTimerRunning} />
                  <div className="min-w-0">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white block truncate">
                      {displayMyName}
                    </span>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {isTimerRunning ? 'در حال مطالعه روی این دستگاه' : 'تایمر در حالت توقف'}
                    </span>
                  </div>
                </div>

                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                    isTimerRunning
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isTimerRunning ? 'bg-blue-600 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  <span>{isTimerRunning ? 'در حال مطالعه' : 'آماده پارت'}</span>
                </span>
              </div>

              {/* Big Timer Display */}
              <div className="p-4 rounded-2xl neu-inset text-center space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  مجموع خالص مطالعه امروز
                </span>
                <div className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400" dir="ltr">
                  {fmtHM(ownTodayMinutes)}
                </div>
                {isTimerRunning && (
                  <span className="text-xs font-bold text-blue-500 block mt-1 break-words">
                    درس جاری: {getSubject(activeTimerSubject).name} ({faNum(Math.floor(liveTimerSeconds / 60))} دقیقه)
                  </span>
                )}
              </div>

              {/* Sub metrics */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-xl neu-raised-sm">
                  <span className="text-[10px] text-slate-400 block mb-0.5">تست‌های امروز</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono">
                    {faNum(ownTodayTests)}
                  </span>
                </div>
                <div className="p-3 rounded-xl neu-raised-sm">
                  <span className="text-[10px] text-slate-400 block mb-0.5">پارت‌های پایان‌یافته</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono">
                    {faNum(todaySessions.length)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. PARTNER CARD */}
            <div className="neu-card p-6 space-y-5 border-t-4 border-t-sky-500">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar3DBadge role={myRole === 'husband' ? 'wife' : 'husband'} size="md" isStudying={partnerState.isStudying} />
                  <div className="min-w-0">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white block truncate">
                      {displayPartnerName}
                    </span>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {partnerState.isStudying
                        ? partnerState.online
                          ? `در حال مطالعه ${partnerState.subjectName}`
                          : `در حال مطالعه (پس‌زمینه) ${partnerState.subjectName}`
                        : 'آنلاین و آماده'}
                    </span>
                  </div>
                </div>

                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                    partnerState.isStudying
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      partnerState.isStudying ? 'bg-sky-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {partnerState.isStudying
                      ? partnerState.online
                        ? 'در حال مطالعه زنده'
                        : 'در حال مطالعه (پس‌زمینه)'
                      : 'استراحت'}
                  </span>
                </span>
              </div>

              {/* Partner Big Timer Display */}
              <div className="p-4 rounded-2xl neu-inset text-center space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  مجموع مطالعه امروز همسر
                </span>
                <div className="text-3xl font-black font-mono text-sky-600 dark:text-sky-400" dir="ltr">
                  {fmtHM(partnerTodayMinutes)}
                </div>
                {partnerState.isStudying && (
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400 block mt-1 break-words">
                    درس جاری: {partnerState.subjectName} ({faNum(Math.floor(partnerState.sessionElapsedSeconds / 60))} دقیقه تیک‌تاک زنده)
                  </span>
                )}
              </div>

              {/* Sub metrics */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-xl neu-raised-sm">
                  <span className="text-[10px] text-slate-400 block mb-0.5">تست‌های حل‌شده</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono">
                    {faNum(partnerState.todayTests)}
                  </span>
                </div>
                <div className="p-3 rounded-xl neu-raised-sm">
                  <span className="text-[10px] text-slate-400 block mb-0.5">وضعیت اتصال</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {partnerState.online ? 'متصل به سرور' : 'در انتظار اتصال'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Comparative Progress Bar */}
          <div className="neu-card p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-bold gap-2">
              <span className="text-slate-700 dark:text-slate-200 break-words">
                نسبت حجم مطالعه امروز: {myName} ({fmtPercent((ownTodayMinutes / Math.max(1, ownTodayMinutes + partnerTodayMinutes)) * 100)}) به {partnerName} ({fmtPercent((partnerTodayMinutes / Math.max(1, ownTodayMinutes + partnerTodayMinutes)) * 100)})
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-mono text-xs shrink-0">
                مجموع: {fmtHM(ownTodayMinutes + partnerTodayMinutes)}
              </span>
            </div>

            <div className="w-full h-3.5 rounded-full neu-inset p-0.5 flex overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300 shadow-xs"
                style={{
                  width: `${(ownTodayMinutes / Math.max(1, ownTodayMinutes + partnerTodayMinutes)) * 100}%`,
                }}
              />
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-300 shadow-xs"
                style={{
                  width: `${(partnerTodayMinutes / Math.max(1, ownTodayMinutes + partnerTodayMinutes)) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WEEKLY COMPARISON (RECHARTS DUAL BAR CHART) */}
      {activeTab === 'weekly' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Winner Card */}
          <div className="neu-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                <Award className="w-6 h-6 text-yellow-300" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                  رتبه‌برتر هفته جاری: {weekWinner}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                  مجموع مطالعه شما: {fmtHM(totalWeekMyMinutes)} | مجموع مطالعه همسر: {fmtHM(totalWeekPartnerMinutes)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                مجموع مطالعه مشترک: {fmtHM(totalWeekMyMinutes + totalWeekPartnerMinutes)}
              </span>
            </div>
          </div>

          {/* Recharts Side-by-Side Dual Bar Chart */}
          <div className="neu-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800 gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  نمودار شانه به شانه مطالعه در طول هفته (شنبه تا جمعه)
                </h3>
                <p className="text-xs text-slate-400">مقایسه دقیق دقایق ثبت‌شده به تفکیک روز</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold shrink-0">
                <div className="flex items-center gap-1.5 text-blue-600">
                  <span className="w-3 h-3 rounded-md bg-blue-600 shrink-0" />
                  <span className="truncate max-w-[100px]">{myName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sky-500">
                  <span className="w-3 h-3 rounded-md bg-sky-500 shrink-0" />
                  <span className="truncate max-w-[100px]">{partnerName}</span>
                </div>
              </div>
            </div>

            <div className="w-full h-72 pt-4" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 10, right: 22, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val}د`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as any;
                        return (
                          <div
                            dir="rtl"
                            className="bg-slate-900/95 text-white text-xs p-3 rounded-2xl shadow-xl border border-slate-700 space-y-1.5"
                          >
                            <span className="font-bold block text-blue-300 pb-1 border-b border-slate-700">
                              {data.day}
                            </span>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-blue-400 font-bold">{myName}:</span>
                              <span className="font-mono text-white font-bold">
                                {fmtHM(data[myName])} ({faNum(data[myName])} دقیقه)
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sky-400 font-bold">{partnerName}:</span>
                              <span className="font-mono text-white font-bold">
                                {fmtHM(data[partnerName])} ({faNum(data[partnerName])} دقیقه)
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey={myName} fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey={partnerName} fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MONTHLY COMPARISON */}
      {activeTab === 'monthly' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="neu-card p-5 text-center space-y-2">
              <span className="text-xs font-bold text-slate-500 block">میانگین روزانه مطالعه من</span>
              <div className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                {fmtHM(Math.round(totalWeekMyMinutes / 7))}
              </div>
              <span className="text-[11px] text-slate-400 block">بر اساس داده‌های هفته جاری</span>
            </div>

            <div className="neu-card p-5 text-center space-y-2">
              <span className="text-xs font-bold text-slate-500 block">میانگین روزانه مطالعه همسر</span>
              <div className="text-2xl font-black font-mono text-sky-500">
                {fmtHM(Math.round(totalWeekPartnerMinutes / 7))}
              </div>
              <span className="text-[11px] text-slate-400 block">بر اساس داده‌های همگام‌شده</span>
            </div>

            <div className="neu-card p-5 text-center space-y-2">
              <span className="text-xs font-bold text-slate-500 block">تست‌های حل‌شده امروز</span>
              <div className="text-2xl font-black font-mono text-slate-800 dark:text-slate-100">
                {faNum(ownTodayTests + partnerState.todayTests)}
              </div>
              <span className="text-[11px] text-slate-400 block">مجموع دو نفره</span>
            </div>
          </div>

          <div className="neu-card p-6 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              برنامه رشد و پیشرفت دو نفره در ماه
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              با مطالعه مستمر دونفره و بررسی شانه به شانه ساعت مطالعه، تمرکز و انگیزه شما تا روز کنکور در بالاترین سطح ممکن حفظ می‌شود.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: PAIR SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-200 max-w-xl">
          {/* Pair Room Management Card (Secure Crypto RPC) */}
          <div className="neu-card p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  مدیریت اتصال اتاق دونفره (اتصال امن)
                </h3>
              </div>
              {pairCode ? (
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>متصل به اتاق</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>عدم اتصال</span>
                </span>
              )}
            </div>

            {pairActionError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pairActionError}</span>
              </div>
            )}

            {pairCode ? (
              /* Already in a pair */
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl neu-inset space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-bold">شناسه اختصاصی اتاق شما:</span>
                    <span className="font-mono font-extrabold text-blue-600 text-sm">{pairCode}</span>
                  </div>

                  {/* If invite code exists and room is waiting for partner */}
                  {(createdInviteCode || (pairStatus?.inviteCode && pairStatus?.memberCount === 1)) && (
                    <div className="p-3 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-blue-900 dark:text-blue-200">
                          کد دعوت یک‌بارمصرف برای همسر:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const codeToCopy = createdInviteCode || pairStatus?.inviteCode || '';
                            navigator.clipboard.writeText(codeToCopy);
                            setInviteCopied(true);
                            setTimeout(() => setInviteCopied(false), 2500);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer hover:bg-blue-700 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{inviteCopied ? 'کپی شد!' : 'کپی کد دعوت'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-center text-lg font-black tracking-widest text-blue-700 dark:text-blue-300 py-1 bg-white dark:bg-slate-900 rounded-md border border-blue-100 dark:border-blue-900/50 select-all">
                        {createdInviteCode || pairStatus?.inviteCode}
                      </div>
                      <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                        این کد تا ۴۸ ساعت معتبر است. همسر شما می‌تواند با وارد کردن این کد در بخش «پیوستن به اتاق با کد دعوت»، بلافاصله به اتاق متصل شود.
                      </p>
                    </div>
                  )}

                  {pairStatus?.memberCount === 2 && (
                    <div className="text-[11px] text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>اتاق دونفره کامل است (۲ از ۲ عضو متصل هستند). داده‌های مطالعه زنده همگام‌سازی می‌شوند.</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleLeaveRoom}
                    disabled={isPairActionLoading}
                    className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>خروج از این اتاق دونفره</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Not in a pair: show Create or Join */
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  برای رقابت زنده و همگام‌سازی تایمر مطالعه، یکی از دو روش زیر را انتخاب کنید:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Option 1: Create room */}
                  <div className="p-4 rounded-xl neu-raised-sm flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-1.5 font-extrabold text-slate-800 dark:text-slate-100">
                        <UserPlus className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>ساخت اتاق جدید</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        اتاق اختصاصی بسازید و کد دعوت تولیدشده را برای همسرتان بفرستید.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      disabled={isPairActionLoading}
                      className="w-full py-2.5 px-3 rounded-xl neu-btn-primary font-bold cursor-pointer transition-all disabled:opacity-50 text-center"
                    >
                      {isPairActionLoading ? 'در حال ساخت...' : 'ایجاد اتاق و دریافت کد دعوت'}
                    </button>
                  </div>

                  {/* Option 2: Join room */}
                  <form onSubmit={handleJoinRoom} className="p-4 rounded-xl neu-raised-sm flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-1.5 font-extrabold text-slate-800 dark:text-slate-100">
                        <Key className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>پیوستن با کد دعوت</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        اگر همسرتان اتاقی ساخته است، کد دعوت دریافتی را وارد کنید:
                      </p>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={inviteInput}
                        onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                        placeholder="مثال: INV-A1B2C3D4"
                        className="w-full px-3 py-2 rounded-lg neu-inset font-mono uppercase text-center font-bold text-blue-700 dark:text-blue-300"
                        dir="ltr"
                      />
                      <button
                        type="submit"
                        disabled={isPairActionLoading || !inviteInput.trim()}
                        className="w-full py-2 px-3 rounded-xl neu-btn-primary font-bold cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isPairActionLoading ? 'در حال اتصال...' : 'پیوستن به اتاق'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* User Names & Personalization Card */}
          <div className="neu-card p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800">
              <Settings className="w-4 h-4 text-blue-600 shrink-0" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                شخصی‌سازی نام‌ها و پروفایل
              </h3>
            </div>

            <form onSubmit={handleSavePairSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نقش شما در اتاق (تعیین‌شده توسط سرور بر اساس ساخت یا پیوستن):
                </label>
                <div className="p-3 rounded-xl neu-inset flex items-center justify-between">
                  <span className="font-extrabold text-blue-800 dark:text-blue-200">
                    {myRole === 'husband' ? 'همسر ۱ (سازنده اتاق)' : 'همسر ۲ (عضو پیوسته به اتاق)'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold">
                    RLS تاییدشده
                  </span>
                </div>
              </div>

              {/* My Email & Name */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  ایمیل حساب کاربری من
                </label>
                <input
                  type="email"
                  value={myEmail}
                  placeholder="my-email@example.com"
                  onChange={(e) => setMyEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl neu-inset font-medium text-slate-800 dark:text-slate-100"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نام نمایشی من
                </label>
                <input
                  type="text"
                  value={myName}
                  placeholder="نام نمایشی شما"
                  onChange={(e) => setMyName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl neu-inset font-bold text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Partner Email & Name */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  ایمیل همسرم
                </label>
                <input
                  type="email"
                  value={partnerEmail}
                  placeholder="partner-email@example.com"
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl neu-inset font-medium text-slate-800 dark:text-slate-100"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نام نمایشی همسرم
                </label>
                <input
                  type="text"
                  value={partnerName}
                  placeholder="نام نمایشی همسر"
                  onChange={(e) => setPartnerName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl neu-inset font-bold text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl neu-btn-primary font-bold cursor-pointer"
                >
                  ذخیره نام‌ها و اطلاعات
                </button>

                {pairSavedSuccess && (
                  <span className="text-blue-600 font-bold flex items-center gap-1 text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تنظیمات ذخیره شد!</span>
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Database Connection Diagnostic & SQL Schema */}
          <div className="neu-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  وضعیت سرور پایگاه‌داده ابری Supabase Realtime
                </h4>
              </div>
              <button
                type="button"
                onClick={handleManualSync}
                className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
              >
                تست مجدد اتصال
              </button>
            </div>

            {sbStatus && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">{sbStatus}</p>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-extrabold text-slate-800 dark:text-slate-200 block">
                  کد SQL کامل ساخت تمام جداول (Sessions, Exams, Mistakes, Plans, Live States)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  کد آماده را کپی کرده یا فایل را دانلود کنید و در پنل Supabase (بخش SQL Editor) اجرا نمایید تا ذخیره‌سازی ابری ۱۰۰٪ فعال شود.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(CANONICAL_SUPABASE_SQL);
                    setSqlCopied(true);
                    setTimeout(() => setSqlCopied(false), 3000);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer shrink-0 shadow-sm"
                >
                  {sqlCopied ? 'کد SQL کپی شد!' : 'کپی اسکریپت SQL کامل'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([CANONICAL_SUPABASE_SQL], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'supabase_schema.sql';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold transition-colors cursor-pointer shrink-0"
                >
                  دانلود فایل SQL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
