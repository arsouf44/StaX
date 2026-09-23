import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveBusiness } from '@stax/business';
import { featureAccess, loadFeatureSnapshot, unwrapList, unwrapMaybe } from '@stax/database';
import { formatMaintenance, PROJECT_STATUS_LABELS } from '@stax/payments';
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
import { publicSiteUrl } from '@stax/config';
import { getWorkspace, isSiteUnderConstruction } from '~/lib/workspace';
import { SiteUnderConstruction } from '~/components/app/site-under-construction';

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  if (site && isSiteUnderConstruction(workspace)) {
    return (
      <ConstructionDashboard
        firstName={workspace.profile.first_name ?? ''}
        siteName={site.name}
        siteId={site.id}
        db={db}
        orderNotice={typeof params.commande === 'string' ? params.commande : null}
      />
    );
  }
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

  // Etat du site et premiers pas : lus en une fois, avec le jeton de la
  // personne. Chaque etape renvoie a l ecran ou la faire.
  const [siteRow, themeRow, settingsRow, mediaCount, pageCount] = site
    ? await Promise.all([
        db
          .from('sites')
          .select('draft_updated_at, last_published_at, published_version_id')
          .eq('id', site.id)
          .maybeSingle(),
        db.from('site_themes').select('logo_media_id').eq('site_id', site.id).maybeSingle(),
        db
          .from('site_settings')
          .select('email, phone, seo_description, description')
          .eq('site_id', site.id)
          .maybeSingle(),
        db
          .from('media')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', workspace.organization.id)
          .is('deleted_at', null),
        db
          .from('site_pages')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', site.id)
          .is('deleted_at', null),
      ])
    : [null, null, null, null, null];

  const siteState = (siteRow?.data ?? null) as {
    draft_updated_at: string | null;
    last_published_at: string | null;
    published_version_id: string | null;
  } | null;
  const settingsState = (settingsRow?.data ?? null) as {
    email: string | null;
    phone: string | null;
    seo_description: string | null;
    description: string | null;
  } | null;
  const isPublished = Boolean(siteState?.published_version_id);
  const hasPendingChanges = Boolean(
    siteState?.draft_updated_at &&
    (!siteState.last_published_at || siteState.draft_updated_at > siteState.last_published_at),
  );
  const activeHost =
    site?.domains.find((domain) => domain.is_primary && domain.status === 'active')?.hostname ??
    site?.domains.find((domain) => domain.status === 'active')?.hostname ??
    null;
  const canEdit = workspace.capabilities.includes('content.edit');

  const steps = site
    ? [
        {
          done: Boolean((themeRow?.data as { logo_media_id: string | null } | null)?.logo_media_id),
          label: 'Ajouter votre logo',
          href: '/app/site/apparence',
        },
        {
          done: Boolean(settingsState?.email || settingsState?.phone),
          label: 'Indiquer vos coordonnées',
          href: '/app/entreprise',
        },
        {
          done: (mediaCount?.count ?? 0) > 0,
          label: 'Ajouter vos photos',
          href: '/app/media',
        },
        {
          done: Boolean(settingsState?.seo_description || settingsState?.description),
          label: 'Décrire votre activité pour Google',
          href: '/app/site/referencement',
        },
        { done: isPublished, label: 'Mettre votre site en ligne', href: '/app/editeur' },
      ]
    : [];
  const stepsDone = steps.filter((step) => step.done).length;

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

      {params.commande === 'interne' ? (
        <Alert tone="success" live="status" title="Commande interne enregistrée">
          Aucun paiement. Le site est conçu et construit par l’équipe StaX, puis confié depuis
          l’administration.
        </Alert>
      ) : null}

      {site ? (
        <Panel level={2} padding="lg" data-testid="my-site">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                Mon site
              </p>
              <h2 className="mt-1 text-xl font-medium">{site.name}</h2>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                {activeHost ?? 'Adresse en cours de préparation'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {site.status === 'suspended' ? (
                  <StatusPill tone="warning">Suspendu</StatusPill>
                ) : isPublished ? (
                  <StatusPill tone="success">En ligne</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Pas encore en ligne</StatusPill>
                )}
                {hasPendingChanges && isPublished ? (
                  <StatusPill tone="warning">Modifications non publiées</StatusPill>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && (pageCount?.count ?? 0) > 0 ? (
                <ButtonLink href="/app/editeur" size="lg">
                  <Icon name="pencil" size={16} aria-hidden="true" />
                  Modifier mon site
                </ButtonLink>
              ) : canEdit ? (
                <ButtonLink href="/app/editeur" size="lg">
                  Préparer mon site
                </ButtonLink>
              ) : null}
              {isPublished && activeHost ? (
                <a
                  href={publicSiteUrl(activeHost)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-5 text-sm font-medium hover:bg-[var(--surface-hover)]"
                >
                  <Icon name="globe" size={16} aria-hidden="true" />
                  Voir mon site
                </a>
              ) : null}
            </div>
          </div>

          {stepsDone < steps.length ? (
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <p className="text-sm font-medium">
                Pour bien démarrer · {stepsDone} sur {steps.length}
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map((step) => (
                  <li key={step.label}>
                    <Link
                      href={step.href}
                      className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface)]"
                    >
                      <Icon
                        name={step.done ? 'circle-check' : 'plus'}
                        size={14}
                        className={step.done ? 'text-[var(--success)]' : 'text-[var(--muted)]'}
                        aria-hidden="true"
                      />
                      <span className={step.done ? 'text-[var(--muted)] line-through' : ''}>
                        {step.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}

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

      {site && !isPublished && site.status !== 'suspended' ? (
        <Alert tone="info" live="status" title="Votre site n’est pas encore en ligne">
          Relisez-le dans l’éditeur, modifiez ce que vous voulez, puis cliquez sur « Mettre en ligne
          ». Vous préférez que nous nous en chargions ? Écrivez-nous depuis votre projet.
          <span className="mt-3 block">
            <ButtonLink href="/app/projet" size="sm" variant="secondary">
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
                      ? ` — ${formatMaintenance(
                          workspace.subscription.maintenance_price_cents,
                          'EUR',
                          workspace.subscription.billing_interval,
                        )}`
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

/**
 * Tableau de bord pendant la construction du site : l essentiel est de savoir
 * ou en est le projet, et comment nous joindre.
 */
async function ConstructionDashboard({
  firstName,
  siteName,
  siteId,
  db,
  orderNotice,
}: {
  firstName: string;
  siteName: string;
  siteId: string;
  db: Awaited<ReturnType<typeof getWorkspace>>['db'];
  orderNotice: string | null;
}) {
  const project = unwrapMaybe<{ reference: string; status: string; due_at: string | null }>(
    (await db
      .from('projects')
      .select('reference, status, due_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as never,
  );
  const statusLabel = project
    ? (PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] ??
      'Création en cours')
    : 'Création en cours';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">
          Bonjour{firstName ? ` ${firstName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          Votre commande est enregistrée. Voici où en est la création de {siteName}.
        </p>
      </div>

      {orderNotice === 'interne' ? (
        <Alert tone="success" live="status" title="Commande interne enregistrée">
          Aucun paiement, aucune facture. Le site est conçu et construit par l’équipe StaX, puis
          confié à ce compte depuis l’administration, comme pour un client.
        </Alert>
      ) : orderNotice ? (
        <Alert tone="success" live="status" title="Merci pour votre commande">
          Votre paiement est confirmé. L’équipe StaX commence la création de votre site.
        </Alert>
      ) : null}

      <SiteUnderConstruction siteName={siteName} compact />

      {project ? (
        <Panel level={1} padding="lg">
          <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            Mon projet · {project.reference}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill tone="accent">{statusLabel}</StatusPill>
            {project.due_at ? (
              <span className="text-[var(--foreground-muted)]">
                Livraison prévue le{' '}
                {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                  new Date(project.due_at),
                )}
              </span>
            ) : null}
          </p>
          <p className="mt-3 text-sm">
            <Link href="/app/projet" className="underline underline-offset-4">
              Voir le détail et échanger avec l’équipe
            </Link>
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
