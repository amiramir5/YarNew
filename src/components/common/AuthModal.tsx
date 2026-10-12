import React, { useState, useEffect } from 'react';
import {
  Mail,
  Key,
  LogIn,
  LogOut,
  ShieldCheck,
  User,
  AlertCircle,
  Loader2,
  UserPlus,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  getCoupleSettings,
} from '../../lib/coupleSync';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (email: string, name: string) => void;
  initialMode?: 'signin' | 'signup' | 'reset' | 'update_password';
  initialErrorMessage?: string;
  initialSuccessMessage?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'signin',
  initialErrorMessage = '',
  initialSuccessMessage = '',
}) => {
  const { user, email: activeEmail, name: activeName, role: activeRole, signIn, signUp, signOut, resetPassword, updatePassword } = useAuth();
  const currentCouple = getCoupleSettings();

  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'update_password'>(initialMode);
  const [email, setEmail] = useState(activeEmail || currentCouple.myEmail || '');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState(activeName || currentCouple.myName || '');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage || '');
  const [successMessage, setSuccessMessage] = useState(initialSuccessMessage || '');

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (initialErrorMessage) {
      setErrorMessage(initialErrorMessage);
    }
  }, [initialErrorMessage]);

  useEffect(() => {
    if (initialSuccessMessage) {
      setSuccessMessage(initialSuccessMessage);
    }
  }, [initialSuccessMessage]);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (!initialErrorMessage) {
        setErrorMessage('');
      }
      if (!initialSuccessMessage) {
        setSuccessMessage('');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (mode === 'update_password') {
        if (!newPassword || newPassword.length < 6) {
          setErrorMessage('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
          setIsLoading(false);
          return;
        }
        if (confirmPassword && newPassword !== confirmPassword) {
          setErrorMessage('تکرار رمز عبور با رمز عبور جدید همخوانی ندارد.');
          setIsLoading(false);
          return;
        }
        const res = await updatePassword(newPassword);
        setIsLoading(false);
        if (res.ok) {
          setSuccessMessage(res.message);
          setNewPassword('');
          setConfirmPassword('');
          setTimeout(() => {
            onClose();
          }, 1800);
        } else {
          setErrorMessage(res.message);
        }
        return;
      }

      const cleanEmail = email.trim();
      if (!cleanEmail) {
        setErrorMessage('لطفاً آدرس ایمیل را وارد فرمایید.');
        setIsLoading(false);
        return;
      }

      if (mode === 'reset') {
        const res = await resetPassword(cleanEmail);
        setIsLoading(false);
        if (res.ok) {
          setSuccessMessage(res.message);
        } else {
          setErrorMessage(res.message);
        }
        return;
      }

      if (mode === 'signin') {
        if (!password) {
          setErrorMessage('لطفاً رمز عبور را وارد نمایید.');
          setIsLoading(false);
          return;
        }
        const res = await signIn(cleanEmail, password);
        if (!res.ok) {
          setErrorMessage(res.error || 'ایمیل یا رمز عبور اشتباه است.');
          setIsLoading(false);
          return;
        }
        setSuccessMessage('ورود با موفقیت انجام شد! اطلاعات شما همگام‌سازی می‌شود.');
      } else {
        if (!password || password.length < 6) {
          setErrorMessage('رمز عبور باید حداقل ۶ کاراکتر باشد.');
          setIsLoading(false);
          return;
        }
        const res = await signUp(cleanEmail, password, name);
        if (!res.ok) {
          setErrorMessage(res.error || 'خطا در ثبت‌نام حساب کاربری.');
          setIsLoading(false);
          return;
        }
        if (res.requiresVerification) {
          setSuccessMessage('لینک تأیید به ایمیل ارسال شد. لطفاً صندوق ورودی خود را بررسی کنید.');
          setIsLoading(false);
          return;
        }
        setSuccessMessage('حساب کاربری با موفقیت ساخته شد.');
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
      setErrorMessage(err?.message || 'خطایی در ارتباط با سرور رخ داد.');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    await signOut();
    setIsLoading(false);
    setSuccessMessage('با موفقیت از حساب کاربری خارج شدید.');
    setTimeout(() => {
      setSuccessMessage('');
    }, 1500);
  };

  const isLoggedIn = Boolean(user || activeEmail);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0d1627] border border-blue-200 dark:border-blue-900/60 rounded-3xl max-w-md w-full p-6 text-right shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                حساب کاربری کنکوریار
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                احراز هویت امن و همگام‌سازی ابری با دیتابیس Supabase
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Current User Session Status */}
        {isLoggedIn && (
          <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-extrabold text-blue-900 dark:text-blue-100">
                  وضعیت: وارد شده به حساب
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                {activeRole === 'husband' ? 'عضو ۱' : 'عضو ۲'}
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

        {/* Mode Selector Tabs */}
        {mode !== 'update_password' && (
          <div className="p-1 rounded-2xl neu-inset flex gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setMode('signin'); setErrorMessage(''); }}
              className={`flex-1 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'signin'
                  ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>ورود</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('signup'); setErrorMessage(''); }}
              className={`flex-1 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'signup'
                  ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>ثبت‌نام</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('reset'); setErrorMessage(''); }}
              className={`flex-1 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'reset'
                  ? 'neu-raised text-blue-700 dark:text-blue-300 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازیابی رمز</span>
            </button>
          </div>
        )}

        {/* Notifications */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="leading-relaxed">{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {mode === 'update_password' ? (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 text-blue-900 dark:text-blue-100 text-[11px] leading-relaxed">
                لطفاً رمز عبور جدید خود را مشخص فرمایید. رمز عبور باید حداقل شامل ۶ کاراکتر باشد.
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رمز عبور جدید:
                </label>
                <div className="relative">
                  <Key className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="حداقل ۶ کاراکتر"
                    required
                    className="w-full pr-9 pl-10 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-left focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  تکرار رمز عبور جدید:
                </label>
                <div className="relative">
                  <Key className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="تکرار رمز عبور جدید"
                    required
                    className="w-full pr-9 pl-10 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-left focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setErrorMessage(''); }}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold"
                >
                  بازگشت به صفحه ورود
                </button>
              </div>
            </div>
          ) : (
            <>
              {mode === 'signup' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    نام یا نام نمایشی:
                  </label>
                  <div className="relative">
                    <User className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="نام شما"
                      required
                      className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Email input */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  آدرس ایمیل:
                </label>
                <div className="relative">
                  <Mail className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    required
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-left focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Password input */}
              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      رمز عبور:
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => { setMode('reset'); setErrorMessage(''); }}
                        className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                      >
                        رمز عبور را فراموش کردید؟
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Key className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="حداقل ۶ کاراکتر"
                      required
                      className="w-full pr-9 pl-10 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-left focus:outline-hidden focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال پردازش...</span>
              </>
            ) : mode === 'signin' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>ورود به حساب کاربری</span>
              </>
            ) : mode === 'signup' ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>ایجاد حساب جدید</span>
              </>
            ) : mode === 'update_password' ? (
              <>
                <Key className="w-4 h-4" />
                <span>ثبت رمز عبور جدید</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>ارسال لینک بازیابی رمز عبور</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
