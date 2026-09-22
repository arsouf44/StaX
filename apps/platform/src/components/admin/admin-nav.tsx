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
    label: 'Clients',
    items: [
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
      { href: '/admin/coupons', label: 'Codes promo', icon: 'badge', minimum: 'platform_admin' },
      {
        href: '/admin/feature-flags',
        label: 'Activations',
        icon: 'zap',
        minimum: 'platform_admin',
      },
      { href: '/admin/templates', label: 'Modèles', icon: 'layout-grid', minimum: 'designer' },
      { href: '/admin/metiers', label: 'Métiers', icon: 'briefcase', minimum: 'support' },
      { href: '/admin/taches', label: 'Tâches de fond', icon: 'clock', minimum: 'developer' },
    ],
  },
];

export function AdminNav({ role }: { role: PlatformRole }) {
  const pathname = usePathname();
  const level = HIERARCHY[role] ?? 0;

  return (
    <nav aria-label="Navigation de l’administration" className="hidden w-56 shrink-0 py-8 lg:block">
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
