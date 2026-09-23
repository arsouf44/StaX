import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveBusiness } from '@stax/business';
import { featureAccess, loadFeatureSnapshot, unwrapList, unwrapMaybe } from '@stax/database';
import { formatMaintenance, PROJECT_STATUS_LABELS, PROJECT_TIMELINE } from '@stax/payments';
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  Panel,
  Progress,
  QuotaMeter,
  Stat,
  StatusPill,
} from '@stax/ui';
import { publicSiteUrl } from '@stax/config';
import { getWorkspace, isSiteUnderConstruction } from '~/lib/workspace';
import { loadReleaseViews } from './editeur/contract/data';

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
      <ProjectDashboard
        firstName={workspace.profile.first_name ?? ''}
        siteName={site.name}
        siteId={site.id}
        db={db}
        canUpload={workspace.capabilities.includes('media.manage')}
        orderNotice={typeof params.commande === 'string' ? params.commande : null}
      />
    );
  }
  if (site && site.architecture === 'external_repository') {
    return (
      <ManagedSiteDashboard
        firstName={workspace.profile.first_name ?? ''}
        site={site}
        db={db}
        canEdit={workspace.capabilities.includes('content.edit')}
        subscription={workspace.subscription}
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

/* -------------------------------------------------------------------------- */
/*  Avant la livraison : le suivi du projet                                    */
/* -------------------------------------------------------------------------- */

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
const SHORT_DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** Ce que l'equipe attend du client, selon l'etape reelle du projet. */
function expectedFromClient(status: string): Array<{ label: string; href: string }> {
  switch (status) {
    case 'ordered':
    case 'questionnaire_pending':
      return [
        { label: 'Compléter les informations sur votre entreprise', href: '/app/entreprise' },
        { label: 'Nous envoyer votre logo et vos photos', href: '/app/projet#fichiers' },
      ];
    case 'assets_pending':
      return [
        {
          label: 'Nous envoyer les éléments demandés (logo, photos, textes)',
          href: '/app/projet#fichiers',
        },
      ];
    case 'client_review':
      return [
        {
          label: 'Valider ce que nous vous avons présenté, ou demander des corrections',
          href: '/app/projet',
        },
      ];
    default:
      return [];
  }
}

async function ProjectDashboard({
  firstName,
  siteName,
  siteId,
  db,
  canUpload,
  orderNotice,
}: {
  firstName: string;
  siteName: string;
  siteId: string;
  db: Awaited<ReturnType<typeof getWorkspace>>['db'];
  canUpload: boolean;
  orderNotice: string | null;
}) {
  const project = unwrapMaybe<{
    id: string;
    reference: string;
    status: string;
    due_at: string | null;
    created_at: string;
  }>(
    (await db
      .from('projects')
      .select('id, reference, status, due_at, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as never,
  );

  const [events, messages, files, domains] = project
    ? await Promise.all([
        db
          .from('project_events')
          .select('id, title, description, created_at')
          .eq('project_id', project.id)
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(4),
        db
          .from('project_messages')
          .select('id, body, created_at, author_side')
          .eq('project_id', project.id)
          .eq('author_side', 'stax')
          .order('created_at', { ascending: false })
          .limit(2),
        db
          .from('project_files')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.id),
        db
          .from('site_domains')
          .select('hostname, status, is_primary')
          .eq('site_id', siteId)
          .neq('status', 'detached'),
      ])
    : [null, null, null, null];

  const currentIndex = project
    ? PROJECT_TIMELINE.findIndex((step) =>
        (step.statuses as readonly string[]).includes(project.status),
      )
    : 0;
  const index = Math.max(currentIndex, 0);
  const current = PROJECT_TIMELINE[index];
  const statusLabel = project
    ? (PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] ??
      'Création en cours')
    : 'Création en cours';
  const todo = project ? expectedFromClient(project.status) : [];
  const recent = unwrapList<{
    id: string;
    title: string;
    description: string | null;
    created_at: string;
  }>((events ?? { data: [], error: null }) as never);
  const teamMessages = unwrapList<{ id: string; body: string; created_at: string }>(
    (messages ?? { data: [], error: null }) as never,
  );
  const domainRows = unwrapList<{ hostname: string; status: string; is_primary: boolean }>(
    (domains ?? { data: [], error: null }) as never,
  );
  const primary = domainRows.find((domain) => domain.is_primary) ?? domainRows[0] ?? null;

  return (
    <div className="space-y-6" data-testid="project-dashboard">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">
          Bonjour{firstName ? ` ${firstName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          Nous créons {siteName}. Voici où en est votre projet, étape par étape.
        </p>
      </div>

      {orderNotice === 'interne' ? (
        <Alert tone="success" live="status" title="Commande interne enregistrée">
          Aucun paiement, aucune facture. Le site est conçu et développé par l’équipe StaX, puis
          livré à ce compte depuis l’administration, comme pour un client.
        </Alert>
      ) : orderNotice ? (
        <Alert tone="success" live="status" title="Merci pour votre commande">
          Votre paiement est confirmé. L’équipe StaX démarre votre projet. La maintenance mensuelle
          ne commencera qu’à la livraison de votre site.
        </Alert>
      ) : null}

      <Panel level={2} padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Mon projet{project ? ` · ${project.reference}` : ''}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone="accent">{statusLabel}</StatusPill>
              {project?.due_at ? (
                <span className="text-sm text-[var(--foreground-muted)]">
                  Livraison prévue le {LONG_DATE.format(new Date(project.due_at))}
                </span>
              ) : null}
            </p>
          </div>
          <ButtonLink href="/app/projet" variant="secondary" size="sm">
            Détail et messages
          </ButtonLink>
        </div>

        <Progress
          className="mt-5"
          value={index + 1}
          max={PROJECT_TIMELINE.length}
          label={`Étape ${index + 1} sur ${PROJECT_TIMELINE.length}`}
        />
        <ol className="mt-4 grid gap-2 sm:grid-cols-7" aria-label="Étapes du projet">
          {PROJECT_TIMELINE.map((step, position) => (
            <li
              key={step.key}
              aria-current={position === index ? 'step' : undefined}
              className={
                position < index
                  ? 'text-xs text-[var(--success)]'
                  : position === index
                    ? 'text-xs font-medium text-[var(--foreground)]'
                    : 'text-xs text-[var(--muted)]'
              }
            >
              {position < index ? '✓ ' : `${position + 1}. `}
              {step.label}
            </li>
          ))}
        </ol>
        {current ? (
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">{current.description}</p>
        ) : null}
        {project ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Commande du {LONG_DATE.format(new Date(project.created_at))}
            {recent[0]
              ? ` · dernière mise à jour le ${SHORT_DATE_TIME.format(new Date(recent[0].created_at))}`
              : ''}
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel level={1} padding="lg" className="lg:col-span-2">
          <h2 className="text-sm font-medium">Ce que nous attendons de vous</h2>
          {todo.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Rien pour l’instant : l’équipe avance. Nous vous prévenons dès que nous avons besoin
              de vous.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {todo.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 text-sm underline-offset-4 hover:underline"
                  >
                    <Icon name="arrow-right" size={14} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {teamMessages.length > 0 ? (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <h3 className="text-xs font-medium tracking-[0.08em] text-[var(--muted)] uppercase">
                Derniers messages de l’équipe
              </h3>
              <ul className="mt-2 space-y-2">
                {teamMessages.map((message) => (
                  <li key={message.id} className="text-sm">
                    <p className="line-clamp-2">{message.body}</p>
                    <p className="text-2xs text-[var(--muted)]">
                      {SHORT_DATE_TIME.format(new Date(message.created_at))}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">En bref</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted)]">Fichiers transmis</dt>
              <dd>
                {files?.count ?? 0}{' '}
                {canUpload ? (
                  <Link
                    href="/app/projet#fichiers"
                    className="text-xs underline underline-offset-2"
                  >
                    envoyer
                  </Link>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Nom de domaine</dt>
              <dd>
                {primary
                  ? `${primary.hostname}${primary.status === 'active' ? '' : ' (en préparation)'}`
                  : 'Défini avec vous avant la mise en ligne'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Une question ?</dt>
              <dd>
                <Link href="/app/projet" className="underline underline-offset-2">
                  Écrire à l’équipe
                </Link>
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      {recent.length > 0 ? (
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Dernières étapes</h2>
          <ul className="mt-3 space-y-2">
            {recent.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="font-medium">{event.title}</span>
                {event.description ? (
                  <span className="text-[var(--foreground-muted)]"> — {event.description}</span>
                ) : null}
                <span className="block text-2xs text-[var(--muted)]">
                  {SHORT_DATE_TIME.format(new Date(event.created_at))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Apres la livraison : la gestion d'un site independant                      */
/* -------------------------------------------------------------------------- */

async function ManagedSiteDashboard({
  firstName,
  site,
  db,
  canEdit,
  subscription,
}: {
  firstName: string;
  site: NonNullable<Awaited<ReturnType<typeof getWorkspace>>['workspace']['currentSite']>;
  db: Awaited<ReturnType<typeof getWorkspace>>['db'];
  canEdit: boolean;
  subscription: Awaited<ReturnType<typeof getWorkspace>>['workspace']['subscription'];
}) {
  const [overviewResult, releases, health, draft, messages, bookings, orders, metrics] =
    await Promise.all([
      db.rpc('site_management_overview', { p_site: site.id }),
      loadReleaseViews(db, site.id, 5),
      db
        .from('site_health_checks')
        .select('ok, status_code, response_ms, checked_at')
        .eq('site_id', site.id)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('site_content_drafts').select('updated_at').eq('site_id', site.id).maybeSingle(),
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
    ]);

  const overview = (overviewResult.data ?? {}) as {
    productionUrl?: string | null;
    primaryDomain?: string | null;
  };
  const liveUrl = overview.primaryDomain
    ? `https://${overview.primaryDomain}/`
    : (overview.productionUrl ?? null);
  const production = releases.find((release) => release.status === 'published') ?? null;
  const inFlight =
    releases.find((release) => ['queued', 'committing', 'deploying'].includes(release.status)) ??
    null;
  const failed = releases[0]?.status === 'failed' ? releases[0] : null;
  const check = (health.data ?? null) as {
    ok: boolean;
    status_code: number | null;
    response_ms: number | null;
    checked_at: string;
  } | null;
  const draftUpdated = (draft.data as { updated_at: string } | null)?.updated_at ?? null;
  const pendingChanges = Boolean(
    draftUpdated && production?.publishedAt && draftUpdated > production.publishedAt,
  );
  const days = unwrapList<{ day: string; pageviews: number; visitors: number }>(metrics as never);

  return (
    <div className="space-y-8" data-testid="managed-site-dashboard">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">
          Bonjour{firstName ? ` ${firstName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          Voici l’essentiel pour {site.name}.
        </p>
      </div>

      <Panel level={2} padding="lg" data-testid="my-site">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Mon site
            </p>
            <h2 className="mt-1 text-xl font-medium">{site.name}</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              {liveUrl ?? 'Adresse en préparation'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {site.status === 'suspended' ? (
                <StatusPill tone="warning">Suspendu</StatusPill>
              ) : check ? (
                <StatusPill tone={check.ok ? 'success' : 'danger'}>
                  {check.ok ? 'En ligne' : 'Injoignable à la dernière vérification'}
                </StatusPill>
              ) : production ? (
                <StatusPill tone="success">En ligne</StatusPill>
              ) : (
                <StatusPill tone="neutral">Pas encore en ligne</StatusPill>
              )}
              {pendingChanges ? <StatusPill tone="warning">Brouillon non publié</StatusPill> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && site.deliveredAt ? (
              <ButtonLink href="/app/editeur" size="lg">
                <Icon name="pencil" size={16} aria-hidden="true" />
                Modifier mon site
              </ButtonLink>
            ) : null}
            {liveUrl ? (
              <a
                href={liveUrl}
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

        <div className="mt-6 grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--muted)]">Version en ligne</p>
            {production ? (
              <>
                <p className="mt-1 text-sm font-medium">Version {production.version}</p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {production.publishedAt
                    ? `Publiée le ${SHORT_DATE_TIME.format(new Date(production.publishedAt))}`
                    : ''}
                  {production.author ? ` par ${production.author}` : ''}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm">—</p>
            )}
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">Surveillance</p>
            <p className="mt-1 text-sm">
              {check
                ? `${check.ok ? 'Répond' : 'Ne répond pas'}${check.response_ms !== null ? ` en ${check.response_ms} ms` : ''}`
                : 'Première vérification à venir'}
            </p>
            {check ? (
              <p className="text-xs text-[var(--foreground-muted)]">
                Vérifié le {SHORT_DATE_TIME.format(new Date(check.checked_at))}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">Maintenance</p>
            <p className="mt-1 text-sm">
              {subscription
                ? `${subscriptionLabel(subscription.status)}${
                    subscription.maintenance_price_cents
                      ? ` — ${formatMaintenance(subscription.maintenance_price_cents, 'EUR', subscription.billing_interval)}`
                      : ''
                  }`
                : 'Démarre à la livraison'}
            </p>
          </div>
        </div>
      </Panel>

      {inFlight ? (
        <Alert
          tone="info"
          live="status"
          title={`Publication de la version ${inFlight.version} en cours`}
        >
          Votre site est en cours de mise à jour. La version précédente reste en ligne jusqu’à la
          confirmation de la mise en ligne.
        </Alert>
      ) : failed ? (
        <Alert
          tone="danger"
          live="status"
          title={`La version ${failed.version} n’a pas été publiée`}
        >
          Votre site en ligne n’a pas changé. {failed.error ?? ''}{' '}
          <Link href="/app/site/versions" className="underline underline-offset-4">
            Voir l’historique
          </Link>
        </Alert>
      ) : null}

      {!site.deliveredAt ? (
        <Alert tone="info" title="Site en préparation">
          Ce site n’est pas encore livré : son éditeur s’ouvrira à la livraison.
        </Alert>
      ) : null}

      <section aria-labelledby="a-traiter">
        <h2 id="a-traiter" className="mb-3 text-sm font-medium">
          À traiter
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            href="/app/messages"
            icon="mail"
            count={messages.count ?? 0}
            singular="message non lu"
            plural="messages non lus"
            empty="Aucun message en attente."
          />
          {site.enabledModules.includes('booking') ? (
            <ActionCard
              href="/app/reservations"
              icon="calendar-check"
              count={bookings.count ?? 0}
              singular="réservation à confirmer"
              plural="réservations à confirmer"
              empty="Aucune demande en attente."
            />
          ) : null}
          {site.enabledModules.includes('orders') ? (
            <ActionCard
              href="/app/commandes"
              icon="shopping-bag"
              count={orders.count ?? 0}
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
        {days.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Pages vues"
              value={days.reduce((total, row) => total + row.pageviews, 0).toLocaleString('fr-FR')}
            />
            <Stat
              label="Visiteurs"
              value={days.reduce((total, row) => total + row.visitors, 0).toLocaleString('fr-FR')}
            />
          </div>
        ) : (
          <Panel level={1} padding="lg">
            <p className="text-sm text-[var(--foreground-muted)]">
              Pas encore de données de fréquentation : elles apparaissent dans les 24 heures suivant
              les premières visites mesurées.
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
            description="Textes, photos, informations : les contenus prévus pour votre site."
          />
          <ShortcutCard
            href="/app/site/versions"
            icon="history"
            title="Versions publiées"
            description="Consultez, restaurez ou republiez une version."
          />
          <ShortcutCard
            href="/app/media"
            icon="image"
            title="Photos & fichiers"
            description="Votre médiathèque, utilisable dans l’éditeur."
          />
          <ShortcutCard
            href="/app/support"
            icon="life-buoy"
            title="Une évolution ?"
            description="Nouvelle page, nouvelle section, refonte : nous le développons pour vous."
          />
        </div>
      </section>
    </div>
  );
}
