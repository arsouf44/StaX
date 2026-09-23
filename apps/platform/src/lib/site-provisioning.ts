import 'server-only';
import { resolveBusiness } from '@stax/business';
import { sitesDomain } from '@stax/config';
import { tryCreateServiceClient, unwrapMaybe, type Db } from '@stax/database';
import { isSubdomainAvailable, suggestSubdomain } from '@stax/security';
import {
  blankTemplate,
  buildTemplateForBusiness,
  modulesForPlan,
  templatePayload,
} from '@stax/site-engine';

/**
 * Preparation d un site : modele metier + adresse en sous-domaine.
 *
 * Un site commande doit etre UTILISABLE tout de suite : des pages, des textes
 * d amorce adaptes au metier, un formulaire de contact qui fonctionne et une
 * adresse ou le voir. Le client — ou l equipe StaX — n a plus qu a
 * personnaliser.
 *
 * Le modele est construit ici, a partir du registre TypeScript ; la base
 * (`app.provision_site`) l ecrit dans une seule transaction et refuse de
 * toucher a un site qui a deja des pages.
 */

export interface SitePlanInput {
  businessTypeSlug: string;
  businessName: string;
  pitch?: string | null;
  city?: string | null;
  /** Fonctionnalites de l offre ; `null` = toutes (compte interne). */
  hasFeature: ((feature: string) => boolean) | null;
  /** Page d accueil vierge + pages legales, au lieu du modele complet du metier. */
  blank?: boolean;
}

export function buildSitePlan(input: SitePlanInput): {
  payload: Record<string, unknown>;
  modules: string[];
} {
  const business = resolveBusiness(input.businessTypeSlug);
  const modules = input.hasFeature
    ? modulesForPlan(business.id, input.hasFeature)
    : [...business.modules];
  const full = buildTemplateForBusiness(business.id, {
    enabledModules: modules,
    businessName: input.businessName,
    pitch: input.pitch ?? null,
    city: input.city ?? null,
  });
  const template = input.blank ? blankTemplate(full) : full;
  return { payload: templatePayload(template), modules: [...template.modules] };
}

/**
 * Adresse libre en `xxx.<domaine des sites>`.
 *
 * La disponibilite est verifiee avec la cle de service : un client ne voit pas
 * les domaines des autres (RLS), il ne pourrait donc pas savoir qu une
 * adresse est prise. Seule l existence est lue, rien d autre.
 */
export async function availableSiteHostname(preferred: string): Promise<string> {
  const base = suggestSubdomain(preferred).slice(0, 40).replace(/-+$/, '') || 'site';
  const domain = sitesDomain();
  const service = tryCreateServiceClient();
  // Sans cle de service, l'existence ne peut pas etre verifiee : un suffixe
  // aleatoire evite la collision plutot que de faire echouer la preparation.
  if (!service) return `${base.slice(0, 30)}-${crypto.randomUUID().slice(0, 8)}.${domain}`;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const label = attempt === 0 ? base : `${base.slice(0, 36)}-${attempt + 1}`;
    if (!isSubdomainAvailable(label)) continue;
    const hostname = `${label}.${domain}`;
    const taken = unwrapMaybe<{ id: string }>(
      (await service
        .from('site_domains')
        .select('id')
        .eq('hostname', hostname)
        .neq('status', 'detached')
        .maybeSingle()) as never,
    );
    if (!taken) return hostname;
  }
  // Cinquante collisions : on s en remet a un suffixe aleatoire.
  return `${base.slice(0, 30)}-${crypto.randomUUID().slice(0, 8)}.${domain}`;
}

/**
 * Prepare un site qui n a pas encore de contenu. Sans effet sur un site qui en
 * a deja : la fonction SQL le verifie elle-meme.
 */
export async function provisionExistingSite(
  db: Db,
  site: {
    id: string;
    name: string;
    businessTypeSlug: string | null;
    organizationId: string;
  },
  options: {
    hasFeature: ((feature: string) => boolean) | null;
    subdomain?: string | null;
    details?: Record<string, unknown>;
    blank?: boolean;
  },
): Promise<{ ok: boolean; hostname: string | null }> {
  const plan = buildSitePlan({
    businessTypeSlug: site.businessTypeSlug ?? 'autre-activite',
    businessName: site.name,
    pitch: typeof options.details?.['pitch'] === 'string' ? options.details['pitch'] : null,
    city: typeof options.details?.['city'] === 'string' ? options.details['city'] : null,
    hasFeature: options.hasFeature,
    blank: options.blank ?? false,
  });
  const hostname = await availableSiteHostname(options.subdomain || site.name);
  const { error } = await db.rpc('provision_site', {
    p_site: site.id,
    p_template: plan.payload,
    p_hostname: hostname,
    p_details: { businessName: site.name, ...(options.details ?? {}) },
  });
  if (error) {
    console.error('[stax:provision]', error.message);
    return { ok: false, hostname: null };
  }
  return { ok: true, hostname };
}
