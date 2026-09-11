import type { Role } from '@/lib/contracts';
import type { Route } from 'next';

export type AdminRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | null;

export function isStaffRole(role: Role): boolean {
  return role === 'MODERATOR' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function roleHome(role: Role, requestStatus: AdminRequestStatus = null): Route {
  if (isStaffRole(role)) return '/admin';
  if (requestStatus === 'PENDING') return '/dashboard?admin_request=pending' as Route;
  if (requestStatus === 'REJECTED') return '/dashboard?admin_request=rejected' as Route;
  return '/dashboard';
}
