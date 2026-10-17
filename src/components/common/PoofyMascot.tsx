import React from 'react';

export type PoofyMood = 'idle' | 'happy' | 'talking' | 'thinking' | 'worried' | 'sleepy' | 'focus' | 'curious';

export type PoofyEyeStyle = 'vertical' | 'round';

interface PoofyMascotProps {
  mood?: PoofyMood;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  eyeStyle?: PoofyEyeStyle;
  onClick?: () => void;
  className?: string;
  showSparkles?: boolean;
}

export const PoofyMascot: React.FC<PoofyMascotProps> = ({
  mood = 'idle',
  size = 'md',
  eyeStyle = 'vertical',
  onClick,
  className = '',
  showSparkles = true,
}) => {
  const sizeMap = {
    xs: { box: 'w-8 h-8', svg: 32 },
    sm: { box: 'w-12 h-12', svg: 48 },
    md: { box: 'w-16 h-16', svg: 64 },
    lg: { box: 'w-24 h-24', svg: 96 },
    xl: { box: 'w-32 h-32', svg: 128 },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none transition-transform hover:scale-108 active:scale-95 ${currentSize.box} ${className}`}
      title="پوفی - همراه هوشمند کنکوریار"
    >
      {/* Floating Cloud Shadow */}
      <div className="absolute -bottom-2 w-3/4 h-2 bg-blue-900/10 dark:bg-black/30 rounded-full blur-xs" />

      {/* Gentle Floating & Breathing Wrapper */}
      <div className="relative w-full h-full animate-poofy-float">
        <div className="w-full h-full animate-poofy-breathe relative">
          {/* Ambient Glowing Aura */}
          <div className="absolute inset-0 rounded-full bg-blue-400/30 dark:bg-blue-500/35 blur-md scale-95" />

          {/* SVG Fluffy Puffy Character */}
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full drop-shadow-md overflow-visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Soft Puffy Body Gradient */}
              <linearGradient id="poofyBodyGrad" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#93C5FD" />
                <stop offset="45%" stopColor="#60A5FA" />
                <stop offset="100%" stopColor="#3B82F6" />
              </linearGradient>

              {/* Light Puff Highlight */}
              <linearGradient id="poofyHighlight" x1="50" y1="15" x2="50" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>

              {/* Soft Blush Gradient */}
              <radialGradient id="blushGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FB7185" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#FB7185" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Puffy Cloud-like Fluff Bumps (Around Body) */}
            <g className="transition-transform duration-300">
              {/* Side Fluffs */}
              <circle cx="22" cy="46" r="14" fill="url(#poofyBodyGrad)" opacity="0.9" />
              <circle cx="78" cy="46" r="14" fill="url(#poofyBodyGrad)" opacity="0.9" />
              <circle cx="28" cy="30" r="12" fill="url(#poofyBodyGrad)" opacity="0.9" />
              <circle cx="72" cy="30" r="12" fill="url(#poofyBodyGrad)" opacity="0.9" />
              <circle cx="30" cy="68" r="13" fill="url(#poofyBodyGrad)" opacity="0.9" />
              <circle cx="70" cy="68" r="13" fill="url(#poofyBodyGrad)" opacity="0.9" />

              {/* Main Fluffy Round Ball Body */}
              <circle cx="50" cy="50" r="38" fill="url(#poofyBodyGrad)" />

              {/* Soft Top/Center Sheen */}
              <ellipse cx="50" cy="32" rx="22" ry="12" fill="url(#poofyHighlight)" />

              {/* Cute Pink Blush Cheeks */}
              <circle cx="26" cy="58" r="7" fill="url(#blushGrad)" />
              <circle cx="74" cy="58" r="7" fill="url(#blushGrad)" />

              {/* Eyes Expression System */}
              {mood === 'happy' || mood === 'focus' ? (
                /* Happy inverted arcs ^ ^ */
                <g stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" fill="none">
                  <path d="M 33 50 Q 39 43 45 50" />
                  <path d="M 55 50 Q 61 43 67 50" />
                </g>
              ) : mood === 'sleepy' ? (
                /* Sleepy sweet lines - - */
                <g stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" fill="none">
                  <line x1="33" y1="50" x2="45" y2="50" />
                  <line x1="55" y1="50" x2="67" y2="50" />
                </g>
              ) : mood === 'thinking' ? (
                /* Thinking eyes looking up */
                <g className="animate-poofy-blink">
                  <ellipse cx="40" cy="45" rx="3.5" ry="6" fill="#0F172A" />
                  <ellipse cx="62" cy="45" rx="3.5" ry="6" fill="#0F172A" />
                  {/* Eye Highlights */}
                  <circle cx="41.5" cy="43" r="1.5" fill="#FFFFFF" />
                  <circle cx="63.5" cy="43" r="1.5" fill="#FFFFFF" />
                </g>
              ) : mood === 'worried' ? (
                /* Worried / concerned eyes */
                <g className="animate-poofy-blink">
                  <ellipse cx="38" cy="52" rx="4" ry="6.5" fill="#0F172A" />
                  <ellipse cx="62" cy="52" rx="4" ry="6.5" fill="#0F172A" />
                  {/* Catchlights */}
                  <circle cx="39" cy="50" r="1.8" fill="#FFFFFF" />
                  <circle cx="63" cy="50" r="1.8" fill="#FFFFFF" />
                </g>
              ) : mood === 'curious' ? (
                /* Curious round sparkling eyes */
                <g className="animate-poofy-blink">
                  <ellipse cx="37" cy="48" rx="5" ry="6.5" fill="#0F172A" />
                  <ellipse cx="61" cy="48" rx="5" ry="6.5" fill="#0F172A" />
                  {/* Big cute highlights */}
                  <circle cx="39" cy="46" r="2.2" fill="#FFFFFF" />
                  <circle cx="63" cy="46" r="2.2" fill="#FFFFFF" />
                  <circle cx="35.5" cy="51" r="1" fill="#FFFFFF" opacity="0.8" />
                  <circle cx="59.5" cy="51" r="1" fill="#FFFFFF" opacity="0.8" />
                </g>
              ) : eyeStyle === 'round' ? (
                /* Round glossy button eyes */
                <g className="animate-poofy-blink">
                  <circle cx="39" cy="49" r="4.8" fill="#0F172A" />
                  <circle cx="40.8" cy="47.2" r="1.8" fill="#FFFFFF" />
                  <circle cx="61" cy="49" r="4.8" fill="#0F172A" />
                  <circle cx="62.8" cy="47.2" r="1.8" fill="#FFFFFF" />
                </g>
              ) : (
                /* Default / Idle: Two tiny cute glossy vertical pill eyes */
                <g className="animate-poofy-blink">
                  {/* Left Eye */}
                  <rect x="36" y="44" width="7" height="12" rx="3.5" fill="#0F172A" />
                  <circle cx="38.5" cy="46.5" r="1.8" fill="#FFFFFF" />
                  <circle cx="40.5" cy="52" r="1" fill="#FFFFFF" opacity="0.7" />

                  {/* Right Eye */}
                  <rect x="57" y="44" width="7" height="12" rx="3.5" fill="#0F172A" />
                  <circle cx="59.5" cy="46.5" r="1.8" fill="#FFFFFF" />
                  <circle cx="61.5" cy="52" r="1" fill="#FFFFFF" opacity="0.7" />
                </g>
              )}

              {/* Tiny Cute Mouth / Expression */}
              {mood === 'happy' || mood === 'talking' ? (
                <path
                  d="M 46 59 Q 50 64 54 59"
                  stroke="#0F172A"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : mood === 'thinking' || mood === 'curious' ? (
                <circle cx="50" cy="60" r="1.8" fill="#0F172A" />
              ) : mood === 'worried' ? (
                <path
                  d="M 47 62 Q 50 59 53 62"
                  stroke="#0F172A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : (
                /* Small discreet smile */
                <path
                  d="M 47 58 Q 50 61 53 58"
                  stroke="#0F172A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              )}

              {/* Cute Little Fluffy Front Paws */}
              <ellipse cx="36" cy="72" rx="7" ry="5" fill="url(#poofyBodyGrad)" opacity="0.95" />
              <ellipse cx="64" cy="72" rx="7" ry="5" fill="url(#poofyBodyGrad)" opacity="0.95" />
            </g>

            {/* Sparkles when thinking or excited */}
            {showSparkles && (mood === 'happy' || mood === 'thinking' || mood === 'focus' || mood === 'curious') && (
              <g className="animate-pulse">
                {/* Top Right Sparkle */}
                <path
                  d="M 84 18 L 86 24 L 92 26 L 86 28 L 84 34 L 82 28 L 76 26 L 82 24 Z"
                  fill="#FBBF24"
                />
                {/* Top Left Sparkle */}
                <path
                  d="M 14 24 L 15.5 28 L 19.5 29.5 L 15.5 31 L 14 35 L 12.5 31 L 8.5 29.5 L 12.5 28 Z"
                  fill="#60A5FA"
                />
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};
