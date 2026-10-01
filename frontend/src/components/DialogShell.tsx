/**
 * @deprecated Legacy import path (audit 2026-09-30 §4.11, O8). `DialogShell`
 * lives in `@/components/ui/dialog` together with `DialogHeader`,
 * `DialogBody` and `DialogFooter`. This re-export keeps the existing call sites
 * working until they migrate (W6/W7); it is removed in Phase 4 (roadmap 4.3).
 * The dialog-inventory contract only allows re-exports in this file.
 */
export { DialogShell } from '@/components/ui/dialog';
export type { DialogShellProps } from '@/components/ui/dialog';
