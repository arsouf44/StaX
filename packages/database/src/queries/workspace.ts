import type {
  Organization,
  OrgCapability,
  OrgRole,
  Profile,
  Site,
  SiteDomain,
  Subscription,
  UUID,
} from '@stax/types';
import { toCsv } from '@stax/security';
import { type Db, unwrapList, unwrapMaybe } from '../client';

/**
 * Contexte de travail d un utilisateur : ses organisations, ses sites, ses
 * droits. Charge une fois par requete et transmis aux pages, pour eviter la
 * multiplication des allers-retours et garantir des decisions coherentes.
 */

export interface WorkspaceSite {
  id: UUID;
  name: string;
  slug: string;
  status: Site['status'];
  businessTypeSlug: string | null;
  planSlug: string | null;
  planName: string | null;
  publishedVersionId: UUID | null;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  isDemo: boolean;
  suspendedAt: string | null;
  primaryHostname: string | null;
  domains: Array<
    Pick<SiteDomain, 'id' | 'hostname' | 'status' | 'kind' | 'is_primary' | 'ssl_status'>
  >;
  enabledModules: string[];
}

export interface Workspace {
  profile: Profile;
  organization: Organization;
  role: OrgRole;
  capabilities: OrgCapability[];
  sites: WorkspaceSite[];
  /** Site courant : celui demande, sinon le premier non archive. */
  currentSite: WorkspaceSite | null;
  subscription: Subscription | null;
  /** Toutes les organisations de l utilisateur, pour le selecteur de compte. */
  memberships: Array<{ organizationId: UUID; name: string; slug: string; role: OrgRole }>;
  /**
   * Intervention de l equipe StaX sur l espace d un client (assistance). Les
   * droits reels restent ceux verifies en base pour le role plateforme.
   */
  staffMode?: boolean;
}

export async function getProfile(db: Db, userId: UUID): Promise<Profile | null> {
  return unwrapMaybe<Profile>(
    (await db.from('profiles').select('*').eq('id', userId).single()) as never,
  );
}

export async function listMemberships(
  db: Db,
  userId: UUID,
): Promise<Array<{ organizationId: UUID; name: string; slug: string; role: OrgRole }>> {
  const rows = unwrapList<{
    organization_id: UUID;
    role: OrgRole;
    organizations: { name: string; slug: string; status: string } | null;
  }>(
    (await db
      .from('organization_members')
      .select('organization_id, role, organizations ( name, slug, status )')
      .eq('user_id', userId)) as never,
  );

  return rows
    .filter((row) => row.organizations !== null && row.organizations.status !== 'archived')
    .map((row) => ({
      organizationId: row.organization_id,
      name: row.organizations?.name ?? 'Organisation',
      slug: row.organizations?.slug ?? '',
      role: row.role,
    }));
}

export async function listSites(db: Db, organizationId: UUID): Promise<WorkspaceSite[]> {
  const rows = unwrapList<
    Site & {
      site_domains: Array<
        Pick<SiteDomain, 'id' | 'hostname' | 'status' | 'kind' | 'is_primary' | 'ssl_status'>
      > | null;
      site_settings: { enabled_modules: string[] } | null;
      plans: { name: string } | null;
    }
  >(
    (await db
      .from('sites')
      .select(
        `*,
         site_domains ( id, hostname, status, kind, is_primary, ssl_status ),
         site_settings ( enabled_modules ),
         plans ( name )`,
      )
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })) as never,
  );

  return rows.map((row) => {
    const domains = (row.site_domains ?? []).filter((d) => d.status !== 'detached');
    const primary =
      domains.find((d) => d.is_primary && d.status === 'active') ??
      domains.find((d) => d.status === 'active') ??
      domains[0] ??
      null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      businessTypeSlug: row.business_type_slug,
      planSlug: row.plan_slug,
      // Le NOM commercial vient du catalogue : une offre archivee garde le nom
      // sous lequel elle a ete vendue, et un renommage n'exige aucun deploiement.
      planName: row.plans?.name ?? null,
      publishedVersionId: row.published_version_id,
      firstPublishedAt: row.first_published_at,
      lastPublishedAt: row.last_published_at,
      isDemo: row.is_demo,
      suspendedAt: row.suspended_at,
      primaryHostname: primary?.hostname ?? null,
      domains,
      enabledModules: row.site_settings?.enabled_modules ?? [],
    };
  });
}

