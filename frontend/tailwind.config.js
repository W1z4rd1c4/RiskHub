/**
 * Design tokens for the UI contract (docs/audits/2026-09-30-frontend-ui-consistency-audit.md
 * §4, ADR-015 Addendum 1). Colours resolve to the per-theme CSS custom properties in
 * src/index.css; themes switch only by the root class (`theme-riskhub | theme-dark |
 * theme-light`), so there is no `darkMode` setting and no `dark:` variant (D14).
 *
 * Icon size roles (audit §4.6, DS-30; lucide icons only):
 *   size-4  inline icons and icons inside buttons (Button forces [&_svg]:size-4)
 *   size-5  section-header icons and the dialog close button
 *   size-8  page-state spinners (loading / pending)
 *   size-12 empty-state and access-denied illustrations
 *
 * @type {import('tailwindcss').Config}
 */
export default {
	content: [
		"./index.html",
		"./src/**/*.{js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			// D6: `font-heading` is the display face (page/section/dialog titles, KPI values).
			fontFamily: {
				sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
				heading: ['"Outfit Variable"', '"Inter Variable"', 'sans-serif']
			},
			// D6 (amended 2026-10-01): 11px is the floor, used only by `.text-eyebrow`
			// (src/index.css) and the compact `Badge size="sm"`.
			fontSize: {
				'2xs': ['0.6875rem', { lineHeight: '1rem' }]
			},
			// D14 / §3.1: bare `rounded` = 8px; ordinary controls use `rounded-lg` (12px),
			// compact controls `rounded-md` (10px), nested panels `rounded-xl` (14px),
			// cards and dialogs `rounded-2xl` (16px). No `rounded-3xl`, no arbitrary radius.
			borderRadius: {
				DEFAULT: 'var(--radius-sm)',
				sm: 'var(--radius-sm)',
				md: 'var(--radius-md)',
				lg: 'var(--radius-lg)',
				xl: 'var(--radius-xl)',
				'2xl': 'var(--radius-2xl)'
			},
			// Both keys share a name with a colour key, so Tailwind also emits a shadow-colour
			// rule for them; a var() value keeps that rule from recolouring the shadow.
			boxShadow: {
				glass: 'var(--glass-shadow)',
				popover: 'var(--popover-shadow)'
			},
			// DS-27: named stacking layers; never `z-[N]`.
			zIndex: {
				sidebar: '40',
				header: '45',
				skiplink: '60',
				overlay: '9000',
				modal: '9999',
				'modal-overlay': '10000',
				popover: '10050',
				toast: '10100'
			},
			// DS-31: `transition-colors duration-base` by default; no `transition-all`.
			transitionDuration: {
				fast: '150ms',
				base: '200ms',
				slow: '300ms'
			},
			// D11: one content width app-wide, a narrower one for forms.
			maxWidth: {
				page: '1520px',
				form: '960px',
				prose: '72ch'
			},
			// The `foreground` keys of card / nested / glass (and glass `hover-border`) are the
			// documented, contrast-tested surface/foreground pairs (statusTokenContrast.test.ts)
			// for the Phase 1 primitives; `ui/card.tsx` `tone="nested"` uses `nested-foreground`.
			colors: {
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				nested: {
					DEFAULT: 'hsl(var(--nested))',
					foreground: 'hsl(var(--nested-foreground))'
				},
				glass: {
					DEFAULT: 'hsl(var(--glass))',
					foreground: 'hsl(var(--glass-foreground))',
					hover: 'hsl(var(--glass-hover))',
					'hover-border': 'hsl(var(--glass-hover-border))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
					hover: 'hsl(var(--accent-hover))',
					text: 'hsl(var(--accent-text))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
					text: 'hsl(var(--success-text))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))',
					text: 'hsl(var(--warning-text))'
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))'
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				'icon-muted': 'hsl(var(--icon-muted))',
				// D3: always with an opacity step (`bg-tint/5`, `border-tint/10`); replaces `*-white/N`.
				tint: 'hsl(var(--tint))',
				// Dialog backdrop: `bg-overlay` carries the per-theme alpha.
				overlay: 'hsl(var(--overlay) / var(--overlay-alpha))',
				// D1: the orange "high" band of the 4-step severity scale.
				'severity-high': {
					DEFAULT: 'hsl(var(--severity-high))',
					foreground: 'hsl(var(--severity-high-foreground))',
					text: 'hsl(var(--severity-high-text))'
				},
				// Categorical chart series (read in JS through lib/cssTokens.ts).
				chart: {
					1: 'hsl(var(--chart-1))',
					2: 'hsl(var(--chart-2))',
					3: 'hsl(var(--chart-3))',
					4: 'hsl(var(--chart-4))',
					5: 'hsl(var(--chart-5))',
					6: 'hsl(var(--chart-6))',
					7: 'hsl(var(--chart-7))',
					8: 'hsl(var(--chart-8))'
				},
				// Sequential heatmap: `bg-heat-N text-heat-N-foreground`.
				heat: {
					0: { DEFAULT: 'hsl(var(--heat-0))', foreground: 'hsl(var(--heat-0-foreground))' },
					1: { DEFAULT: 'hsl(var(--heat-1))', foreground: 'hsl(var(--heat-1-foreground))' },
					2: { DEFAULT: 'hsl(var(--heat-2))', foreground: 'hsl(var(--heat-2-foreground))' },
					3: { DEFAULT: 'hsl(var(--heat-3))', foreground: 'hsl(var(--heat-3-foreground))' },
					4: { DEFAULT: 'hsl(var(--heat-4))', foreground: 'hsl(var(--heat-4-foreground))' }
				},
				'nav-active': {
					DEFAULT: 'hsl(var(--nav-active))',
					foreground: 'hsl(var(--nav-active-foreground))'
				},
				'nav-badge': {
					DEFAULT: 'hsl(var(--nav-badge))',
					foreground: 'hsl(var(--nav-badge-foreground))'
				},
				'badge-count': {
					DEFAULT: 'hsl(var(--badge-count))',
					foreground: 'hsl(var(--badge-count-foreground))'
				}
			}
		}
	},
	plugins: [
		require("tailwindcss-animate"),
		require("@tailwindcss/typography")
	],
}
