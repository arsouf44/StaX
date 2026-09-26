'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, cn } from '@stax/ui';
import type { PlatformRole } from '@stax/types';

/**
 * Navigation du back-office.
 *
 * Le filtrage par role est un CONFORT : chaque page revalide ses droits, et la
 * RLS refuserait de toute facon les lignes. Masquer une entree evite juste de
 * proposer une porte fermee.
 */

interface AdminEntry {
  href: string;
  label: string;
  icon: string;
  minimum: PlatformRole;
}

const HIERARCHY: Record<PlatformRole, number> = {
  platform_owner: 100,
  platform_admin: 90,
  billing_admin: 60,
  developer: 50,
  designer: 40,
  support: 30,
};

const GROUPS: Array<{ label: string; items: AdminEntry[] }> = [
  {
    label: 'Pilotage',
    items: [
      { href: '/admin', label: 'Vue d’ensemble', icon: 'layout-dashboard', minimum: 'support' },
      { href: '/admin/activite', label: 'Journal', icon: 'history', minimum: 'platform_admin' },
      { href: '/admin/sante', label: 'État des services', icon: 'activity', minimum: 'support' },
    ],
  },
  {
    label: 'Ventes et clients',
    items: [
      {
        href: '/admin/messages',
        label: 'Messages clients',
        icon: 'message-circle',
        minimum: 'support',
      },
      {
        href: '/admin/propositions',
        label: 'Propositions',
        icon: 'send',
        minimum: 'platform_admin',
      },
      {
        href: '/admin/organisations',
        label: 'Organisations',
        icon: 'building',
        minimum: 'support',
      },
      { href: '/admin/sites', label: 'Sites', icon: 'globe', minimum: 'support' },
      { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: 'users', minimum: 'support' },
      { href: '/admin/domaines', label: 'Domaines', icon: 'map-pin', minimum: 'support' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/admin/commandes', label: 'Commandes', icon: 'receipt', minimum: 'support' },
      {
        href: '/admin/factures',
        label: 'Factures de vente',
        icon: 'file-text',
        minimum: 'billing_admin',
      },
      { href: '/admin/projets', label: 'Projets', icon: 'route', minimum: 'support' },
      { href: '/admin/devis', label: 'Devis', icon: 'file-text', minimum: 'support' },
      {
        href: '/admin/abonnements',
        label: 'Abonnements',
        icon: 'shield-check',
        minimum: 'billing_admin',
      },
      {
        href: '/admin/remboursements',
        label: 'Remboursements',
        icon: 'euro',
        minimum: 'billing_admin',
      },
    ],
  },
  {
    label: 'Plateforme',
    items: [
      { href: '/admin/support', label: 'Tickets', icon: 'life-buoy', minimum: 'support' },
      {
        href: '/admin/assistance',
        label: 'Assistance client',
        icon: 'user-check',
        minimum: 'support',
      },
      { href: '/admin/catalogue', label: 'Offres', icon: 'package', minimum: 'platform_admin' },
      { href: '/admin/webhooks', label: 'Événements', icon: 'zap', minimum: 'developer' },
      { href: '/admin/securite', label: 'Sécurité', icon: 'lock', minimum: 'platform_admin' },
      {
        href: '/admin/securite/violations',
        label: 'Violations de données',
        icon: 'shield-check',
        minimum: 'platform_admin',
      },
      {
        href: '/admin/confidentialite',
        label: 'Demandes RGPD',
        icon: 'file-text',
        minimum: 'platform_admin',
      },
      {
        href: '/admin/signalements',
        label: 'Signalements',
        icon: 'flag',
        minimum: 'support',
      },
      { href: '/admin/coupons', label: 'Codes promo', icon: 'badge', minimum: 'platform_admin' },
      {
        href: '/admin/feature-flags',
        label: 'Activations',
        icon: 'zap',
        minimum: 'platform_admin',
      },
      { href: '/admin/metiers', label: 'Métiers', icon: 'briefcase', minimum: 'support' },
      { href: '/admin/taches', label: 'Tâches de fond', icon: 'clock', minimum: 'developer' },
    ],
  },
];

export function AdminNav({
  role,
  badges = {},
}: {
  role: PlatformRole;
  /** Pastilles par entrée (messages clients en attente…). */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const level = HIERARCHY[role] ?? 0;
  const pending = Object.values(badges).reduce((sum, count) => sum + count, 0);

  return (
    <>
      {/* Téléphone : la même navigation, repliée dans un menu. */}
      <details className="group mt-4 w-full lg:hidden">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm">
          <Icon name="menu" />
          Menu
          {pending > 0 ? (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-2xs font-medium text-[var(--accent-foreground)]">
              {pending}
            </span>
          ) : null}
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => level >= HIERARCHY[item.minimum]);
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1 px-3 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                  {group.label}
                </p>
                <ul>
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--foreground-muted)] hover:bg-[var(--surface)]"
                      >
                        <Icon name={item.icon} />
                        {item.label}
                        {badges[item.href] ? (
                          <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 text-2xs font-medium text-[var(--accent-foreground)]">
                            {badges[item.href]}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </details>

      <nav
        aria-label="Navigation de l’administration"
        className="hidden w-56 shrink-0 py-8 lg:block"
      >
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => level >= HIERARCHY[item.minimum]);
          if (items.length === 0) return null;

          return (
            <div key={group.label} className="mb-7">
              <p className="mb-2 px-3 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-[var(--surface-elevated)] font-medium text-[var(--foreground)]'
                            : 'text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
                        )}
                      >
                        <Icon name={item.icon} />
                        {item.label}
                        {badges[item.href] ? (
                          <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 text-2xs font-medium text-[var(--accent-foreground)]">
                            {badges[item.href]}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </>
  );
}
