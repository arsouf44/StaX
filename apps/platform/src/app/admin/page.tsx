import type { Metadata } from 'next';
import Link from 'next/link';
import { loadAdminOverview } from '@nemasus/database';
import { formatMoney } from '@nemasus/payments';
import { Alert, Card, Icon, Panel, Stat } from '@nemasus/ui';
import { getAdminContext } from '~/lib/admin';
import { loadWorkQueue } from '~/lib/staff-board';
import { agree, countOf } from '~/lib/plural';
import { isoDaysAgo } from '~/lib/site-orders';

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
  // Ce qui fait qu'un client attend : lu par une fonction reservee a l'equipe.
  const work = await loadWorkQueue(db);

  // Virements confirmes et commandes recues sur 30 jours (lecture sous RLS :
  // la table est reservee a l'equipe).
  const since = isoDaysAgo(30);
  const [paidRows, receivedCount] = await Promise.all([
    db.from('site_orders').select('paid_amount_cents').eq('status', 'paid').gte('paid_at', since),
    db.from('site_orders').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  const paid = (paidRows.data ?? []) as Array<{ paid_amount_cents: number | null }>;
  const transfers = {
    count: paid.length,
    amountCents: paid.reduce((sum, row) => sum + (row.paid_amount_cents ?? 0), 0),
    received: receivedCount.count ?? 0,
  };

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
      href: '/admin/messages',
      label: 'client attend une réponse',
      plural: 'clients attendent une réponse',
      count: work?.unreadConversations ?? 0,
      icon: 'message-circle',
      tone: 'danger' as const,
    },
    {
      href: '/admin/production#sites-en-panne',
      label: 'site livré en panne',
      plural: 'sites livrés en panne',
      count: work?.sitesDown ?? 0,
      icon: 'alert-triangle',
      tone: 'danger' as const,
    },
    {
      href: '/admin/commandes?filtre=a_traiter',
      label: 'commande reçue : modalités de paiement à envoyer',
      plural: 'commandes reçues : modalités de paiement à envoyer',
      count: work?.ordersReceived ?? 0,
      icon: 'receipt',
      tone: 'danger' as const,
    },
    {
      href: '/admin/commandes?filtre=virement_attendu',
      label: 'virement attendu',
      plural: 'virements attendus',
      count: work?.ordersAwaitingPayment ?? 0,
      icon: 'euro',
      tone: 'accent' as const,
    },
    {
      href: '/admin/commandes?filtre=payees',
      label: 'code d’accès inutilisé proche de son expiration',
      plural: 'codes d’accès inutilisés proches de leur expiration',
      count: work?.codesUnused ?? 0,
      icon: 'key-round',
      tone: 'warning' as const,
    },
    {
      href: '/admin/production?filtre=retard',
      label: 'projet en retard sur sa date de livraison',
      plural: 'projets en retard sur leur date de livraison',
      count: work?.lateProjects ?? 0,
      icon: 'clock',
      tone: 'warning' as const,
    },
    {
      href: '/admin/support',
      label: 'ticket attend l’équipe',
      plural: 'tickets attendent l’équipe',
      count: work?.ticketsWaiting ?? 0,
      icon: 'life-buoy',
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
      href: '/admin/devis',
      label: 'demande sur mesure à étudier',
      plural: 'demandes sur mesure à étudier',
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
        <h1 className="title-page">Bonjour {session.profile.first_name ?? ''}</h1>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          {queue.length === 0
            ? 'Rien n’attend de décision pour le moment.'
            : (() => {
                const total = queue.reduce((sum, entry) => sum + entry.count, 0);
                return `${countOf(total, 'élément')} ${agree(total, 'attend', 'attendent')} une action.`;
              })()}
        </p>
      </div>

      {queue.length > 0 ? (
        <section aria-labelledby="file">
          <h2 id="file" className="mb-3 text-sm font-medium">
            À traiter
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map((entry) => (
              <Link key={entry.label} href={entry.href}>
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
            label="Virements reçus sur 30 jours"
            value={formatMoney(transfers.amountCents, 'EUR', { hideDecimalsWhenRound: true })}
            hint={countOf(transfers.count, 'commande réglée', 'commandes réglées')}
          />
          <Stat
            label="Commandes reçues sur 30 jours"
            value={transfers.received.toLocaleString('fr-FR')}
          />
          <Stat label="Clients" value={overview.clients.toLocaleString('fr-FR')} />
          <Stat
            label="Sites en ligne"
            value={overview.liveSites.toLocaleString('fr-FR')}
            hint={`${overview.sitesInProgress} en cours de réalisation`}
          />
        </div>
      </section>

      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Ce que ces chiffres ne disent pas</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground-muted)]">
          <li>
            Les virements reçus sont ceux que l’équipe a confirmés sur une commande, au montant
            inscrit lors de la confirmation.
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
