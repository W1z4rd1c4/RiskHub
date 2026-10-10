import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

// Flat ESM config sibling of the app (default export = the resolved config array).
import eslintConfig from '../../../../../frontend/eslint.config.js';

/**
 * G-ESLINT (audit 2026-09-30 §4.1, §5.5): the design clean-path block bans the
 * G-RATCHET patterns (white text, raw palette, white/black alpha, sub-11px text,
 * font-black, `dark:`, arbitrary colours) and raw form/table elements on the
 * module paths that reached zero (all of `src` since W9; the ui primitives keep
 * the class bans only), while keeping the base raw-ID and ADR-008 selectors
 * (flat-config rule arrays replace each other).
 */

type FlatConfigBlock = { files?: string[]; ignores?: string[]; rules?: Record<string, unknown> };

const blocks = eslintConfig as unknown as FlatConfigBlock[];

/** The full-ban block: every `src` file except the class-ban-only paths. */
function designBlock(): FlatConfigBlock {
    const block = blocks.find(
        (candidate) => candidate.files?.includes('src/**/*.{ts,tsx}')
            && (candidate.ignores ?? []).includes('src/components/ui/**/*.{ts,tsx}'),
    );
    expect(block).toBeDefined();
    return block as FlatConfigBlock;
}

/** The class-ban-only block: the ui primitives, which own the raw elements. */
function classOnlyBlock(): FlatConfigBlock {
    const block = blocks.find(
        (candidate) => candidate.files?.includes('src/components/ui/**/*.{ts,tsx}')
            && candidate.rules?.['no-restricted-syntax'] !== undefined,
    );
    expect(block).toBeDefined();
    return block as FlatConfigBlock;
}

function lint(code: string, block: FlatConfigBlock = designBlock()): string[] {
    const linter = new Linter({ configType: 'flat' });
    return linter.verify(code, [
        {
            files: ['**/*.jsx'],
            languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
            rules: { 'no-restricted-syntax': block.rules?.['no-restricted-syntax'] as Linter.RuleEntry },
        },
    ], 'probe.jsx').map((message) => message.message);
}

const jsx = (body: string) => `export const Probe = (props) => (<div>${body}</div>);`;

describe('eslint.config.js — G-ESLINT design clean paths', () => {
    it('covers all of src; only the ui primitives are class-ban-only (no pending exceptions)', () => {
        const block = designBlock();
        const classOnly = classOnlyBlock();
        expect(block.files).toEqual(['src/**/*.{ts,tsx}']);
        expect(block.ignores).toEqual(classOnly.files);
        expect(classOnly.files).toEqual(['src/components/ui/**/*.{ts,tsx}']);
    });

    it('keeps the class bans, but not the element bans, on the class-ban-only paths', () => {
        const classOnly = classOnlyBlock();
        expect(lint(jsx('<span className="text-white font-black">x</span>'), classOnly).length).toBeGreaterThanOrEqual(2);
        expect(lint(jsx('<button type="button">x</button>'), classOnly)).toEqual([]);
        const messages = lint('export const label = `RISK-${1}`;', classOnly);
        expect(messages.some((text) => /raw database IDs/.test(text))).toBe(true);
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
        ['<span className="transition-all duration-200">x</span>', /No transition-all/],
        ['<span className="hover:transition-all">x</span>', /No transition-all/],
        ['<button type="button">x</button>', /<Button>/],
        ['<input aria-label="x" />', /<Input> or <Checkbox>/],
        ['<input type="checkbox" aria-label="x" />', /<Input> or <Checkbox>/],
        ['<textarea aria-label="x" />', /<Textarea>/],
        ['<select aria-label="x"><option>1</option></select>', /<ThemedSelect> or <NativeSelect>/],
        ['<table><tbody><tr><td>1</td></tr></tbody></table>', /<SortableTable>/],
        ['<Table><tr onClick={props.open}><td>1</td></tr></Table>', /Mouse-only row activation/],
        ['<label>Orphan</label>', /Unassociated label/],
        // Roadmap 4.5: bypasses of the element bans.
        ['<motion.button type="button" onClick={props.go}>x</motion.button>', /Animated or namespaced raw element/],
        ['<motion.input aria-label="x" />', /Animated or namespaced raw element/],
        ['<motion.textarea aria-label="x" />', /Animated or namespaced raw element/],
        ['<motion.table><tbody /></motion.table>', /Animated or namespaced raw element/],
        ['<motion.tr onClick={props.open}><td>1</td></motion.tr>', /Mouse-only row activation/],
        ['<motion.a onClick={props.go}>x</motion.a>', /anchor without href/],
        ['<a onClick={props.go}>x</a>', /anchor without href/],
        ['<div role="button" tabIndex={0} onClick={props.go}>x</div>', /role="button"/],
        ["<span role={'button'}>x</span>", /role="button"/],
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
        '<motion.div whileHover={{ y: -2 }}><Button>x</Button></motion.div>',
        '<motion.a href="/x" onClick={props.track}>x</motion.a>',
        '<Card as="button" interactive onClick={props.go}>x</Card>',
        '<span className="transition-colors duration-base transition-[transform,opacity]">x</span>',
    ])('allows %s', (body) => {
        expect(lint(jsx(body))).toEqual([]);
    });

    it.each([
        "const MotionButton = motion.create('button');",
        'const MotionInput = motion("input");',
    ])('bans the factory bypass %s', (code) => {
        expect(lint(code).some((text) => /motion\.create\(\) of a raw element/.test(text))).toBe(true);
    });

    it('allows motion.create of a primitive component', () => {
        expect(lint('const MotionCard = motion.create(Card);')).toEqual([]);
    });

    it('keeps the raw-ID and ADR-008 selectors of the base block', () => {
        const messages = lint('export const label = `RISK-${1}`; export const band = (risk) => risk.net_score >= 16;');
        expect(messages.some((text) => /raw database IDs/.test(text))).toBe(true);
        expect(messages.some((text) => /ADR-008/.test(text))).toBe(true);
    });
});
