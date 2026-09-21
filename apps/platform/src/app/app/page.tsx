import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveBusiness } from '@stax/business';
import { unwrapList } from '@stax/database';
import { formatMoney } from '@stax/payments';
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  Panel,
  QuotaMeter,
  Stat,
  StatusPill,
} from '@stax/ui';
import { getWorkspace } from '~/lib/workspace';
import { featureAccess, loadFeatureSnapshot } from '@stax/database';

export const metadata: Metadata = { title: 'Tableau de bord' };

/**
 * Accueil de l espace client.
 *
 * Principe de conception : cette page repond a « que dois-je faire ? », pas
 * « combien de visiteurs ai-je eus ? ». Les actions attendues passent en
 * premier, les chiffres ensuite.
 *
 * Aucun chiffre n est simule. Une metrique jamais mesuree affiche « pas encore
 * de donnee », jamais un zero qui ressemblerait a un echec.
 */

export default async function DashboardPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const business = resolveBusiness(site?.businessTypeSlug);
  const vocabulary = business.vocabulary;

  const snapshot = await loadFeatureSnapshot(db, workspace.organization.id);
  const access = featureAccess(snapshot);

  // Compteurs lus avec le jeton de la personne : la RLS garantit qu ils ne
  // portent que sur les sites de son organisation.
  const [messages, bookings, orders, metrics] = site
    ? await Promise.all([
        db
          .from('form_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', site.id)
          .eq('status', 'unread'),
        db
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', site.id)
          .eq('status', 'pending'),
        db
          .from('shop_orders')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', site.id)
          .eq('status', 'paid'),
        db
          .from('daily_site_metrics')
          .select('day, pageviews, visitors')
          .eq('site_id', site.id)
          .order('day', { ascending: false })
          .limit(7),
      ])
    : [null, null, null, null];

  const unread = messages?.count ?? 0;
  const pendingBookings = bookings?.count ?? 0;
  const paidOrders = orders?.count ?? 0;

  const days = metrics
    ? unwrapList<{ day: string; pageviews: number; visitors: number }>(metrics as never)
    : [];
  const hasMetrics = days.length > 0;
  const pageviews = days.reduce((total, row) => total + row.pageviews, 0);
  const visitors = days.reduce((total, row) => total + row.visitors, 0);

  const firstName = workspace.profile.first_name ?? '';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">
          Bonjour{firstName ? ` ${firstName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          {site
            ? `Voici l’essentiel pour ${site.name}.`
            : 'Votre espace est prêt. Il ne manque plus que votre site.'}
        </p>
      </div>

      {!site ? (
        <EmptyState
          icon={<Icon name="layout-dashboard" size={24} />}
          title="Aucun site pour le moment"
          description="Commandez votre site pour démarrer, ou saisissez le code d’activation que nous vous avons envoyé."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/commander">Commander mon site</ButtonLink>
              <ButtonLink href="/activation" variant="secondary">
                J’ai un code d’activation
              </ButtonLink>
            </div>
          }
        />
      ) : null}

      {site?.status === 'suspended' ? (
        <Alert tone="warning" live="status" title="Votre site est suspendu">
          Il n’est plus accessible au public, mais rien n’est supprimé. Régularisez votre
          maintenance depuis la page{' '}
          <Link href="/app/abonnement" className="underline underline-offset-4">
            Maintenance
          </Link>{' '}
          pour le remettre en ligne.
        </Alert>
      ) : null}

      {site && site.status !== 'live' && site.status !== 'suspended' ? (
        <Alert tone="info" live="status" title="Votre site n’est pas encore en ligne">
          Vous pouvez le relire en aperçu privé et demander vos corrections. Nous le publions dès
          que vous nous donnez votre accord.
          <span className="mt-3 block">
            <ButtonLink href="/app/projet" size="sm">
              Suivre mon projet
            </ButtonLink>
          </span>
        </Alert>
      ) : null}

      {site ? (
        <>
          <section aria-labelledby="a-traiter">
            <h2 id="a-traiter" className="mb-3 text-sm font-medium">
              À traiter
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ActionCard
                href="/app/messages"
                icon="mail"
                count={unread}
                singular="message non lu"
                plural="messages non lus"
                empty="Aucun message en attente."
              />
              {site.enabledModules.includes('booking') ? (
                <ActionCard
                  href="/app/reservations"
                  icon="calendar-check"
                  count={pendingBookings}
                  singular={`${vocabulary.booking ?? 'réservation'} à confirmer`}
                  plural={`${vocabulary.bookingPlural ?? 'réservations'} à confirmer`}
                  empty="Aucune demande en attente."
                />
              ) : null}
              {site.enabledModules.includes('orders') ? (
                <ActionCard
                  href="/app/commandes"
                  icon="shopping-bag"
                  count={paidOrders}
                  singular="commande à préparer"
                  plural="commandes à préparer"
                  empty="Aucune commande à préparer."
                />
              ) : null}
            </div>
          </section>

          <section aria-labelledby="audience">
            <h2 id="audience" className="mb-3 text-sm font-medium">
              Ces sept derniers jours
            </h2>
            {hasMetrics ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Stat label="Pages vues" value={pageviews.toLocaleString('fr-FR')} />
                <Stat label="Visiteurs" value={visitors.toLocaleString('fr-FR')} />
                <Stat
                  label="Messages reçus"
                  value={unread.toLocaleString('fr-FR')}
                  hint="Non lus uniquement"
                />
              </div>
            ) : (
              <Panel level={1} padding="lg">
                <p className="text-sm text-[var(--foreground-muted)]">
                  Pas encore de données de fréquentation.{' '}
                  {site.status === 'live'
                    ? 'Les premières mesures apparaîtront dans les 24 heures suivant les premières visites.'
                    : 'Elles apparaîtront une fois votre site en ligne.'}
                </p>
              </Panel>
            )}
          </section>

          <section aria-labelledby="raccourcis">
            <h2 id="raccourcis" className="mb-3 text-sm font-medium">
              Raccourcis
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ShortcutCard
                href="/app/editeur"
                icon="pencil-ruler"
                title="Modifier mon site"
                description="Textes, photos, horaires : tout se change depuis l’éditeur."
              />
              <ShortcutCard
                href="/app/media"
                icon="image"
                title="Photos & fichiers"
                description="Ajoutez vos visuels et vos documents."
              />
              <ShortcutCard
                href="/app/site/domaine"
                icon="globe"
                title="Nom de domaine"
                description="Connectez votre adresse ou vérifiez son état."
              />
              <ShortcutCard
                href="/app/support"
                icon="life-buoy"
                title="Besoin d’aide ?"
                description="Écrivez-nous, nous répondons depuis votre espace."
              />
            </div>
          </section>

          <section aria-labelledby="offre">
            <h2 id="offre" className="mb-3 text-sm font-medium">
              Votre offre
            </h2>
            <Panel level={1} padding="lg">
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone="accent">{planLabel(site.planName, site.planSlug)}</StatusPill>
                {workspace.subscription ? (
                  <span className="text-sm text-[var(--foreground-muted)]">
                    Maintenance {subscriptionLabel(workspace.subscription.status)}
                    {workspace.subscription.maintenance_price_cents
                      ? ` — ${formatMoney(workspace.subscription.maintenance_price_cents, 'EUR', { hideDecimalsWhenRound: true })} / mois`
                      : ''}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <QuotaMeter
                  label="Pages"
                  used={access.usage('max_pages')}
                  limit={access.limit('max_pages')}
                />
                <QuotaMeter
                  label="Espace médias"
                  used={access.usage('max_media_mb')}
                  limit={access.limit('max_media_mb')}
                  unit="Mo"
                />
              </div>
            </Panel>
          </section>
        </>
      ) : null}
    </div>
  );
}

/**
 * Nom d'offre affiche au client.
 *
 * Aucune table de correspondance en dur : le nom vient de la base, qui est la
 * seule source du catalogue. Une offre renommee ou ajoutee s'affiche donc
 * correctement sans toucher a ce fichier — et une offre archivee garde le nom
 * sous lequel elle a ete vendue.
 */
function planLabel(name: string | null, slug: string | null): string {
  return name ?? slug ?? 'Offre en cours de définition';
}

function subscriptionLabel(status: string): string {
  const labels: Record<string, string> = {
    trialing: 'en période d’essai',
    active: 'active',
    past_due: 'en retard de paiement',
    canceled: 'résiliée',
    paused: 'en pause',
    incomplete: 'en attente de paiement',
    unpaid: 'impayée',
  };
  return labels[status] ?? status;
}

function ActionCard({
  href,
  icon,
  count,
  singular,
  plural,
  empty,
}: {
  href: string;
  icon: string;
  count: number;
  singular: string;
  plural: string;
  empty: string;
}) {
  return (
    <Link href={href} className="block">
      <Card interactive className="h-full">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-elevated)] text-[var(--muted)]"
          >
            <Icon name={icon} size={18} />
          </span>
          <div className="min-w-0">
            {count > 0 ? (
              <>
                <p className="text-2xl font-medium tabular-nums">{count}</p>
                <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">
                  {count === 1 ? singular : plural}
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">{empty}</p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function ShortcutCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block">
      <Card interactive className="h-full">
        <Icon name={icon} size={18} className="text-[var(--muted)]" />
        <h3 className="mt-3 text-sm font-medium">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">{description}</p>
      </Card>
    </Link>
  );
}
