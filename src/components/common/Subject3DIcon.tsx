import React from 'react';
import {
  Dna,
  FlaskConical,
  Atom,
  Calculator,
  Globe2,
  Feather,
  BookMarked,
  Sparkles,
  Languages,
  HeartPulse,
  Landmark,
  GraduationCap,
  LucideIcon,
} from 'lucide-react';
import { SubjectInfo } from '../../types';
import { getSubject } from '../../lib/constants';

interface Subject3DIconProps {
  subject: string | SubjectInfo;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
  borderless?: boolean;
  boxed?: boolean;
}

// Clean, high-definition, transparent vector icons for every subject
// completely eliminates OS emoji square backgrounds (e.g. Windows/Android atom ⚛️ square tile)
const SUBJECT_VECTOR_ICONS: Record<string, LucideIcon> = {
  bio: Dna,
  chem: FlaskConical,
  phy: Atom,
  math: Calculator,
  geo: Globe2,
  lit: Feather,
  ar: BookMarked,
  din: Sparkles,
  eng: Languages,
  health: HeartPulse,
  social: Landmark,
};

export const Subject3DIcon: React.FC<Subject3DIconProps> = ({
  subject,
  size = 'sm',
  className = '',
  showTooltip = false,
  borderless = true,
  boxed = false,
}) => {
  const subj = typeof subject === 'string' ? getSubject(subject) : subject;
  const VectorIcon = subj?.id ? SUBJECT_VECTOR_ICONS[subj.id] : GraduationCap;

  const vectorSizes = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5 sm:w-6 sm:h-6',
    lg: 'w-7 h-7 sm:w-8 sm:h-8',
    xl: 'w-9 h-9 sm:w-10 sm:h-10',
  }[size];

  // Pure frameless/boxless Presentation - ZERO square artifacts, 100% transparent vector
  if (!boxed || borderless) {
    if (VectorIcon) {
      return (
        <span
          title={showTooltip ? `${subj.name} (${subj.categoryLabel || 'درس'})` : undefined}
          className={`inline-flex items-center justify-center shrink-0 select-none transition-transform duration-200 hover:scale-110 ${className}`}
        >
          <VectorIcon
            className={`${vectorSizes} drop-shadow-xs`}
            strokeWidth={2.4}
            style={{ color: 'inherit' }}
            aria-hidden="true"
          />
        </span>
      );
    }

    return (
      <span
        title={showTooltip ? `${subj.name} (${subj.categoryLabel || 'درس'})` : undefined}
        className={`inline-flex items-center justify-center shrink-0 select-none leading-none ${className}`}
        role="img"
        aria-label={subj.name}
      >
        {subj.icon3d || '📚'}
      </span>
    );
  }

  // Soft rounded pill presentation if boxed is specifically requested
  const sizeClasses = {
    xs: 'w-6 h-6 rounded-full',
    sm: 'w-7 h-7 rounded-full',
    md: 'w-9 h-9 rounded-full',
    lg: 'w-11 h-11 rounded-full',
    xl: 'w-14 h-14 rounded-full',
  }[size];

  return (
    <span
      title={showTooltip ? `${subj.name} (${subj.categoryLabel || 'درس'})` : undefined}
      className={`inline-flex items-center justify-center shrink-0 select-none relative transition-transform duration-200 hover:scale-105 ${sizeClasses} ${className}`}
      style={{
        backgroundColor: `${subj.color}15`,
        border: `1px solid ${subj.color}30`,
      }}
    >
      {VectorIcon ? (
        <VectorIcon
          className={`${vectorSizes}`}
          strokeWidth={2.2}
          style={{ color: subj.color }}
        />
      ) : (
        <span className="leading-none" role="img" aria-label={subj.name}>
          {subj.icon3d || '📚'}
        </span>
      )}
    </span>
  );
};
