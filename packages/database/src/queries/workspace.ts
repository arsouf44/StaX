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
    }
  >(
    (await db
      .from('sites')
      .select(
        `*,
         site_domains ( id, hostname, status, kind, is_primary, ssl_status ),
         site_settings ( enabled_modules )`,
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

export function workspaceCan(workspace: Workspace, capability: OrgCapability): boolean {
  return workspace.capabilities.includes(capability);
}
