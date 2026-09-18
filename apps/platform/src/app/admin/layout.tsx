import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, Logo } from '@stax/ui';
import { getAdminContext } from '~/lib/admin';
import { AdminNav } from '~/components/admin/admin-nav';
import { AdminSearch } from '~/components/admin/admin-search';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Administration', template: '%s — Administration StaX' },
  robots: { index: false, follow: false, nocache: true },
};

const ROLE_LABELS: Record<string, string> = {
  platform_owner: 'Propriétaire',
  platform_admin: 'Administrateur',
  billing_admin: 'Facturation',
  support: 'Support',
  developer: 'Développement',
  designer: 'Design',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Le controle est ici, dans la mise en page : aucune page enfant ne peut
  // s afficher sans qu il ait eu lieu.
  const { session, role } = await getAdminContext();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[110rem] items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" aria-label="Administration StaX" className="flex items-center gap-2">
            <Logo size={22} showWordmark={false} />
            <span className="text-sm font-medium tracking-[-0.01em]">Administration</span>
          </Link>

          <AdminSearch />

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              {session.profile.email}
            </span>
            <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-2xs text-[var(--foreground-muted)]">
              {ROLE_LABELS[role] ?? role}
            </span>
            <Link
              href="/app"
              className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              <Icon name="layout-dashboard" size={14} />
              <span className="hidden sm:inline">Mon espace</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[110rem] flex-1 gap-0 px-4 sm:px-6 lg:gap-8">
        <AdminNav role={role} />
        <main id="contenu-principal" className="min-w-0 flex-1 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
