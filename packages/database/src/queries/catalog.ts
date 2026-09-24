import type {
  BillingInterval,
  Cents,
  Currency,
  FeatureRow,
  PlanHighlight,
  PlanRow,
} from '@stax/types';
import { type Db, unwrapList } from '../client';

/**
 * Catalogue commercial.
 *
 * Source unique des offres et des tarifs. Aucun composant n affiche un prix
 * qui ne vienne pas d ici — pas de « 300 € » code en dur dans une page.
 */

export interface PlanFeatureView {
  key: string;
  label: string;
  description: string | null;
  category: string;
  kind: 'boolean' | 'limit';
  unit: string | null;
  enabled: boolean;
  limitValue: number | null;
}

export interface PlanView {
  id: string;
  slug: string;
  version: number;
  name: string;
  tagline: string | null;
  description: string | null;
  badge: string | null;
  /** `signature` distingue une categorie superieure (Exceptionnel). */
  highlight: PlanHighlight;
  /** Delai annonce, en semaines ; `null` pour une offre sur devis. */
  deliveryWeeks: { min: number; max: number } | null;
  setupPriceCents: Cents;
  maintenancePriceCents: Cents;
  /** Periodicite de la maintenance : mensuelle pour les offres en vigueur. */
  billingInterval: BillingInterval;
  currency: Currency;
  vatRateBps: number;
  pricesIncludeVat: boolean;
  isQuoteOnly: boolean;
  sortOrder: number;
  features: PlanFeatureView[];
  /**
   * Ce que l'offre comprend, en clair : engagements de conception et
   * d'accompagnement, et droits logiciels REELLEMENT accordes (la base
   * refuse une inclusion adossee a un droit que l'offre n'accorde pas).
   */
  inclusions: PlanInclusionView[];
}

export interface PlanInclusionView {
  category: 'conception' | 'site' | 'gestion' | 'accompagnement';
  label: string;
  detail: string | null;
  featureKey: string | null;
  highlight: boolean;
}

interface PlanRowWithFeatures extends PlanRow {
  plan_features: Array<{
    enabled: boolean;
    limit_value: number | null;
    features: FeatureRow | null;
  }> | null;
  plan_inclusions: Array<{
    category: PlanInclusionView['category'];
    label: string;
    detail: string | null;
    feature_key: string | null;
    highlight: boolean;
    sort_order: number;
  }> | null;
}

