import { useQuery } from '@tanstack/react-query';
import { riskHubApi, type RiskType as RiskTypeConfig } from '@/services/riskHubApi';

// Fallback risk types when config is unavailable
const FALLBACK_RISK_TYPES: RiskTypeConfig[] = [
    {
        id: 0,
        code: 'operational',
        display_name: 'Operational',
        description: 'Operational risks',
        color: '#3b82f6',
        icon: null,
        sort_order: 1,
        is_active: true,
        is_system: true,
        risk_count: 0,
        created_at: '',
        updated_at: '',
    },
    {
        id: 0,
        code: 'strategic',
        display_name: 'Strategic',
        description: 'Strategic risks',
        color: '#8b5cf6',
        icon: null,
        sort_order: 2,
        is_active: true,
        is_system: true,
        risk_count: 0,
        created_at: '',
        updated_at: '',
    },
];

// Default thresholds
const DEFAULT_THRESHOLDS = {
    critical: 16,
    high: 10,
    medium: 5,
};

export interface RiskThresholds {
    critical: number;
    high: number;
    medium: number;
}

/**
 * Hook to fetch risk types from Risk Hub with fallback to system defaults
 */
export function useRiskTypes() {
    const query = useQuery({
        queryKey: ['riskHub', 'riskTypes'],
        queryFn: () => riskHubApi.getRiskTypes(),
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 2,
    });

    return {
        riskTypes: query.data?.length ? query.data : FALLBACK_RISK_TYPES,
        isLoading: query.isLoading,
        error: query.error,
        // Helper to get display name from code
        getDisplayName: (code: string) => {
            const types = query.data?.length ? query.data : FALLBACK_RISK_TYPES;
            const match = types.find(t => t.code === code);
            return match?.display_name || code;
        },
        // Helper to get color from code
        getColor: (code: string) => {
            const types = query.data?.length ? query.data : FALLBACK_RISK_TYPES;
            const match = types.find(t => t.code === code);
            return match?.color || '#64748b';
        },
    };
}

/**
 * Hook to fetch risk thresholds from Risk Hub config
 */
export function useRiskThresholds() {
    const query = useQuery({
        queryKey: ['riskHub', 'thresholds'],
        queryFn: async () => {
            try {
                const config = await riskHubApi.getAllConfig();
                const thresholdSettings = config['risk_thresholds'] || [];

                const getValue = (key: string, fallback: number): number => {
                    const setting = thresholdSettings.find(s => s.key === key);
                    return setting ? parseInt(setting.value, 10) : fallback;
                };

                return {
                    critical: getValue('risk_threshold_critical', DEFAULT_THRESHOLDS.critical),
                    high: getValue('risk_threshold_high', DEFAULT_THRESHOLDS.high),
                    medium: getValue('risk_threshold_medium', DEFAULT_THRESHOLDS.medium),
                };
            } catch {
                return DEFAULT_THRESHOLDS;
            }
        },
        staleTime: 5 * 60 * 1000,
        retry: 2,
    });

    return {
        thresholds: query.data || DEFAULT_THRESHOLDS,
        isLoading: query.isLoading,
        error: query.error,
        // Helper to get score color class based on thresholds
        getScoreColor: (score: number): string => {
            const t = query.data || DEFAULT_THRESHOLDS;
            if (score >= t.critical) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            if (score >= t.high) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
            if (score >= t.medium) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        },
        // Helper to get score color for matrix cells
        getMatrixCellColor: (score: number): string => {
            const t = query.data || DEFAULT_THRESHOLDS;
            if (score >= t.critical) return 'bg-rose-500/40 hover:bg-rose-500/60';
            if (score >= t.high) return 'bg-orange-500/40 hover:bg-orange-500/60';
            if (score >= t.medium) return 'bg-amber-500/40 hover:bg-amber-500/60';
            return 'bg-emerald-500/40 hover:bg-emerald-500/60';
        },
        // Helper to get score badge color
        getScoreBadgeColor: (score: number): string => {
            const t = query.data || DEFAULT_THRESHOLDS;
            if (score >= t.critical) return 'bg-rose-500/20 text-rose-400';
            if (score >= t.high) return 'bg-orange-500/20 text-orange-400';
            if (score >= t.medium) return 'bg-amber-500/20 text-amber-400';
            return 'bg-emerald-500/20 text-emerald-400';
        },
    };
}
