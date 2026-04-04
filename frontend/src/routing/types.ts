import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { Authz, PermissionChecker } from '@/authz/policy';

export type SidebarBadgeKey = 'workflow' | 'orphanCount';

export type SidebarRuntimeContext = {
  authz: Authz;
  hasPermission: PermissionChecker;
};

export type SidebarNavDef = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
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