function toPlanView(row: PlanRowWithFeatures): PlanView {
  const features: PlanFeatureView[] = (row.plan_features ?? [])
    .filter((pf): pf is typeof pf & { features: FeatureRow } => pf.features !== null)
    .map((pf) => ({
      key: pf.features.key,
      label: pf.features.label,
      description: pf.features.description,
      category: pf.features.category,
      kind: pf.features.kind,
      unit: pf.features.unit,
      enabled: pf.enabled,
      limitValue: pf.limit_value,
    }));

  // `{limit}` prend la limite de l'offre pour ce droit : le chiffre affiche
  // est celui que la plateforme applique, jamais une recopie.
  const limitOf = (key: string | null) =>
    key ? (features.find((feature) => feature.key === key)?.limitValue ?? null) : null;
  const inclusions: PlanInclusionView[] = [...(row.plan_inclusions ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter(
      (inclusion) =>
        !inclusion.label.includes('{limit}') || limitOf(inclusion.feature_key) !== null,
    )
    .map((inclusion) => ({
      category: inclusion.category,
      label: inclusion.label.replace('{limit}', String(limitOf(inclusion.feature_key) ?? '')),
      detail: inclusion.detail,
      featureKey: inclusion.feature_key,
      highlight: inclusion.highlight,
    }));

  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    badge: row.badge,
    highlight:
      row.highlight === 'popular' || row.highlight === 'signature' ? row.highlight : 'none',
    deliveryWeeks:
      row.delivery_weeks_min !== null && row.delivery_weeks_max !== null
        ? { min: row.delivery_weeks_min, max: row.delivery_weeks_max }
        : null,
    setupPriceCents: row.setup_price_cents,
    maintenancePriceCents: row.maintenance_price_cents,
    billingInterval: row.billing_interval === 'year' ? 'year' : 'month',
    currency: row.currency,
    vatRateBps: row.vat_rate_bps,
    pricesIncludeVat: row.prices_include_vat,
    isQuoteOnly: row.is_quote_only,
    sortOrder: row.sort_order,
    features,
    inclusions,
  };
}

const PLAN_SELECT = `
  id, slug, version, name, tagline, description, badge, highlight,
  delivery_weeks_min, delivery_weeks_max,
  setup_price_cents, maintenance_price_cents, billing_interval, currency, vat_rate_bps,
  prices_include_vat,
  is_quote_only, is_active, is_public, sort_order,
  stripe_setup_price_id, stripe_maintenance_price_id, stripe_product_id,
  valid_from, valid_until,
  plan_features (
    enabled, limit_value,
    features ( key, label, description, category, kind, unit )
  ),
  plan_inclusions ( category, label, detail, feature_key, highlight, sort_order )
`;

export async function listPublicPlans(db: Db): Promise<PlanView[]> {
  const result = await db
    .from('plans')
    .select(PLAN_SELECT)
    .eq('is_active', true)
    .eq('is_public', true)
    .is('valid_until', null)
    .order('sort_order', { ascending: true });

  return unwrapList<PlanRowWithFeatures>(
    result as unknown as { data: PlanRowWithFeatures[] | null; error: null },
  ).map(toPlanView);
}

export async function getPlanBySlug(db: Db, slug: string): Promise<PlanView | null> {
  const result = await db
    .from('plans')
    .select(PLAN_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .is('valid_until', null)
    .limit(1);

  const rows = unwrapList<PlanRowWithFeatures>(
    result as unknown as { data: PlanRowWithFeatures[] | null; error: null },
  );
  return rows.length > 0 ? toPlanView(rows[0] as PlanRowWithFeatures) : null;
}

export interface SectorView {
  slug: string;
  label: string;
  description: string | null;
  icon: string;
  businessCount: number;
}

export async function listSectorsWithCounts(db: Db): Promise<SectorView[]> {
  const sectors = unwrapList<{
    slug: string;
    label: string;
    description: string | null;
    icon: string;
    sort_order: number;
  }>(
    (await db
      .from('business_sectors')
      .select('slug, label, description, icon, sort_order')
      .eq('is_active', true)
      .order('sort_order')) as never,
  );

  const types = unwrapList<{ slug: string; sector_slug: string }>(
    (await db.from('business_types').select('slug, sector_slug').eq('is_active', true)) as never,
  );

  const counts = new Map<string, number>();
  for (const type of types) {
    counts.set(type.sector_slug, (counts.get(type.sector_slug) ?? 0) + 1);
  }

  return sectors.map((sector) => ({
    slug: sector.slug,
    label: sector.label,
    description: sector.description,
    icon: sector.icon,
    businessCount: counts.get(sector.slug) ?? 0,
  }));
}

export interface BusinessTypeView {
  slug: string;
  sectorSlug: string;
  label: string;
  pluralLabel: string | null;
  description: string | null;
  icon: string;
  schemaOrgType: string;
}

export async function listBusinessTypes(db: Db, sectorSlug?: string): Promise<BusinessTypeView[]> {
  let query = db
    .from('business_types')
    .select(
      'slug, sector_slug, label, plural_label, description, icon, schema_org_type, sort_order',
    )
    .eq('is_active', true)
    .order('sort_order');

  if (sectorSlug) query = query.eq('sector_slug', sectorSlug);

  const rows = unwrapList<{
    slug: string;
    sector_slug: string;
    label: string;
    plural_label: string | null;
    description: string | null;
    icon: string;
    schema_org_type: string;
  }>((await query) as never);

  return rows.map((row) => ({
    slug: row.slug,
    sectorSlug: row.sector_slug,
    label: row.label,
    pluralLabel: row.plural_label,
    description: row.description,
    icon: row.icon,
    schemaOrgType: row.schema_org_type,
  }));
}

export interface ModuleRowView {
  slug: string;
  label: string;
  description: string | null;
  icon: string;
  category: string;
  requiredFeature: string | null;
}

export async function listModulesForBusinessType(
  db: Db,
  businessTypeSlug: string,
): Promise<ModuleRowView[]> {
  const rows = unwrapList<{
    module_slug: string;
    sort_order: number;
    business_modules: {
      slug: string;
      label: string;
      description: string | null;
      icon: string;
      category: string;
      required_feature: string | null;
    } | null;
  }>(
    (await db
      .from('business_type_modules')
      .select(
        'module_slug, sort_order, business_modules ( slug, label, description, icon, category, required_feature )',
      )
      .eq('business_type_slug', businessTypeSlug)
      .order('sort_order')) as never,
  );

  return rows
    .map((row) => row.business_modules)
    .filter((mod): mod is NonNullable<typeof mod> => mod !== null)
    .map((mod) => ({
      slug: mod.slug,
      label: mod.label,
      description: mod.description,
      icon: mod.icon,
      category: mod.category,
      requiredFeature: mod.required_feature,
    }));
}

/* -------------------------------------------------------------------------- */
/*  Sous-traitants publies                                                     */
/* -------------------------------------------------------------------------- */

export interface SubprocessorView {
  name: string;
  purpose: string;
  location: string;
  transferSafeguards: string | null;
  privacyUrl: string | null;
  dpaUrl: string | null;
  category: string;
}

/**
 * Liste publique des sous-traitants.
 *
 * La page /sous-traitants lit cette table et rien d'autre : ce qui est affiche
 * est ce que la plateforme utilise reellement, pas une liste recopiee a la main
 * dans un fichier de contenu qui divergerait au premier changement.
 */
export async function listSubprocessors(db: Db): Promise<SubprocessorView[]> {
  const rows = unwrapList<{
    name: string;
    purpose: string;
    location: string;
    transfer_safeguards: string | null;
    privacy_url: string | null;
    dpa_url: string | null;
    category: string;
  }>(
    (await db
      .from('subprocessors')
      .select('name, purpose, location, transfer_safeguards, privacy_url, dpa_url, category')
      .eq('is_active', true)
      .order('sort_order')
      .order('name')) as never,
  );

  return rows.map((row) => ({
    name: row.name,
    purpose: row.purpose,
    location: row.location,
    transferSafeguards: row.transfer_safeguards,
    privacyUrl: row.privacy_url,
    dpaUrl: row.dpa_url,
    category: row.category,
  }));
}
