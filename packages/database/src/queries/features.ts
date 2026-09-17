import type { FeatureKey, LimitKey, UUID } from '@stax/types';
import type { Db } from '../client';

/**
 * Droits d offre et quotas.
 *
 * La reponse fait autorite cote serveur : la fonction SQL relit le catalogue,
 * applique les derogations et renvoie une decision. Masquer un bouton dans
 * l interface ne remplace jamais cet appel.
 */

export interface FeatureAccess {
  has(feature: FeatureKey): boolean;
  limit(key: LimitKey): number | null;
  usage(key: LimitKey): number;
  /** Le quota est-il atteint ? `false` si la limite est illimitee. */
  isAtLimit(key: LimitKey): boolean;
  remaining(key: LimitKey): number | null;
}

export interface FeatureSnapshot {
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  usage: Record<string, number>;
}

const FEATURE_KEYS: FeatureKey[] = [
  'custom_domain', 'seo_tools', 'content_editor', 'scheduled_publishing', 'version_history',
  'advanced_animations', 'custom_design', 'bookings', 'ecommerce', 'online_payments',
  'customer_accounts', 'blog', 'advanced_analytics', 'multi_language', 'team_collaboration',
  'priority_support',
];

const LIMIT_KEYS: LimitKey[] = [
  'max_sites', 'max_pages', 'max_team_members', 'max_products',
  'max_media_mb', 'max_monthly_submissions', 'max_forms',
];

/**
 * Charge tous les droits d une organisation en une fois.
 * Les pages appellent cette fonction une seule fois par requete plutot que de
 * multiplier les allers-retours par fonctionnalite.
 */
export async function loadFeatureSnapshot(db: Db, organizationId: UUID): Promise<FeatureSnapshot> {
  const features: Record<string, boolean> = {};
  const limits: Record<string, number | null> = {};
  const usage: Record<string, number> = {};

  const featureResults = await Promise.all(
    FEATURE_KEYS.map(async (key) => {
      const { data } = await db.rpc('has_feature', { p_org: organizationId, p_feature: key });
      return [key, data === true] as const;
    }),
  );
  for (const [key, value] of featureResults) features[key] = value;

  const limitResults = await Promise.all(
    LIMIT_KEYS.map(async (key) => {
      const [limitResult, usageResult] = await Promise.all([
        db.rpc('feature_limit', { p_org: organizationId, p_feature: key }),
        db.rpc('feature_usage', { p_org: organizationId, p_feature: key }),
      ]);
      const rawLimit = typeof limitResult.data === 'number' ? limitResult.data : -1;
      return [
        key,
        // -1 = fonctionnalite absente de l offre ; null = illimite.
        rawLimit < 0 ? 0 : rawLimit,
        typeof usageResult.data === 'number' ? usageResult.data : 0,
        limitResult.data === null,
      ] as const;
    }),
  );
  for (const [key, limit, used, unlimited] of limitResults) {
    limits[key] = unlimited ? null : limit;
    usage[key] = used;
  }

  return { features, limits, usage };
}

export function featureAccess(snapshot: FeatureSnapshot): FeatureAccess {
  return {
    has: (feature) => snapshot.features[feature] === true,
    limit: (key) => snapshot.limits[key] ?? null,
    usage: (key) => snapshot.usage[key] ?? 0,
    isAtLimit: (key) => {
      const limit = snapshot.limits[key];
      if (limit === null || limit === undefined) return false;
      return (snapshot.usage[key] ?? 0) >= limit;
    },
    remaining: (key) => {
      const limit = snapshot.limits[key];
      if (limit === null || limit === undefined) return null;
      return Math.max(limit - (snapshot.usage[key] ?? 0), 0);
    },
  };
}

/** Verification unitaire cote serveur, pour une action ponctuelle. */
export async function hasFeature(
  db: Db,
  organizationId: UUID,
  feature: FeatureKey,
): Promise<boolean> {
  const { data, error } = await db.rpc('has_feature', {
    p_org: organizationId,
    p_feature: feature,
  });
  if (error) return false;
  return data === true;
}

export const FEATURE_UPGRADE_MESSAGES: Record<FeatureKey, string> = {
  custom_domain: 'Le nom de domaine personnalise est inclus dans toutes nos offres.',
  seo_tools: 'Les outils de referencement sont inclus dans toutes nos offres.',
  content_editor: 'L editeur de contenu est inclus dans toutes nos offres.',
  scheduled_publishing:
    'La publication programmee est disponible a partir de l offre Premium.',
  version_history: 'L historique des versions est inclus dans toutes nos offres.',
  advanced_animations: 'Les animations avancees sont disponibles avec l offre Signature.',
  custom_design: 'Le design sur mesure est disponible avec l offre Signature.',
  bookings: 'Les reservations en ligne sont disponibles a partir de l offre Premium.',
  ecommerce: 'La vente en ligne est disponible a partir de l offre Premium.',
  online_payments: 'Le paiement en ligne est disponible a partir de l offre Premium.',
  customer_accounts: 'Les comptes clients sont disponibles a partir de l offre Premium.',
  blog: 'Les actualites sont disponibles a partir de l offre Premium.',
  advanced_analytics: 'Les statistiques avancees sont disponibles a partir de l offre Premium.',
  multi_language: 'Le multilingue est disponible avec l offre Signature.',
  team_collaboration: 'La collaboration est incluse dans toutes nos offres.',
  priority_support: 'Le support prioritaire est inclus avec l offre Signature.',
};

export const LIMIT_LABELS: Record<LimitKey, { singular: string; plural: string }> = {
  max_sites: { singular: 'site', plural: 'sites' },
  max_pages: { singular: 'page', plural: 'pages' },
  max_team_members: { singular: 'collaborateur', plural: 'collaborateurs' },
  max_products: { singular: 'produit', plural: 'produits' },
  max_media_mb: { singular: 'Mo', plural: 'Mo' },
  max_monthly_submissions: { singular: 'message ce mois-ci', plural: 'messages ce mois-ci' },
  max_forms: { singular: 'formulaire', plural: 'formulaires' },
};
