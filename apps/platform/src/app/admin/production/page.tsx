import type { Metadata } from 'next';
import Link from 'next/link';
import { PROJECT_STATUS_LABELS } from '@nemasus/payments';
import { Alert, Icon, Panel, Stat, StatusPill } from '@nemasus/ui';
import { FilterTabs } from '~/components/app/filter-tabs';
import { PageHeader } from '~/components/app/page-header';
import { requireAdminRole } from '~/lib/admin';
import {
  daysSince,
  filterCards,
  groupByStep,
  isDelivered,
  loadProductionBoard,
  loadWorkQueue,
  parseBoardFilter,
  type BoardCard,
} from '~/lib/staff-board';

export const metadata: Metadata = { title: 'Production' };
export const dynamic = 'force-dynamic';

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Paris',
});
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * Tableau de production.
 *
 * Chaque projet ouvert, dans l'étape que voit son client, avec ce qu'il
 * attend : une réponse du client (informations, éléments, validation) ou le
 * travail de l'équipe. Les projets en retard passent en tête de colonne ; les
 * projets livrés restent visibles 30 jours. Aucune donnée n'est estimée :
 * l'échéance est celle du projet, les messages non lus sont ceux du client.
 */
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requireAdminRole('support');
  const filter = parseBoardFilter((await searchParams).filtre);

  const [board, queue] = await Promise.all([loadProductionBoard(db), loadWorkQueue(db)]);

  if (!board) {
    return (
      <>
        <PageHeader title="Production" />
        <Alert tone="danger" live="alert" title="Tableau indisponible">
          Le tableau de production n’a pas pu être chargé. Vérifiez que la migration 0062 est
          appliquée, puis l’état de la base depuis{' '}
          <Link href="/admin/sante" className="underline underline-offset-4">
            État des services
          </Link>
          .
        </Alert>
      </>
    );
  }

  const open = board.filter((card) => !isDelivered(card));
  const late = open.filter((card) => card.late).length;
  const waitingClient = open.filter((card) => card.waiting_on === 'client').length;
  const delivered = board.length - open.length;
  const columns = groupByStep(filterCards(board, filter));

  return (
    <>
      <PageHeader
        title="Production"
        description="Chaque projet dans l’étape que voit son client, avec ce qu’il attend. Les projets en retard passent en tête de colonne ; les sites livrés restent affichés 30 jours."
      />

      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Projets en cours" value={open.length.toLocaleString('fr-FR')} />
          <Stat
            label="En retard"
            value={late.toLocaleString('fr-FR')}
            hint="Échéance de livraison dépassée"
          />
          <Stat
            label="Attendent le client"
            value={waitingClient.toLocaleString('fr-FR')}
            hint="Informations, éléments ou validation"
          />
          <Stat label="Livrés depuis 30 jours" value={delivered.toLocaleString('fr-FR')} />
        </div>

        {queue && queue.sitesDownList.length > 0 ? (
          <section id="sites-en-panne" aria-labelledby="panne" className="space-y-3">
            <h2 id="panne" className="text-base font-medium">
              Sites en panne à la dernière vérification
            </h2>
            <Panel level={2} padding="lg">
              <ul className="divide-y divide-[var(--border)]">
                {queue.sitesDownList.map((site) => (
                  <li
                    key={site.siteId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {site.name}{' '}
                        <span className="text-[var(--foreground-muted)]">
                          · {site.organization}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {site.url ?? 'adresse inconnue'} —{' '}
                        {site.statusCode
                          ? `HTTP ${site.statusCode}`
                          : (site.error ?? 'sans réponse')}{' '}
                        · {DATE_TIME.format(new Date(site.checkedAt))}
                      </p>
                    </div>
                    <Link
                      href={`/admin/sites/${site.siteId}/livraison`}
                      className="text-sm underline underline-offset-4"
                    >
                      Ouvrir le site
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        ) : null}

        <div>
          <FilterTabs
            ariaLabel="Filtrer les projets"
            active={filter}
            buildHref={(value) =>
              value === 'tous' ? '/admin/production' : `/admin/production?filtre=${value}`
            }
            tabs={[
              { value: 'tous', label: 'Tous' },
              { value: 'retard', label: 'En retard', count: late },
              { value: 'client', label: 'Attendent le client', count: waitingClient },
              {
                value: 'equipe',
                label: 'À faire par l’équipe',
                count: open.length - waitingClient,
              },
            ]}
          />
        </div>

        {board.length === 0 ? (
          <Panel level={1} padding="lg">
            <p className="text-sm text-[var(--foreground-muted)]">
              Aucun projet en cours. Les commandes payées et les sites créés depuis l’administration
              apparaissent ici.
            </p>
          </Panel>
        ) : (
          <div
            className="-mx-4 overflow-x-auto px-4 pb-2"
            role="region"
            aria-label="Projets par étape"
            tabIndex={0}
          >
            <ol className="grid min-w-[72rem] grid-cols-7 gap-3">
              {columns.map((column) => (
                <li key={column.key} className="min-w-0">
                  <h2 className="flex items-center justify-between gap-2 px-1 text-xs font-medium tracking-[0.06em] text-[var(--muted)] uppercase">
                    <span>{column.label}</span>
                    <span className="tabular-nums">{column.cards.length}</span>
                  </h2>
                  <ul className="mt-2 space-y-2">
                    {column.cards.map((card) => (
                      <ProjectCard key={card.id} card={card} />
                    ))}
                    {column.cards.length === 0 ? (
                      <li className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted)]">
                        —
                      </li>
                    ) : null}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </>
  );
}

function ProjectCard({ card }: { card: BoardCard }) {
  const idle = daysSince(card.last_activity_at);
  const delivered = isDelivered(card);
  return (
    <li
      className={
        card.late
          ? 'rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--surface)] p-3'
          : 'rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3'
      }
      data-testid="production-card"
    >
      <p className="font-mono text-2xs text-[var(--muted)]">{card.reference}</p>
      <p className="mt-0.5 truncate text-sm font-medium" title={card.site_name ?? undefined}>
        {card.site_name ?? 'Site à créer'}
      </p>
      <p className="truncate text-xs text-[var(--foreground-muted)]">
        {card.organization_name ?? '—'}
        {card.plan_name ? ` · ${card.plan_name}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        {delivered ? (
          <StatusPill tone="success">Livré</StatusPill>
        ) : card.waiting_on === 'client' ? (
          <StatusPill tone="warning">Attend le client</StatusPill>
        ) : (
          <StatusPill tone="accent">Équipe</StatusPill>
        )}
        {card.late ? <StatusPill tone="danger">En retard</StatusPill> : null}
      </div>

      <p className="mt-2 text-2xs text-[var(--foreground-muted)]">
        {PROJECT_STATUS_LABELS[card.status as keyof typeof PROJECT_STATUS_LABELS] ?? card.status}
      </p>
      <p className="text-2xs text-[var(--muted)]">
        {card.due_at ? `Échéance ${DATE.format(new Date(card.due_at))}` : 'Sans échéance'}
        {idle !== null && !delivered
          ? ` · ${idle === 0 ? 'activité aujourd’hui' : `calme depuis ${idle} j`}`
          : ''}
      </p>
      {card.assignee ? (
        <p className="text-2xs text-[var(--muted)]">Suivi par {card.assignee}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {card.site_id ? (
          <Link
            href={`/admin/sites/${card.site_id}/livraison`}
            className="underline underline-offset-4"
          >
            Livraison
          </Link>
        ) : null}
        <Link
          href={`/admin/messages/${card.id}`}
          className="inline-flex items-center gap-1 underline underline-offset-4"
        >
          <Icon name="message-circle" size={12} aria-hidden="true" />
          Messages
          {card.unread_messages > 0 ? (
            <span className="rounded-full bg-[var(--danger)] px-1.5 text-2xs text-white tabular-nums">
              {card.unread_messages}
            </span>
          ) : null}
        </Link>
      </div>
    </li>
  );
}
