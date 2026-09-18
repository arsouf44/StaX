import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import {
  EmptyState,
  Icon,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import { getAdminContext } from '~/lib/admin';
import { PageHeader } from '~/components/app/page-header';

export const metadata: Metadata = { title: 'Organisations' };

/**
 * Liste des clients.
 *
 * Lue avec le jeton de la personne : ce sont les policies
 * `app.is_platform_staff()` qui autorisent la lecture transverse, pas un
 * contournement de la RLS.
 */
export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { db } = await getAdminContext();
  const term = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : '';

  let query = db
    .from('organizations')
    .select('id, name, slug, status, city, created_at, is_demo')
    .order('created_at', { ascending: false })
    .limit(100);

  if (term.length >= 2) {
    // Les caracteres de motif saisis par l operateur restent litteraux.
    query = query.ilike('name', `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }

  const rows = unwrapList<{
    id: string;
    name: string;
    slug: string;
    status: string;
    city: string | null;
    created_at: string;
    is_demo: boolean;
  }>((await query) as never);

  return (
    <>
      <PageHeader
        title="Organisations"
        description="Les entreprises clientes. Chaque ligne mène à sa fiche : sites, commandes, abonnement et journal."
      />

      <form method="get" className="mb-5 flex max-w-sm items-center gap-2">
        <label htmlFor="q" className="sr-only">
          Rechercher une organisation
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Nom de l’entreprise…"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background-inset)] px-3 py-2 text-sm"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="building" size={24} />}
          title={term ? 'Aucune organisation ne correspond' : 'Aucune organisation'}
          description={
            term ? 'Essayez un autre terme.' : 'Les clients apparaîtront ici après leur commande.'
          }
        />
      ) : (
        <TableWrapper label="Organisations clientes">
          <Table>
            <THead>
              <TR>
                <TH scope="col">Nom</TH>
                <TH scope="col">État</TH>
                <TH scope="col">Ville</TH>
                <TH scope="col">Client depuis</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Link
                      href={`/admin/organisations/${row.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.is_demo ? (
                      <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-2xs text-[var(--muted)]">
                        Démonstration
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <StatusPill tone={row.status === 'active' ? 'success' : 'warning'}>
                      {row.status === 'active' ? 'Active' : row.status}
                    </StatusPill>
                  </TD>
                  <TD className="text-[var(--foreground-muted)]">{row.city ?? '—'}</TD>
                  <TD className="text-[var(--foreground-muted)]">
                    <time dateTime={row.created_at}>
                      {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                        new Date(row.created_at),
                      )}
                    </time>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </>
  );
}
