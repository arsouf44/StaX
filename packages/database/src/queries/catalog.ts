import type { Cents, Currency, FeatureRow, PlanRow } from '@stax/types';
import { type Db, unwrapList } from '../client';

/**
 * Catalogue commercial.
 *
 * Source unique des offres et des tarifs. Aucun composant n affiche un prix
 * qui ne vienne pas d ici — pas de « 239,99 € » code en dur dans une page.
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
  setupPriceCents: Cents;
  monthlyPriceCents: Cents;
  currency: Currency;
  vatRateBps: number;
  pricesIncludeVat: boolean;
  isQuoteOnly: boolean;
  sortOrder: number;
  features: PlanFeatureView[];
}

interface PlanRowWithFeatures extends PlanRow {
  plan_features: Array<{
    enabled: boolean;
    limit_value: number | null;
    features: FeatureRow | null;
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

  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    badge: row.badge,
    setupPriceCents: row.setup_price_cents,
    monthlyPriceCents: row.monthly_price_cents,
    currency: row.currency,
    vatRateBps: row.vat_rate_bps,
    pricesIncludeVat: row.prices_include_vat,
    isQuoteOnly: row.is_quote_only,
    sortOrder: row.sort_order,
    features,
  };
}

const PLAN_SELECT = `
  id, slug, version, name, tagline, description, badge,
  setup_price_cents, monthly_price_cents, currency, vat_rate_bps, prices_include_vat,
  is_quote_only, is_active, is_public, sort_order,
  stripe_setup_price_id, stripe_monthly_price_id, stripe_product_id,
  valid_from, valid_until,
  plan_features (
    enabled, limit_value,
    features ( key, label, description, category, kind, unit )
  )
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
