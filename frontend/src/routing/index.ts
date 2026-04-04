import type { AppRouteDef, SidebarNavDef, SidebarRuntimeContext } from './types';
import { adminRoutes } from './admin';
import { businessRoutes } from './business';
import { coreProtectedRoutes, publicRoutes } from './core';

export type { AppRouteDef, SidebarBadgeKey, SidebarNavDef, SidebarRuntimeContext } from './types';

export const protectedAppRoutes: AppRouteDef[] = [
  ...coreProtectedRoutes,
  ...businessRoutes,
  ...adminRoutes,
];

export { publicRoutes };

export function getSidebarNavRoutes(context: SidebarRuntimeContext): Array<AppRouteDef & { nav: SidebarNavDef }> {
  return protectedAppRoutes
    .filter((route): route is AppRouteDef & { nav: SidebarNavDef } => Boolean(route.nav))
    .filter((route) => route.nav.isVisible(context))
    .sort((left, right) => {
      const leftOrder = context.authz.isPlatformAdmin ? (left.nav.adminOrder ?? Number.MAX_SAFE_INTEGER) : left.nav.order;
      const rightOrder = context.authz.isPlatformAdmin
        ? (right.nav.adminOrder ?? Number.MAX_SAFE_INTEGER)
        : right.nav.order;
      return leftOrder - rightOrder;
    });
}
