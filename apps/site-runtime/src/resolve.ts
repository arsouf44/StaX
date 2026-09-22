import { readEnv } from '@stax/config';
import { createServiceClient, unwrapMaybe } from '@stax/database';
import { resolveHostname, type ResolvedHostname } from '@stax/security';
import {
  parseSnapshot,
  parseSiteSettings,
  type ParsedSnapshot,
  type SiteSettingsView,
} from '@stax/site-engine';

/**
 * Resolution du tenant.
 *
 * LE NOM D HOTE EST LA SEULE SOURCE DE VERITE. Aucun identifiant de site
 * fourni par le navigateur — parametre de requete, en-tete, corps JSON — n est
 * jamais pris en compte pour decider de quel client il s agit. C est la base de
 * l isolation : une requete ne peut pas designer un autre tenant que celui de
 * son propre domaine.
 *
 * La lecture passe par une fonction SQL `security definer` a laquelle seul le
 * role de service a acces, et qui ne renvoie QUE la version publiee.
 */

export interface ResolvedSite {
  siteId: string;
  organizationId: string;
  siteStatus: string;
  domainStatus: string;
  versionId: string | null;
  contentHash: string | null;
  snapshot: ParsedSnapshot;
  settings: SiteSettingsView;
  enabledModules: Set<string>;
  timezone: string;
  isDemo: boolean;
  /** L'offre du client comporte-t-elle l'espace client du site ? */
  hasCustomerAccounts: boolean;
  hostname: ResolvedHostname;
}

export type ResolutionOutcome =
  | { kind: 'site'; site: ResolvedSite }
  | { kind: 'unknown-host' }
  | { kind: 'domain-pending'; hostname: string }
  | { kind: 'not-published' }
  | { kind: 'suspended' }
  | { kind: 'unavailable' };

interface ResolveRow {
  site_id: string;
  organization_id: string;
  site_status: string;
  domain_status: string;
  version_id: string | null;
  content_hash: string | null;
  snapshot: unknown;
  enabled_modules: string[] | null;
  timezone: string | null;
  is_demo: boolean | null;
  has_customer_accounts: boolean | null;
}

function hostnameConfig() {
  return {
    platformHost: (readEnv('NEXT_PUBLIC_PLATFORM_URL') ?? 'https://stax.fr').replace(
      /^https?:\/\//,
      '',
    ),
    sitesDomain: readEnv('NEXT_PUBLIC_SITES_DOMAIN') ?? 'sites.stax.fr',
    previewDomain: readEnv('NEXT_PUBLIC_PREVIEW_DOMAIN') ?? 'preview.sites.stax.fr',
  };
}

export async function resolveSite(host: string | null): Promise<ResolutionOutcome> {
  const hostname = resolveHostname(host, hostnameConfig());
  if (hostname.kind === 'invalid') return { kind: 'unknown-host' };

  let row: ResolveRow | null;
  try {
    const db = createServiceClient();
    row = unwrapMaybe<ResolveRow>(
      (await db
        .rpc('resolve_published_site', { p_hostname: hostname.hostname })
        .maybeSingle()) as never,
    );
  } catch {
    // Base injoignable : on le dit, plutot que d afficher une page vide qui
    // laisserait croire que le site du client a disparu.
    return { kind: 'unavailable' };
  }

  if (!row) return { kind: 'unknown-host' };
  if (row.domain_status === 'pending' || row.domain_status === 'verifying') {
    return { kind: 'domain-pending', hostname: hostname.hostname };
  }
  if (row.site_status === 'suspended' || row.site_status === 'archived') {
    return { kind: 'suspended' };
  }
  if (!row.version_id || !row.snapshot) return { kind: 'not-published' };

  const snapshot = parseSnapshot(row.snapshot);
  if (!snapshot) return { kind: 'not-published' };

  const settings = parseSiteSettings(
    (row.snapshot as { settings?: unknown }).settings ?? {},
    snapshot.snapshot.site.name,
  );

  return {
    kind: 'site',
    site: {
      siteId: row.site_id,
      organizationId: row.organization_id,
      siteStatus: row.site_status,
      domainStatus: row.domain_status,
      versionId: row.version_id,
      contentHash: row.content_hash,
      snapshot,
      settings,
      enabledModules: new Set(row.enabled_modules ?? []),
      timezone: row.timezone ?? 'Europe/Paris',
      isDemo: row.is_demo ?? false,
      hasCustomerAccounts: row.has_customer_accounts ?? false,
      hostname,
    },
  };
}
