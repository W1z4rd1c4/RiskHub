import { useQuery } from '@tanstack/react-query';
import { riskScoreVariantClass } from '@/lib/riskScoreTheme';
import { riskHubApi, type PublicRiskType } from '@/services/riskHubApi';

// Internal type that matches what the rest of the app expects
// Maps PublicRiskType to a fuller shape with defaults for unused fields
interface RiskTypeDisplay {
    code: string;
    display_name: string;
    color: string;
    icon: string | null;
    sort_order: number;
}

// Fallback risk types when config is unavailable
const FALLBACK_RISK_TYPES: RiskTypeDisplay[] = [
    {
        code: 'operational',
        display_name: 'Operational',
        color: '#3b82f6',
        icon: null,
        sort_order: 1,
    },
    {
        code: 'strategic',
        display_name: 'Strategic',
        color: '#8b5cf6',
        icon: null,
        sort_order: 2,
    },
];

// Default thresholds (matching backend seed values)
const DEFAULT_THRESHOLDS = {
    critical: 16,
    high: 10,
    medium: 5,
};

// Correct config keys as seeded by Risk Hub
const THRESHOLD_KEYS = {
    critical: 'critical_risk_min_net_score',
    high: 'high_risk_min_net_score',
    medium: 'medium_risk_min_net_score',
} as const;

export interface RiskThresholds {
    critical: number;
    high: number;
    medium: number;
}

/**
 * Hook to fetch risk types from Risk Hub (public endpoint) with fallback to system defaults.
 * Uses `/riskhub/public-risk-types` which is accessible to all authenticated users.
 */
export function useRiskTypes() {
    const query = useQuery({
        queryKey: ['riskHub', 'publicRiskTypes'],
        queryFn: () => riskHubApi.getPublicRiskTypes(),
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 2,
    });

    // Map PublicRiskType to our internal display type
    const riskTypes: RiskTypeDisplay[] = query.data?.length
        ? query.data.map((t: PublicRiskType) => ({
            code: t.code,
            display_name: t.display_name,
            color: t.color,
            icon: t.icon,
            sort_order: t.sort_order,
        }))
        : FALLBACK_RISK_TYPES;

    return {
        riskTypes,
        isLoading: query.isLoading,
        error: query.error,
        // Helper to get display name from code
        getDisplayName: (code: string) => {
            const match = riskTypes.find(t => t.code === code);
            return match?.display_name || code;
        },
        // Helper to get color from code
        getColor: (code: string) => {
            const match = riskTypes.find(t => t.code === code);
            return match?.color || '#64748b';
        },
        // Helper to get initials for compact badge (first 2 chars of code or first letter of each word)
        getInitials: (code: string) => {
            const match = riskTypes.find(t => t.code === code);
            if (!match) return code.substring(0, 2).toUpperCase();
            // Try to get initials from display name (e.g., "IT Security" -> "IS")
            const words = match.display_name.split(/\s+/);
            if (words.length >= 2) {
                return words.map(w => w[0]).join('').substring(0, 2).toUpperCase();
            }
            // Otherwise use first 2 chars of display name
            return match.display_name.substring(0, 2).toUpperCase();
        },
    };
}

/**
 * Hook to fetch risk thresholds from Risk Hub config.
 * Uses `/riskhub/public-config/{key}` which is accessible to all authenticated users.
 * Uses the correct seeded keys: critical_risk_min_net_score, high_risk_min_net_score, medium_risk_min_net_score
 */
export function useRiskThresholds() {
    const query = useQuery({
        queryKey: ['riskHub', 'thresholds', 'public'],
        queryFn: async () => {
            try {
                // Fetch all threshold values in parallel using public-config endpoint
                const [critical, high, medium] = await Promise.all([
                    riskHubApi.getConfigValue(THRESHOLD_KEYS.critical).catch(() => null),
                    riskHubApi.getConfigValue(THRESHOLD_KEYS.high).catch(() => null),
                    riskHubApi.getConfigValue(THRESHOLD_KEYS.medium).catch(() => null),
                ]);

                // Parse values robustly
                const parseValue = (result: { value: unknown } | null, fallback: number): number => {
                    if (!result) return fallback;
                    const val = result.value;
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        const parsed = parseInt(val, 10);
                        return isNaN(parsed) ? fallback : parsed;
                    }
                    return fallback;
                };

                return {
                    critical: parseValue(critical, DEFAULT_THRESHOLDS.critical),
                    high: parseValue(high, DEFAULT_THRESHOLDS.high),
                    medium: parseValue(medium, DEFAULT_THRESHOLDS.medium),
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
            return riskScoreVariantClass('badge', score, t);
        },
        // Helper to get score color for matrix cells
        getMatrixCellColor: (score: number): string => {
            const t = query.data || DEFAULT_THRESHOLDS;
            return riskScoreVariantClass('matrix-cell', score, t);
        },
        // Helper to get score badge color
        getScoreBadgeColor: (score: number): string => {
            const t = query.data || DEFAULT_THRESHOLDS;
            return riskScoreVariantClass('card', score, t);
        },
    };
}

/**
 * Default total assets value (10B CZK) - used when config not available
 */
const DEFAULT_TOTAL_ASSETS = 10_000_000_000;

/**
 * Hook to fetch total assets value from Risk Hub config.
 * Used for calculating financial loss ranges in risk impact descriptions.
 */
export function useTotalAssetsValue() {
    const query = useQuery({
        queryKey: ['riskHub', 'config', 'total_assets_value'],
        queryFn: async () => {
            try {
                const result = await riskHubApi.getConfigValue('total_assets_value');
                if (!result) return DEFAULT_TOTAL_ASSETS;

                const val = result.value;
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                    const parsed = parseInt(val, 10);
                    return isNaN(parsed) ? DEFAULT_TOTAL_ASSETS : parsed;
                }
                return DEFAULT_TOTAL_ASSETS;
            } catch {
                return DEFAULT_TOTAL_ASSETS;
            }
        },
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 2,
    });

    return {
        totalAssets: query.data ?? DEFAULT_TOTAL_ASSETS,
        isLoading: query.isLoading,
        error: query.error,
    };
}
