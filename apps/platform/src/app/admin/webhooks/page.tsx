import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import {
  Alert,
  EmptyState,
  Icon,
  Panel,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { FilterTabs } from '~/components/app/filter-tabs';
import { PageHeader } from '~/components/app/page-header';
import { requireAdminRole } from '~/lib/admin';

export const metadata: Metadata = { title: 'Événements de paiement' };

/**
 * Journal des evenements recus de notre prestataire bancaire.
 *
 * Utile pour une seule chose : comprendre pourquoi une commande n a pas
 * bascule. La charge utile affichee est EXPURGEE — aucun secret, aucune donnee
 * de carte n y figure, la reduction etant faite a l ecriture.
 */

const FILTERS = {
  echecs: ['failed'],
  en_cours: ['received', 'processing'],
  traites: ['processed'],
  tous: [] as string[],
} as const;

type FilterKey = keyof typeof FILTERS;

const TONES: Record<string, StatusTone> = {
  received: 'neutral',
  processing: 'info',
  processed: 'success',
  failed: 'danger',
  ignored: 'neutral',
};

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Diagnostic technique : reserve aux roles qui en ont l usage.
  const { db } = await requireAdminRole('developer');

  const filter: FilterKey =
    typeof params.filtre === 'string' && params.filtre in FILTERS
      ? (params.filtre as FilterKey)
      : 'echecs';

  let query = db
    .from('webhook_events')
    .select(
      'id, provider, event_id, event_type, status, attempts, received_at, processed_at, error',
    )
    .order('received_at', { ascending: false })
    .limit(120);

  const statuses = FILTERS[filter];
  if (statuses.length > 0) query = query.in('status', statuses as unknown as string[]);

  const rows = unwrapList<{
    id: string;
    provider: string;
    event_id: string;
    event_type: string;
    status: string;
    attempts: number;
    received_at: string;
    processed_at: string | null;
    error: string | null;
  }>((await query) as never);

  return (
    <>
      <PageHeader
        title="Événements de paiement"
        description="Chaque événement reçu de notre prestataire bancaire, avec son résultat. Un événement en échec peut être rejoué sans risque : les traitements sont idempotents."
      />

      <FilterTabs
        ariaLabel="Filtrer les événements"
        active={filter}
        tabs={[
          {
            value: 'echecs',
            label: 'En échec',
            count: filter === 'echecs' ? rows.length : undefined,
          },
          { value: 'en_cours', label: 'En cours' },
          { value: 'traites', label: 'Traités' },
          { value: 'tous', label: 'Tous' },
        ]}
        buildHref={(value) => `/admin/webhooks?filtre=${value}`}
      />

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="zap" size={24} />}
            title={filter === 'echecs' ? 'Aucun événement en échec' : 'Aucun événement'}
            description={
              filter === 'echecs'
                ? 'Tous les événements reçus ont été traités.'
                : 'Les événements apparaîtront ici dès la première transaction.'
            }
          />
        ) : (
          <TableWrapper label="Événements de paiement">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Type</TH>
                  <TH scope="col">Source</TH>
                  <TH scope="col">État</TH>
                  <TH scope="col">Tentatives</TH>
                  <TH scope="col">Reçu le</TH>
                  <TH scope="col">Motif</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <span className="font-mono text-xs">{row.event_type}</span>
                      <span className="mt-0.5 block font-mono text-2xs text-[var(--muted)]">
                        {row.event_id}
                      </span>
                    </TD>
                    <TD className="text-[var(--foreground-muted)]">
                      {row.provider === 'stripe_connect' ? 'Encaissements clients' : 'Plateforme'}
                    </TD>
                    <TD>
                      <StatusPill tone={TONES[row.status] ?? 'neutral'}>{row.status}</StatusPill>
                    </TD>
                    <TD className="tabular-nums">{row.attempts}</TD>
                    <TD className="text-[var(--foreground-muted)]">
                      <time dateTime={row.received_at}>
                        {new Intl.DateTimeFormat('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(row.received_at))}
                      </time>
                    </TD>
                    <TD className="max-w-xs text-xs text-[var(--danger)]">{row.error ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </div>

      <Panel level={1} padding="md" className="mt-6">
        <h2 className="text-sm font-medium">Rejouer un événement</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Le rejeu se déclenche depuis le tableau de bord de notre prestataire bancaire, qui est la
          source de vérité. Rejouer est <strong>sans danger</strong> : un événement déjà appliqué ne
          crée ni paiement, ni site, ni abonnement en double.
        </p>
      </Panel>

      <Alert tone="info" className="mt-4" live="status">
        La charge utile enregistrée est expurgée à l’écriture : ni secret, ni donnée de carte n’y
        figure. C’est pourquoi cette page affiche le type et le motif, pas le contenu brut.
      </Alert>
    </>
  );
}