export async function getCapabilities(db: Db, organizationId: UUID): Promise<OrgCapability[]> {
  const { data, error } = await db.rpc('my_capabilities', { p_org: organizationId });
  if (error || !Array.isArray(data)) return [];
  return data as OrgCapability[];
}

export async function getActiveSubscription(
  db: Db,
  organizationId: UUID,
): Promise<Subscription | null> {
  const rows = unwrapList<Subscription>(
    (await db
      .from('subscriptions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)) as never,
  );
  return rows[0] ?? null;
}

export interface LoadWorkspaceOptions {
  organizationId?: UUID | null;
  siteId?: UUID | null;
}

/** Charge tout le contexte necessaire au rendu de l espace client. */
export async function loadWorkspace(
  db: Db,
  userId: UUID,
  options: LoadWorkspaceOptions = {},
): Promise<Workspace | null> {
  const [profile, memberships] = await Promise.all([
    getProfile(db, userId),
    listMemberships(db, userId),
  ]);
  if (!profile || memberships.length === 0) return null;

  const selected =
    memberships.find((m) => m.organizationId === options.organizationId) ?? memberships[0];
  if (!selected) return null;

  const organization = unwrapMaybe<Organization>(
    (await db
      .from('organizations')
      .select('*')
      .eq('id', selected.organizationId)
      .single()) as never,
  );
  if (!organization) return null;

  const [capabilities, sites, subscription] = await Promise.all([
    getCapabilities(db, organization.id),
    listSites(db, organization.id),
    getActiveSubscription(db, organization.id),
  ]);

  const currentSite = sites.find((site) => site.id === options.siteId) ?? sites[0] ?? null;

  return {
    profile,
    organization,
    role: selected.role,
    capabilities,
    sites,
    currentSite,
    subscription,
    memberships,
  };
}

/**
 * Espace d un client vu par l equipe StaX, pendant une session d assistance.
 *
 * Les droits ne sont PAS decides ici : `my_capabilities` interroge
 * `app.org_can`, qui n accorde a l equipe que les droits de contenu, et
 * seulement si une session est ouverte en base sur CETTE organisation.
 */
export async function loadStaffWorkspace(
  db: Db,
  userId: UUID,
  organizationId: UUID,
  siteId: UUID | null,
): Promise<Workspace | null> {
  const [profile, organization] = await Promise.all([
    getProfile(db, userId),
    (async () =>
      unwrapMaybe<Organization>(
        (await db
          .from('organizations')
          .select('*')
          .eq('id', organizationId)
          .maybeSingle()) as never,
      ))(),
  ]);
  if (!profile || !organization) return null;

  const [capabilities, sites, subscription] = await Promise.all([
    getCapabilities(db, organization.id),
    listSites(db, organization.id),
    getActiveSubscription(db, organization.id),
  ]);
  if (!capabilities.includes('content.edit')) return null;

  return {
    profile,
    organization,
    role: 'admin',
    capabilities,
    sites,
    currentSite: sites.find((site) => site.id === siteId) ?? sites[0] ?? null,
    subscription,
    memberships: [
      {
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: 'admin',
      },
    ],
    staffMode: true,
  };
}

export function workspaceCan(workspace: Workspace, capability: OrgCapability): boolean {
  return workspace.capabilities.includes(capability);
}

/* -------------------------------------------------------------------------- */
/*  Export des donnees                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Prepare un export CSV.
 *
 * La requete est faite AVEC LE JETON DE LA PERSONNE : la RLS garantit que le
 * fichier ne contient que ses propres donnees. Aucun filtre applicatif n est
 * necessaire pour cela, et aucun ne pourrait le remplacer.
 *
 * Chaque cellule passe par `csvCell`, qui neutralise l injection de formule :
 * un tableur execute une cellule commencant par `=`, `+`, `-` ou `@`.
 */
export async function toCsvExport(
  db: Db,
  collection: 'messages' | 'contacts' | 'reservations' | 'commandes',
): Promise<{ ok: true; filename: string; csv: string }> {
  const stamp = new Date().toISOString().slice(0, 10);

  if (collection === 'contacts') {
    const rows = unwrapList<{
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      company: string | null;
      source: string;
      marketing_consent: boolean;
      created_at: string;
    }>(
      (await db
        .from('contacts')
        .select(
          'first_name, last_name, email, phone, company, source, marketing_consent, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(10_000)) as never,
    );

    return {
      ok: true,
      filename: `stax-contacts-${stamp}.csv`,
      csv: toCsv([
        ['Prénom', 'Nom', 'E-mail', 'Téléphone', 'Société', 'Origine', 'Consentement', 'Créé le'],
        ...rows.map((row) => [
          row.first_name,
          row.last_name,
          row.email,
          row.phone,
          row.company,
          row.source,
          row.marketing_consent ? 'oui' : 'non',
          row.created_at,
        ]),
      ]),
    };
  }

  if (collection === 'reservations') {
    const rows = unwrapList<{
      reference: string;
      starts_at: string;
      party_size: number;
      status: string;
      customer_name: string;
      customer_email: string | null;
      customer_phone: string | null;
      customer_note: string | null;
    }>(
      (await db
        .from('bookings')
        .select(
          'reference, starts_at, party_size, status, customer_name, customer_email, customer_phone, customer_note',
        )
        .order('starts_at', { ascending: false })
        .limit(10_000)) as never,
    );

    return {
      ok: true,
      filename: `stax-reservations-${stamp}.csv`,
      csv: toCsv([
        ['Référence', 'Date', 'Personnes', 'État', 'Nom', 'E-mail', 'Téléphone', 'Précision'],
        ...rows.map((row) => [
          row.reference,
          row.starts_at,
          row.party_size,
          row.status,
          row.customer_name,
          row.customer_email,
          row.customer_phone,
          row.customer_note,
        ]),
      ]),
    };
  }

  if (collection === 'commandes') {
    const rows = unwrapList<{
      reference: string;
      status: string;
      total_cents: number;
      currency: string;
      customer_email: string | null;
      created_at: string;
    }>(
      (await db
        .from('shop_orders')
        .select('reference, status, total_cents, currency, customer_email, created_at')
        .order('created_at', { ascending: false })
        .limit(10_000)) as never,
    );

    return {
      ok: true,
      filename: `stax-commandes-${stamp}.csv`,
      csv: toCsv([
        ['Référence', 'État', 'Total (centimes)', 'Devise', 'E-mail', 'Créée le'],
        ...rows.map((row) => [
          row.reference,
          row.status,
          row.total_cents,
          row.currency,
          row.customer_email,
          row.created_at,
        ]),
      ]),
    };
  }

  const rows = unwrapList<{
    created_at: string;
    status: string;
    data: Record<string, unknown>;
  }>(
    (await db
      .from('form_submissions')
      .select('created_at, status, data')
      .order('created_at', { ascending: false })
      .limit(10_000)) as never,
  );

  // Les colonnes sont l union des cles reellement presentes : un formulaire
  // qui gagne un champ n oblige pas a toucher cet export.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row.data ?? {})))].sort();

  return {
    ok: true,
    filename: `stax-messages-${stamp}.csv`,
    csv: toCsv([
      ['Reçu le', 'État', ...columns],
      ...rows.map((row) => [
        row.created_at,
        row.status,
        ...columns.map((column) => row.data?.[column] ?? ''),
      ]),
    ]),
  };
}
