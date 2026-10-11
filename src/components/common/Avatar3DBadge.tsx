import React from 'react';
import { Shield, Sparkles, User, UserCheck } from 'lucide-react';

interface Avatar3DBadgeProps {
  role: 'husband' | 'wife' | 'user' | 'partner';
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isStudying?: boolean;
  className?: string;
  borderless?: boolean;
}

export const Avatar3DBadge: React.FC<Avatar3DBadgeProps> = ({
  role,
  name,
  size = 'md',
  isStudying = false,
  className = '',
  borderless = false,
}) => {
  const isHusband = role === 'husband' || role === 'user';
  const initial = isHusband ? 'ا' : 'آ';

  const sizeMap = {
    sm: {
      container: 'w-8 h-8 text-xs',
      icon: 'w-3.5 h-3.5',
      badge: 'w-2 h-2',
      initialSize: 'text-[11px]',
    },
    md: {
      container: 'w-11 h-11 text-sm',
      icon: 'w-4 h-4',
      badge: 'w-2.5 h-2.5',
      initialSize: 'text-xs',
    },
    lg: {
      container: 'w-14 h-14 text-base',
      icon: 'w-5 h-5',
      badge: 'w-3 h-3',
      initialSize: 'text-sm',
    },
    xl: {
      container: 'w-20 h-20 text-xl',
      icon: 'w-7 h-7',
      badge: 'w-4 h-4',
      initialSize: 'text-lg',
    },
  }[size];

  if (borderless) {
    return (
      <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
        <div
          className={`p-1.5 rounded-2xl ${
            isHusband
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
              : 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400'
          }`}
        >
          {isHusband ? (
            <Shield className={sizeMap.icon} strokeWidth={2.2} />
          ) : (
            <Sparkles className={sizeMap.icon} strokeWidth={2.2} />
          )}
        </div>
        {isStudying && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 ${sizeMap.badge} rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 shadow-sm animate-pulse`}
          />
        )}
      </div>
    );
  }

  // Modern, high-end gradient palettes without childish effects
  const gradientClass = isHusband
    ? 'from-blue-600 to-indigo-700 text-white shadow-blue-500/25'
    : 'from-sky-500 to-blue-600 text-white shadow-sky-500/25';

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      {/* Container with sleek rounded squircle shape */}
      <div
        className={`relative ${sizeMap.container} rounded-2xl bg-gradient-to-br ${gradientClass} shadow-md flex items-center justify-center transition-transform duration-200 hover:scale-105`}
      >
        {/* Subtle glass layer */}
        <div className="w-full h-full rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-xs relative overflow-hidden">
          {/* Subtle gloss corner reflection */}
          <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-t-2xl" />

          {/* Clean glyph + Persian initial letter */}
          <div className="relative z-10 flex items-center justify-center gap-0.5">
            {isHusband ? (
              <Shield className={sizeMap.icon} strokeWidth={2.4} />
            ) : (
              <Sparkles className={sizeMap.icon} strokeWidth={2.4} />
            )}
            <span className={`font-black ${sizeMap.initialSize} leading-none mr-0.5`}>
              {initial}
            </span>
          </div>
        </div>
      </div>

      {/* Online/Studying Live Indicator */}
      {isStudying && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${sizeMap.badge} rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 shadow-sm animate-pulse`}
          title="در حال مطالعه زنده"
        />
      )}
    </div>
  );
};
