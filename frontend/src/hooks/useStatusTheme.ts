import { useMemo } from 'react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

interface StatusTheme {
  control: {
    highText: string;
    mediumText: string;
    lowText: string;
    neutralText: string;
    highGauge: string;
    mediumGauge: string;
    lowGauge: string;
    neutralGauge: string;
  };
  kri: {
    withinGauge: string;
    warningGauge: string;
    breachGauge: string;
  };
  matrix: {
    emptyCell: string;
    low: string;
    medium: string;
    high: string;
    critical: string;
  };
  effects: {
    accentSoft: string;
    accentMedium: string;
    dangerSoft: string;
  };
}

const STATUS_THEMES: Record<Theme, StatusTheme> = {
  riskhub: {
    control: {
      highText: 'text-emerald-400',
      mediumText: 'text-amber-400',
      lowText: 'text-rose-400',
      neutralText: 'text-slate-400',
      highGauge: 'bg-emerald-500 shadow-lg shadow-emerald-500/35',
      mediumGauge: 'bg-amber-500 shadow-lg shadow-amber-500/35',
      lowGauge: 'bg-rose-500 shadow-lg shadow-rose-500/35',
      neutralGauge: 'bg-slate-500 shadow-lg shadow-slate-500/35',
    },
    kri: {
      withinGauge: 'bg-emerald-500 shadow-lg shadow-emerald-500/35',
      warningGauge: 'bg-amber-500 shadow-lg shadow-amber-500/35',
      breachGauge: 'bg-rose-500 shadow-lg shadow-rose-500/35',
    },
    matrix: {
      emptyCell: 'rgba(255, 255, 255, 0.02)',
      low: 'rgba(16, 185, 129, 0.40)',
      medium: 'rgba(245, 158, 11, 0.40)',
      high: 'rgba(249, 115, 22, 0.40)',
      critical: 'rgba(244, 63, 94, 0.40)',
    },
    effects: {
      accentSoft: 'shadow-lg shadow-accent/20',
      accentMedium: 'shadow-lg shadow-accent/30',
      dangerSoft: 'shadow-lg shadow-rose-500/20',
    },
  },
  dark: {
    control: {
      highText: 'text-emerald-300',
      mediumText: 'text-amber-300',
      lowText: 'text-rose-300',
      neutralText: 'text-slate-300',
      highGauge: 'bg-emerald-400 shadow-lg shadow-emerald-400/40',
      mediumGauge: 'bg-amber-400 shadow-lg shadow-amber-400/40',
      lowGauge: 'bg-rose-400 shadow-lg shadow-rose-400/40',
      neutralGauge: 'bg-slate-400 shadow-lg shadow-slate-400/35',
    },
    kri: {
      withinGauge: 'bg-emerald-400 shadow-lg shadow-emerald-400/40',
      warningGauge: 'bg-amber-400 shadow-lg shadow-amber-400/40',
      breachGauge: 'bg-rose-400 shadow-lg shadow-rose-400/40',
    },
    matrix: {
      emptyCell: 'rgba(255, 255, 255, 0.03)',
      low: 'rgba(74, 222, 128, 0.45)',
      medium: 'rgba(251, 191, 36, 0.45)',
      high: 'rgba(251, 146, 60, 0.45)',
      critical: 'rgba(251, 113, 133, 0.45)',
    },
    effects: {
      accentSoft: 'shadow-lg shadow-cyan-400/25',
      accentMedium: 'shadow-lg shadow-cyan-400/35',
      dangerSoft: 'shadow-lg shadow-rose-400/25',
    },
  },
  light: {
    control: {
      highText: 'text-emerald-700',
      mediumText: 'text-amber-700',
      lowText: 'text-rose-700',
      neutralText: 'text-slate-600',
      highGauge: 'bg-emerald-600 shadow-md shadow-emerald-600/30',
      mediumGauge: 'bg-amber-600 shadow-md shadow-amber-600/30',
      lowGauge: 'bg-rose-600 shadow-md shadow-rose-600/30',
      neutralGauge: 'bg-slate-500 shadow-md shadow-slate-500/30',
    },
    kri: {
      withinGauge: 'bg-emerald-600 shadow-md shadow-emerald-600/30',
      warningGauge: 'bg-amber-600 shadow-md shadow-amber-600/30',
      breachGauge: 'bg-rose-600 shadow-md shadow-rose-600/30',
    },
    matrix: {
      emptyCell: 'rgba(0, 0, 0, 0.03)',
      low: 'rgba(22, 163, 74, 0.35)',
      medium: 'rgba(217, 119, 6, 0.35)',
      high: 'rgba(234, 88, 12, 0.35)',
      critical: 'rgba(220, 38, 38, 0.35)',
    },
    effects: {
      accentSoft: 'shadow-md shadow-blue-600/20',
      accentMedium: 'shadow-md shadow-blue-600/30',
      dangerSoft: 'shadow-md shadow-rose-600/20',
    },
  },
};

export function useStatusTheme(): StatusTheme {
  const { theme } = useTheme();
  return useMemo(() => STATUS_THEMES[theme], [theme]);
}
