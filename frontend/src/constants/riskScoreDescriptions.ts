/**
 * Risk score descriptions derived from OS 18 Řízení rizik.pdf
 * Used to display contextual help in the Risk form when setting probability and impact levels.
 */

export interface ScoreDescription {
    labelKey: string;
    descriptionKey: string;
}

export interface ImpactDescription extends ScoreDescription {
    /** Percentage range [min, max] of total assets for financial loss */
    percentRange: [number, number];
}

/**
 * Probability of Occurrence descriptions (1-5 scale)
 */
export const PROBABILITY_DESCRIPTIONS: Record<number, ScoreDescription> = {
    5: { labelKey: 'risks:form.probability.5.label', descriptionKey: 'risks:form.probability.5.description' },
    4: { labelKey: 'risks:form.probability.4.label', descriptionKey: 'risks:form.probability.4.description' },
    3: { labelKey: 'risks:form.probability.3.label', descriptionKey: 'risks:form.probability.3.description' },
    2: { labelKey: 'risks:form.probability.2.label', descriptionKey: 'risks:form.probability.2.description' },
    1: { labelKey: 'risks:form.probability.1.label', descriptionKey: 'risks:form.probability.1.description' },
};

/**
 * Impact Severity descriptions (1-5 scale)
 * percentRange values are used to calculate financial loss amounts
 */
export const IMPACT_DESCRIPTIONS: Record<number, ImpactDescription> = {
    5: {
        labelKey: 'risks:form.impact.5.label',
        descriptionKey: 'risks:form.impact.5.description',
        percentRange: [5, 100]
    },
    4: {
        labelKey: 'risks:form.impact.4.label',
        descriptionKey: 'risks:form.impact.4.description',
        percentRange: [1, 5]
    },
    3: {
        labelKey: 'risks:form.impact.3.label',
        descriptionKey: 'risks:form.impact.3.description',
        percentRange: [0.1, 1]
    },
    2: {
        labelKey: 'risks:form.impact.2.label',
        descriptionKey: 'risks:form.impact.2.description',
        percentRange: [0, 0.1]
    },
    1: {
        labelKey: 'risks:form.impact.1.label',
        descriptionKey: 'risks:form.impact.1.description',
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
export function formatFinancialRange(level: number, totalAssets: number, noFinancialLossLabel = 'No financial loss'): string {
    const impact = IMPACT_DESCRIPTIONS[level];
    if (!impact) return '';

    const [minPercent, maxPercent] = impact.percentRange;

    if (minPercent === 0 && maxPercent === 0) {
        return noFinancialLossLabel;
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
