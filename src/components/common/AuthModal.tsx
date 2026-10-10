import React, { useState } from 'react';
import {
  Mail,
  Key,
  LogIn,
  LogOut,
  CheckCircle2,
  ShieldCheck,
  User,
  Sparkles,
  AlertCircle,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  HUSBAND_CONFIG,
  WIFE_CONFIG,
  getCoupleSettings,
} from '../../lib/coupleSync';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (email: string, name: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const { user, session, email: activeEmail, name: activeName, role: activeRole, signIn, signUp, signOut } = useAuth();
  const currentCouple = getCoupleSettings();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(activeEmail || currentCouple.myEmail || HUSBAND_CONFIG.email);
  const [password, setPassword] = useState('konkoor1404');
  const [name, setName] = useState(activeName || currentCouple.myName || 'امیرمحمد');
  const [role, setRole] = useState<'husband' | 'wife'>(activeRole || currentCouple.myRole || 'husband');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleEmailChange = (val: string) => {
    setEmail(val);
    const clean = val.toLowerCase().trim();
    if (clean.includes('armita') || clean.includes('amirtaplan')) {
      setName('آرمیتا');
      setRole('wife');
    } else if (clean.includes('amir') || clean.includes('moradi')) {
      setName('امیرمحمد');
      setRole('husband');
    }
  };

  const handleSelectPreset = (target: 'husband' | 'wife') => {
    if (target === 'husband') {
      setEmail(HUSBAND_CONFIG.email);
      setName(HUSBAND_CONFIG.name);
      setRole('husband');
      setPassword('konkoor1404');
    } else {
      setEmail(WIFE_CONFIG.email);
      setName(WIFE_CONFIG.name);
      setRole('wife');
      setPassword('konkoor1404');
    }
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('لطفاً ایمیل را وارد کنید.');
      setIsLoading(false);
      return;
    }

    try {
      if (mode === 'signin') {
        const res = await signIn(cleanEmail, password);
        if (!res.ok) {
          setErrorMessage(res.error || 'خطا در ورود به حساب');
          setIsLoading(false);
          return;
        }
        setSuccessMessage('ورود موفقیت‌آمیز بود! نشست کاربری شما برای همیشه در این دستگاه ذخیره شد.');
      } else {
        const res = await signUp(cleanEmail, password, name, role);
        if (!res.ok) {
          setErrorMessage(res.error || 'خطا در ثبت‌نام حساب');
          setIsLoading(false);
          return;
        }
        setSuccessMessage('حساب کاربری با موفقیت ایجاد و فعال شد.');
      }

      if (onLoginSuccess) {
        onLoginSuccess(cleanEmail, name);
      }

      setTimeout(() => {
        setIsLoading(false);
        setSuccessMessage('');
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطایی در ارتباط با سرور احراز هویت رخ داد.');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    await signOut();
    setIsLoading(false);
    setSuccessMessage('با موفقیت از حساب خارج شدید.');
    setTimeout(() => {
      setSuccessMessage('');
    }, 1500);
  };

  const isLoggedIn = Boolean(user || activeEmail);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0d1627] border border-blue-200 dark:border-blue-900/60 rounded-3xl max-w-md w-full p-6 text-right shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                احراز هویت با ایمیل (Supabase Auth)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                نشست کاربری شما روی این گوشی یا سیستم پایدار می‌ماند
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Currently Logged In Banner */}
        {isLoggedIn && (
          <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-extrabold text-blue-900 dark:text-blue-100">
                  وضعیت فعلی: وارد شده به حساب
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                {activeRole === 'husband' ? 'آقا (امیرمحمد)' : 'خانم (آرمیتا)'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 font-mono text-[11px]">
              <span className="truncate">{activeEmail || user?.email}</span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isLoading}
                className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold font-sans cursor-pointer shrink-0 ml-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج از حساب</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick 1-Click Presets */}
        <div className="space-y-1.5 text-xs">
          <label className="block font-bold text-slate-700 dark:text-slate-300">
            انتخاب سریع حساب کاربری:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSelectPreset('husband')}
              className={`p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer ${
                role === 'husband' && email === HUSBAND_CONFIG.email
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-xs ring-2 ring-blue-400/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="font-black text-slate-900 dark:text-white">امیرمحمد</p>
                <p className="text-[10px] text-slate-500 font-mono truncate">am.moradidaem</p>
              </div>
              <span className="text-xl">👨🏻‍🎓</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectPreset('wife')}
              className={`p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer ${
                role === 'wife' && email === WIFE_CONFIG.email
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-xs ring-2 ring-blue-400/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="font-black text-slate-900 dark:text-white">آرمیتا</p>
                <p className="text-[10px] text-slate-500 font-mono truncate">amirtaplans</p>
              </div>
              <span className="text-xl">👩🏻‍🎓</span>
            </button>
          </div>
        </div>

        {/* Tabs: Sign In / Sign Up */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMessage('');
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === 'signin'
                ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>ورود با ایمیل</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMessage('');
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === 'signup'
                ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>ثبت‌نام جدید</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {mode === 'signup' && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                نام نمایشی:
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-blue-500"
                />
                <User className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              آدرس ایمیل کاربر:
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-left focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              رمز عبور:
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-left focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              <Key className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2 text-[11px] animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-[11px] animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال پردازش...</span>
                </>
              ) : mode === 'signin' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>ورود و ذخیره نشست دستگاه</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>ایجاد حساب کاربری</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold transition-colors cursor-pointer"
            >
              انصراف
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[10px] text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span>پشتیبانی کامل از سشن پایدار Supabase و ذخیره‌سازی داده‌های ابری</span>
        </div>
      </div>
    </div>
  );
};
