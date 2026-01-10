/**
 * Risk score descriptions derived from placeholder-risk-policy.pdf
 * Used to display contextual help in the Risk form when setting probability and impact levels.
 */

export interface ScoreDescription {
    label: string;
    description: string;
}

export interface ImpactDescription extends ScoreDescription {
    /** Percentage range [min, max] of total assets for financial loss */
    percentRange: [number, number];
}

/**
 * Probability of Occurrence descriptions (1-5 scale)
 */
export const PROBABILITY_DESCRIPTIONS: Record<number, ScoreDescription> = {
    5: { label: 'Extreme', description: 'Can occur multiple times per month' },
    4: { label: 'High', description: 'Can occur multiple times per year' },
    3: { label: 'Medium', description: 'Can occur once every 1+ years' },
    2: { label: 'Low', description: 'Can occur once every 10+ years' },
    1: { label: 'Unlikely', description: 'Can occur once every 100+ years' },
};

/**
 * Impact Severity descriptions (1-5 scale)
 * percentRange values are used to calculate financial loss amounts
 */
export const IMPACT_DESCRIPTIONS: Record<number, ImpactDescription> = {
    5: {
        label: 'Extreme',
        description: 'Threatens company existence',
        percentRange: [5, 100]
    },
    4: {
        label: 'High',
        description: 'Significantly affects company goals',
        percentRange: [1, 5]
    },
    3: {
        label: 'Medium',
        description: 'May notably affect operations',
        percentRange: [0.1, 1]
    },
    2: {
        label: 'Low',
        description: 'Minor impact on operations',
        percentRange: [0, 0.1]
    },
    1: {
        label: 'None',
        description: 'No impact on operations',
        percentRange: [0, 0]
    },
};

/**
 * Format a number as a currency string with K/M/B suffixes
 */
function formatCurrency(value: number): string {
    if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(value % 1_000_000_000 === 0 ? 0 : 1)}B`;
    }
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(0)}K`;
    }
    return value.toFixed(0);
}

/**
 * Format financial loss range for a given impact level and total assets value
 * @param level Impact level (1-5)
 * @param totalAssets Total company assets in CZK
 * @returns Formatted range string, e.g., "10M - 100M CZK"
 */
export function formatFinancialRange(level: number, totalAssets: number): string {
    const impact = IMPACT_DESCRIPTIONS[level];
    if (!impact) return '';

    const [minPercent, maxPercent] = impact.percentRange;

    if (minPercent === 0 && maxPercent === 0) {
        return 'No financial loss';
    }

    const minLoss = (minPercent / 100) * totalAssets;
    const maxLoss = (maxPercent / 100) * totalAssets;

    if (minPercent === 0) {
        return `0 - ${formatCurrency(maxLoss)} CZK`;
    }

    if (maxPercent >= 100) {
        return `>${formatCurrency(minLoss)} CZK`;
    }

    return `${formatCurrency(minLoss)} - ${formatCurrency(maxLoss)} CZK`;
}
