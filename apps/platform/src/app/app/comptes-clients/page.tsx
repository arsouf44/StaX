import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import { PermissionDenied } from '@stax/ui';
import { ModulePage } from '~/components/app/module-page';
import { getWorkspace } from '~/lib/workspace';
import { CustomerList, type CustomerView } from './customer-list';

export const metadata: Metadata = { title: 'Comptes clients' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Les comptes que vos clients ont ouverts sur VOTRE site.
 *
 * Ces donnees sont les votres : vous en etes responsable, vous les voyez, vous
 * les exportez et vous pouvez effacer un compte sur demande — sans passer par
 * StaX et sans outil technique.
 */
export default async function CustomerAccountsPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canView = workspace.capabilities.includes('commerce.view');
  const canManage = workspace.capabilities.includes('commerce.manage');

  const rows =
    canView && site
      ? unwrapList<{
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          email_verified_at: string | null;
          last_login_at: string | null;
          is_blocked: boolean;
          created_at: string;
        }>(
          (await db
            .from('site_customers')
            .select(
              'id, email, full_name, phone, email_verified_at, last_login_at, is_blocked, created_at',
            )
            .eq('organization_id', workspace.organization.id)
            .eq('site_id', site.id)
            .order('created_at', { ascending: false })
            .limit(1000)) as never,
        )
      : [];

  const customers: CustomerView[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.full_name,
    phone: row.phone,
    createdLabel: DATE.format(new Date(row.created_at)),
    lastLoginLabel: row.last_login_at ? DATE_TIME.format(new Date(row.last_login_at)) : null,
    verified: row.email_verified_at !== null,
    blocked: row.is_blocked,
  }));

  return (
    <ModulePage
      module="customer-accounts"
      feature="customer_accounts"
      title="Comptes clients"
      description="Les personnes qui ont créé leur espace sur votre site. Ces données vous appartiennent : vous les consultez, les exportez et pouvez effacer un compte sur simple demande."
    >
      {canView ? (
        <div className="space-y-6">
          <CustomerList customers={customers} canManage={canManage} />
          <p className="text-sm text-[var(--foreground-muted)]">
            Besoin d’un fichier ? Exportez la liste complète au format tableur depuis{' '}
            <Link href="/app/donnees" className="underline underline-offset-2">
              Mes données
            </Link>
            .
          </p>
        </div>
      ) : (
        <PermissionDenied message="Votre rôle ne donne pas accès aux comptes clients." />
      )}
    </ModulePage>
  );
}
