import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { Authz, PermissionChecker } from '@/authz/policy';

export type SidebarBadgeKey = 'workflow' | 'orphanCount';

// Stable sidebar section keys (FR-P4-11). The rendered order of the groups is
// fixed by SIDEBAR_GROUP_ORDER in ./index.ts; localized labels live under the
// `groups.*` keys of the `navigation` i18n namespace.
export type SidebarGroupKey = 'overview' | 'registers' | 'ict_register' | 'administration';

export type SidebarRuntimeContext = {
  authz: Authz;
  hasPermission: PermissionChecker;
};

export type SidebarNavDef = {
  href: string;
  labelKey: string;
  supportingTermKey?: string;
  icon: LucideIcon;
  group: SidebarGroupKey;
  isVisible: (context: SidebarRuntimeContext) => boolean;
  order: number;
  adminOrder?: number;
  badgeKey?: SidebarBadgeKey;
};

export type AppRouteDef = {
  key: string;
  path?: string;
  index?: boolean;
  element: ReactElement;
  nav?: SidebarNavDef;
};
