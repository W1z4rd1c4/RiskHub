import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

// Flat ESM config sibling of the app (default export = the resolved config array).
import eslintConfig from '../../../../../frontend/eslint.config.js';

/**
 * G-ESLINT (audit 2026-09-30 §4.1, §5.5): the design clean-path block bans the
 * G-RATCHET patterns (white text, raw palette, white/black alpha, sub-11px text,
 * font-black, `dark:`, arbitrary colours) and raw form/table elements on the
 * module paths that reached zero, while keeping the base raw-ID and ADR-008
 * selectors (flat-config rule arrays replace each other).
 */

type FlatConfigBlock = { files?: string[]; ignores?: string[]; rules?: Record<string, unknown> };

function designBlock(): FlatConfigBlock {
    const block = (eslintConfig as unknown as FlatConfigBlock[]).find(
        (candidate) => candidate.files?.includes('src/pages/native/**/*.{ts,tsx}'),
    );
    expect(block).toBeDefined();
    return block as FlatConfigBlock;
}

function lint(code: string): string[] {
    const linter = new Linter({ configType: 'flat' });
    return linter.verify(code, [
        {
            files: ['**/*.jsx'],
            languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
            rules: { 'no-restricted-syntax': designBlock().rules?.['no-restricted-syntax'] as Linter.RuleEntry },
        },
    ], 'probe.jsx').map((message) => message.message);
}

const jsx = (body: string) => `export const Probe = (props) => (<div>${body}</div>);`;

describe('eslint.config.js — G-ESLINT design clean paths', () => {
    it('covers pages/native and the W8 module paths, with the later-wave files excluded', () => {
        const block = designBlock();
        expect(block.files).toEqual(expect.arrayContaining([
            'src/components/riskhub/**/*.{ts,tsx}',
            'src/pages/risks/**/*.{ts,tsx}',
            'src/pages/admin-console/**/*.{ts,tsx}',
            'src/pages/assets/**/*.{ts,tsx}',
        ]));
        expect(block.ignores).toContain('src/components/approvals/GovernedMutationDiff.tsx');
    });

    it.each([
        ['<span className="text-white">x</span>', /text-foreground/],
        ['<span className={`p-2 ${props.on ? "hover:text-white" : ""}`}>x</span>', /text-foreground/],
        ['<span className="text-red-500">x</span>', /Raw palette colour/],
        ['<span className="border-slate-200/50">x</span>', /Raw palette colour/],
        ['<span className="bg-white/10">x</span>', /White\/black alpha/],
        ['<span className="text-[10px]">x</span>', /11px floor/],
        ['<span className="font-black">x</span>', /font-black is retired/],
        ['<span className="dark:bg-card">x</span>', /No dark: variants/],
        ['<span className="bg-[#fff]">x</span>', /Arbitrary colour literal/],
        ['<button type="button">x</button>', /<Button>/],
        ['<input aria-label="x" />', /<Input> or <Checkbox>/],
        ['<input type="checkbox" aria-label="x" />', /<Input> or <Checkbox>/],
        ['<textarea aria-label="x" />', /<Textarea>/],
        ['<select aria-label="x"><option>1</option></select>', /<ThemedSelect> or <NativeSelect>/],
        ['<table><tbody><tr><td>1</td></tr></tbody></table>', /<SortableTable>/],
        ['<Table><tr onClick={props.open}><td>1</td></tr></Table>', /Mouse-only row activation/],
        ['<label>Orphan</label>', /Unassociated label/],
    ])('bans %s', (body, message) => {
        const messages = lint(jsx(body));
        expect(messages.some((text) => message.test(text))).toBe(true);
    });

    it.each([
        '<span className="text-foreground text-xs font-bold bg-tint/10 text-eyebrow">x</span>',
        '<Button variant="outline">x</Button>',
        '<input type="range" aria-label="x" />',
        '<input type="color" aria-label="x" />',
        '<label className="sr-only">wrap <input type="radio" aria-label="x" /></label>',
        '<label>Owner <NativeSelect value="" /></label>',
        '<label htmlFor="x">Owner</label>',
    ])('allows %s', (body) => {
        expect(lint(jsx(body))).toEqual([]);
    });

    it('keeps the raw-ID and ADR-008 selectors of the base block', () => {
        const messages = lint('export const label = `RISK-${1}`; export const band = (risk) => risk.net_score >= 16;');
        expect(messages.some((text) => /raw database IDs/.test(text))).toBe(true);
        expect(messages.some((text) => /ADR-008/.test(text))).toBe(true);
    });
});
