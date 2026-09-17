'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  Badge,
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  Icon,
  Logo,
  StatusPill,
  type StatusTone,
} from '@stax/ui';
import type { Workspace } from '@stax/database';
import { ROLE_LABELS } from '@stax/business';
import { ThemeToggle } from '~/components/theme-toggle';
import { signOutAction, switchOrganizationAction, switchSiteAction } from '~/app/app/actions';

/**
 * Barre superieure de l espace client.
 *
 * Elle porte ce qui doit rester visible en permanence : de quel site on parle,
 * dans quel etat il se trouve, et comment le consulter en ligne.
 */

const SITE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'En préparation', tone: 'neutral' },
  building: { label: 'En construction', tone: 'info' },
  review: { label: 'En relecture', tone: 'info' },
  ready: { label: 'Prêt à publier', tone: 'accent' },
  live: { label: 'En ligne', tone: 'success' },
  suspended: { label: 'Suspendu', tone: 'warning' },
  archived: { label: 'Archivé', tone: 'neutral' },
};

const TRIGGER_CLASS =
  'flex max-w-40 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm ' +
  'text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]';

export function AppHeader({ workspace }: { workspace: Workspace }) {
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const site = workspace.currentSite;
  const status = site ? (SITE_STATUS[site.status] ?? SITE_STATUS.draft) : null;

  return (
    <div className="mx-auto flex w-full max-w-[100rem] items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
      <Link href="/app" aria-label="StaX — tableau de bord" className="shrink-0">
        <Logo size={24} />
      </Link>

      <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-[var(--border)] sm:block" />

      {workspace.memberships.length > 1 ? (
        <DropdownMenu>
          <DropdownTrigger className={TRIGGER_CLASS}>
            <span className="truncate">{workspace.organization.name}</span>
            <Icon name="circle-ellipsis" size={14} />
          </DropdownTrigger>
          <DropdownContent align="start">
            {workspace.memberships.map((membership) => (
              <DropdownItem
                key={membership.organizationId}
                disabled={pending}
                onSelect={() =>
                  startTransition(() => {
                    void switchOrganizationAction(membership.organizationId);
                  })
                }
                icon={
                  membership.organizationId === workspace.organization.id ? (
                    <Icon name="badge-check" />
                  ) : undefined
                }
              >
                {membership.name}
              </DropdownItem>
            ))}
          </DropdownContent>
        </DropdownMenu>
      ) : (
        <span className="hidden max-w-48 truncate text-sm text-[var(--foreground-muted)] sm:inline">
          {workspace.organization.name}
        </span>
      )}

      {workspace.sites.length > 1 && site ? (
        <DropdownMenu>
          <DropdownTrigger className={TRIGGER_CLASS}>
            <span className="truncate">{site.name}</span>
            <Icon name="circle-ellipsis" size={14} />
          </DropdownTrigger>
          <DropdownContent align="start">
            {workspace.sites.map((entry) => (
              <DropdownItem
                key={entry.id}
                disabled={pending}
                onSelect={() =>
                  startTransition(() => {
                    void switchSiteAction(entry.id);
                  })
                }
                icon={entry.id === site.id ? <Icon name="badge-check" /> : undefined}
              >
                {entry.name}
              </DropdownItem>
            ))}
          </DropdownContent>
        </DropdownMenu>
      ) : null}

      {status ? (
        <StatusPill tone={status.tone} className="hidden md:inline-flex">
          {status.label}
        </StatusPill>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {site?.primaryHostname ? (
          <a
            href={`https://${site.primaryHostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)] sm:inline-flex"
          >
            <Icon name="globe" />
            Voir mon site
          </a>
        ) : null}

        <ThemeToggle />

        <DropdownMenu>
          <DropdownTrigger className={TRIGGER_CLASS}>
            <Icon name="user-round" />
            <span className="hidden truncate sm:inline">
              {workspace.profile.first_name ?? 'Mon compte'}
            </span>
          </DropdownTrigger>
          <DropdownContent align="end">
            <div className="px-2.5 py-2">
              <p className="truncate text-xs text-[var(--muted)]">{workspace.profile.email}</p>
              <Badge tone="neutral" className="mt-1.5">
                {ROLE_LABELS[workspace.role]}
              </Badge>
            </div>
            <DropdownSeparator />
            <DropdownItem href="/app/compte" icon={<Icon name="user-round" />}>
              Mon compte
            </DropdownItem>
            <DropdownItem href="/app/securite" icon={<Icon name="lock" />}>
              Sécurité
            </DropdownItem>
            <DropdownItem href="/app/support" icon={<Icon name="life-buoy" />}>
              Aide &amp; support
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              tone="danger"
              disabled={signingOut}
              icon={<Icon name="key-round" />}
              onSelect={() => {
                setSigningOut(true);
                startTransition(() => {
                  void signOutAction();
                });
              }}
            >
              {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
