/**
 * Read-access denial for registers, dashboards and admin routes (DS-17).
 *
 * Alias of the shared `AccessDeniedState` (`components/ui/state.tsx`, audit
 * §4.15) so there is one access-denied implementation; new callers import
 * `AccessDeniedState` directly.
 */
export { AccessDeniedState as ReadAccessDeniedState } from '@/components/ui/state';
export type { AccessDeniedStateProps as ReadAccessDeniedStateProps } from '@/components/ui/state';
