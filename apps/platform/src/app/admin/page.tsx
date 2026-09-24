import type { Metadata } from 'next';
import Link from 'next/link';
import { loadAdminOverview } from '@stax/database';
import { formatMoney } from '@stax/payments';
import { Alert, Card, Icon, Panel, Stat } from '@stax/ui';
import { getAdminContext } from '~/lib/admin';

export const metadata: Metadata = { title: 'Vue d’ensemble' };

/**
 * Accueil du back-office.
 *
 * Il repond a « qu est-ce qui attend une decision ? » avant de repondre a
 * « comment va l activite ? ». Les chiffres affiches sont lus en base, jamais
 * estimes : une valeur qui n existe pas encore affiche zero parce qu elle vaut
 * reellement zero.
 */
export default async function AdminHomePage() {
  const { db, session } = await getAdminContext();

  let overview: Awaited<ReturnType<typeof loadAdminOverview>> | null = null;
  try {
    overview = await loadAdminOverview(db);
  } catch {
    overview = null;
  }

  if (!overview) {
    return (
      <Alert tone="danger" live="alert" title="Indicateurs indisponibles">
        Les indicateurs n’ont pas pu être chargés. Vérifiez l’état de la base depuis{' '}
        <Link href="/admin/sante" className="underline underline-offset-4">
          État des services
        </Link>
        .
      </Alert>
    );
  }

  const queue = [
    {
      href: '/admin/commandes?filtre=a_traiter',
      label: 'commande à traiter',
      plural: 'commandes à traiter',
      count: overview.ordersToProcess,
      icon: 'receipt',
      tone: 'accent' as const,
    },
    {
      href: '/admin/sites?filtre=relecture',
      label: 'site en attente de relecture',
      plural: 'sites en attente de relecture',
      count: overview.sitesAwaitingReview,
      icon: 'globe',
      tone: 'accent' as const,
    },
    {
      href: '/admin/remboursements',
      label: 'demande de remboursement',
      plural: 'demandes de remboursement',
      count: overview.openRefundRequests,
      icon: 'euro',
      tone: 'warning' as const,
    },
    {
      href: '/admin/devis',
      label: 'devis à établir',
      plural: 'devis à établir',
      count: overview.openQuotes,
      icon: 'file-text',
      tone: 'accent' as const,
    },
    {
      href: '/admin/domaines?filtre=echec',
      label: 'domaine en échec',
      plural: 'domaines en échec',
      count: overview.domainsFailed,
      icon: 'map-pin',
      tone: 'danger' as const,
    },
    {
      href: '/admin/abonnements?filtre=impaye',
      label: 'paiement en échec',
      plural: 'paiements en échec',
      count: overview.failedPayments,
      icon: 'zap',
      tone: 'danger' as const,
    },
    {
      href: '/admin/support?filtre=urgent',
      label: 'ticket urgent',
      plural: 'tickets urgents',
      count: overview.urgentTickets,
      icon: 'life-buoy',
      tone: 'danger' as const,
    },
  ].filter((entry) => entry.count > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.02em]">
          Bonjour {session.profile.first_name ?? ''}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          {queue.length === 0
            ? 'Rien n’attend de décision pour le moment.'
            : `${queue.reduce((total, entry) => total + entry.count, 0)} élément(s) attendent une action.`}
        </p>
      </div>

      {queue.length > 0 ? (
        <section aria-labelledby="file">
          <h2 id="file" className="mb-3 text-sm font-medium">
            À traiter
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map((entry) => (
              <Link key={entry.href} href={entry.href}>
                <Card interactive className="h-full">
                  <div className="flex items-start gap-3">
                    <Icon name={entry.icon} size={18} className="mt-0.5 text-[var(--muted)]" />
                    <div>
                      <p className="text-2xl font-medium tabular-nums">{entry.count}</p>
                      <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">
                        {entry.count === 1 ? entry.label : entry.plural}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="activite">
        <h2 id="activite" className="mb-3 text-sm font-medium">
          Activité
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Revenu récurrent annuel"
            value={formatMoney(overview.arrCents, 'EUR', { hideDecimalsWhenRound: true })}
            hint={`${overview.activeSubscriptions} abonnement(s) actif(s) · mensualités ramenées à l’année`}
          />
          <Stat
            label="Encaissé sur 30 jours"
            value={formatMoney(overview.revenueLast30dCents, 'EUR', {
              hideDecimalsWhenRound: true,
            })}
            hint={`${overview.paidOrdersLast30d} commande(s) payée(s)`}
          />
          <Stat label="Clients" value={overview.clients.toLocaleString('fr-FR')} />
          <Stat
            label="Sites en ligne"
            value={overview.liveSites.toLocaleString('fr-FR')}
            hint={`${overview.sitesInProgress} en cours de réalisation`}
          />
        </div>
      </section>

      {overview.atRiskSubscriptions > 0 ? (
        <Alert tone="warning" live="status" title="Abonnements à risque">
          {overview.atRiskSubscriptions} abonnement(s) sont en retard de paiement ou résiliés à
          échéance. Une relance humaine vaut mieux qu’une suspension automatique.{' '}
          <Link href="/admin/abonnements?filtre=risque" className="underline underline-offset-4">
            Les consulter
          </Link>
        </Alert>
      ) : null}

      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Ce que ces chiffres ne disent pas</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground-muted)]">
          <li>
            Le revenu récurrent est la somme des abonnements actifs au tarif de leur commande, pas
            une projection.
          </li>
          <li>
            L’encaissement sur 30 jours est net des remboursements déjà confirmés par notre
            prestataire bancaire.
          </li>
          <li>
            Aucune de ces valeurs n’est estimée ni extrapolée : ce sont des comptages, lus à
            l’instant du chargement.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
