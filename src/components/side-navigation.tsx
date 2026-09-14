'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

export type SideNavigationItem =
  | { kind: 'group'; label: string }
  | { kind: 'link'; label: string; href: string; note?: string };

export function SideNavigation({
  items,
  label,
}: {
  items: SideNavigationItem[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label={label}>
      {items.map((item, index) => {
        if (item.kind === 'group') {
          return (
            <span className="nav-group" key={`${item.label}-${index}`}>
              {item.label}
            </span>
          );
        }
        const active =
          pathname === item.href ||
          (item.href !== '/admin' && item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href as Route}
            className={active ? 'active' : undefined}
            aria-current={active ? 'page' : undefined}
          >
            <span>{item.label}</span>
            {item.note ? <small>{item.note}</small> : null}
          </Link>
        );
      })}
    </nav>
  );
}
