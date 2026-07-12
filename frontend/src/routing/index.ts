import type { AppRouteDef, SidebarGroupKey, SidebarNavDef, SidebarRuntimeContext } from './types';
import { adminRoutes } from './admin';
import { businessRoutes } from './business';
import { coreProtectedRoutes, publicRoutes } from './core';

export type { AppRouteDef, SidebarBadgeKey, SidebarGroupKey, SidebarNavDef, SidebarRuntimeContext } from './types';

export const protectedAppRoutes: AppRouteDef[] = [
  ...coreProtectedRoutes,
  ...businessRoutes,
  ...adminRoutes,
];

export { publicRoutes };

export type SidebarNavRoute = AppRouteDef & { nav: SidebarNavDef };

// Fixed render order of the sidebar sections (FR-P4-11). Groups are always
// rendered in this order; a group with no visible items is omitted entirely
// (FR-P4-10). Intra-group order is inherited from getSidebarNavRoutes' sort.
export const SIDEBAR_GROUP_ORDER: readonly SidebarGroupKey[] = [
  'overview',
  'registers',
  'ict_register',
  'administration',
];

export type SidebarNavGroup = {
  group: SidebarGroupKey;
  items: SidebarNavRoute[];
};

export function getSidebarNavRoutes(context: SidebarRuntimeContext): SidebarNavRoute[] {
  return protectedAppRoutes
    .filter((route): route is SidebarNavRoute => Boolean(route.nav))
    .filter((route) => route.nav.isVisible(context))
    .sort((left, right) => {
      const leftOrder = context.authz.isPlatformAdmin ? (left.nav.adminOrder ?? Number.MAX_SAFE_INTEGER) : left.nav.order;
      const rightOrder = context.authz.isPlatformAdmin
        ? (right.nav.adminOrder ?? Number.MAX_SAFE_INTEGER)
        : right.nav.order;
      return leftOrder - rightOrder;
    });
}

/**
 * Buckets the visible, order-sorted sidebar routes into their sections and
 * returns the groups in SIDEBAR_GROUP_ORDER. Empty groups are omitted
 * (FR-P4-10); each group's items keep the relative order produced by
 * getSidebarNavRoutes (FR-P4-9). Visibility/capability filtering is fully
 * delegated to getSidebarNavRoutes so there is a single source of truth.
 */
export function getGroupedSidebarNav(context: SidebarRuntimeContext): SidebarNavGroup[] {
  const routes = getSidebarNavRoutes(context);

  return SIDEBAR_GROUP_ORDER.map((group) => ({
    group,
    items: routes.filter((route) => route.nav.group === group),
  })).filter((section) => section.items.length > 0);
}

/**
 * Resolves which sidebar href should read as active for the current pathname
 * (FR-P4-2, finding S3). An item matches when the pathname equals its href or
 * is nested beneath it (`/risks/42`, `/risks/42/edit`). The longest match wins
 * so nested siblings like `/admin` and `/admin/docs` never both highlight, and
 * the root href (`/`) only matches an exact `/` so it never swallows every route.
 */
export function resolveActiveSidebarHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;

  for (const href of hrefs) {
    const matches = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }

  return best;
}
