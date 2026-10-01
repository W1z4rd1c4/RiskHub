import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

// Flat ESM config sibling of the app (default export = the resolved config array).
import eslintConfig from '../../../../../frontend/eslint.config.js';

/**
 * PG-02 / ADR-008: the `no-restricted-syntax` threshold selectors must catch
 * hard-coded risk-score bands (the RiskQuickViewModal 20/12/6 map slipped past a
 * selector that only listed 5/10/15/16 and, matching `value` with a regex, could
 * never match a numeric literal at all), while legal 1-5 vendor scores, 1-4
 * control levels, computed member access and `> 0` guards stay clean.
 */

type FlatConfigBlock = { files?: string[]; rules?: Record<string, unknown> };

const ADR008_MESSAGE = /hardcode risk-score thresholds \(ADR-008\)/;

function restrictedSyntaxEntries(): unknown[] {
    const blocks = eslintConfig as unknown as FlatConfigBlock[];
    const withRule = blocks.filter((block) => block.rules?.['no-restricted-syntax']);
    expect(withRule.length).toBeGreaterThan(0);
    const entry = withRule[0].rules?.['no-restricted-syntax'];
    expect(Array.isArray(entry)).toBe(true);
    return entry as unknown[];
}

function adr008Hits(code: string): number {
    const linter = new Linter({ configType: 'flat' });
    const messages = linter.verify(code, [
        {
            files: ['**/*.js'],
            rules: { 'no-restricted-syntax': restrictedSyntaxEntries() as Linter.RuleEntry },
        },
    ], 'probe.js');
    return messages.filter((message) => ADR008_MESSAGE.test(message.message)).length;
}

describe('eslint.config.js — ADR-008 risk-score threshold selectors', () => {
    it.each([
        ['level >= 20', 'bare level, old quick-view critical band'],
        ['level >= 12', 'bare level, old quick-view high band'],
        ['level >= 6', 'bare level, old quick-view medium band'],
        ['score >= 16', 'bare score, default critical'],
        ['risk.net_score >= 5', 'net score member, default medium'],
        ['risk.gross_score > 9', 'gross score member, any positive integer'],
        ['item.risk_score < 10', 'risk_score member, any relational operator'],
        ['16 <= risk.net_score', 'reversed operand order'],
    ])('flags %s (%s)', (expression) => {
        expect(adr008Hits(`export const x = ${expression};`)).toBe(1);
    });

    it.each([
        ['score >= 5', '1-5 vendor score scale'],
        ['level >= 4', '1-4 control risk level'],
        ['risk.net_score > 0', 'presence guard'],
        ['entry[score] > 0', 'computed member access keyed by a variable named score'],
        ['vendor.risk_score_1_5 >= 5', 'different property name'],
        ['risk.net_score >= thresholds.critical', 'threshold from configuration'],
    ])('does not flag %s (%s)', (expression) => {
        expect(adr008Hits(`export const x = ${expression};`)).toBe(0);
    });

    it('applies the same ADR-008 selectors in every no-restricted-syntax block', () => {
        const blocks = (eslintConfig as unknown as FlatConfigBlock[]).filter(
            (block) => block.rules?.['no-restricted-syntax'],
        );
        const selectorSets = blocks.map((block) => JSON.stringify(
            (block.rules?.['no-restricted-syntax'] as unknown[])
                .filter((entry): entry is { selector: string; message: string } => (
                    typeof entry === 'object' && entry !== null && ADR008_MESSAGE.test((entry as { message: string }).message)
                ))
                .map((entry) => entry.selector),
        ));
        expect(new Set(selectorSets).size).toBe(1);
        expect(JSON.parse(selectorSets[0]) as string[]).toHaveLength(4);
    });
});
