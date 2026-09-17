import type { FeatureKey, OrgCapability } from '@stax/types';
import type { DashboardEntry, DashboardGroup, ModuleId } from './types';
import { MODULES, getModule } from './modules';

/**
 * Navigation de l'espace client.
 *
 * Trois filtres se combinent, et les trois sont verifies cote serveur :
 *  1. le module doit etre actif sur le site (metier) ;
 *  2. l'offre doit inclure la fonctionnalite requise (plan) ;
 *  3. le role doit porter la capacite associee (RBAC).
 *
 * Masquer une entree n'est PAS une protection : chaque page verifie a nouveau
 * ses droits. Cette fonction ne fait que produire une interface pertinente.
 */

export interface NavContext {
  enabledModules: readonly string[];
  hasFeature: (key: FeatureKey) => boolean;
  can: (capability: OrgCapability) => boolean;
}

export interface NavGroup {
  id: DashboardGroup;
  label: string;
  items: DashboardEntry[];
}

const GROUP_LABELS: Record<DashboardGroup, string> = {
  pilotage: 'Pilotage',
  site: 'Mon site',
  activite: 'Mon activite',
  entreprise: 'Mon entreprise',
};

const GROUP_ORDER: DashboardGroup[] = ['pilotage', 'site', 'activite', 'entreprise'];

/** Entrees presentes pour tous les clients, quel que soit le metier. */
const CORE_ENTRIES: readonly DashboardEntry[] = [
  { href: '/app', label: 'Tableau de bord', icon: 'layout-dashboard', capability: 'org.view', group: 'pilotage', sortOrder: 10 },
  { href: '/app/projet', label: 'Mon projet', icon: 'route', capability: 'org.view', group: 'pilotage', sortOrder: 20 },
  { href: '/app/statistiques', label: 'Statistiques', icon: 'bar-chart-3', capability: 'analytics.view', group: 'pilotage', sortOrder: 30 },

  { href: '/app/editeur', label: 'Modifier mon site', icon: 'pencil-ruler', capability: 'content.edit', group: 'site', sortOrder: 10 },
  { href: '/app/site/pages', label: 'Pages', icon: 'files', capability: 'content.edit', group: 'site', sortOrder: 20 },
  { href: '/app/site/apparence', label: 'Apparence', icon: 'palette', capability: 'content.edit', group: 'site', sortOrder: 30 },
  { href: '/app/site/navigation', label: 'Navigation', icon: 'menu', capability: 'content.edit', group: 'site', sortOrder: 40 },
  { href: '/app/media', label: 'Photos & fichiers', icon: 'image', capability: 'media.manage', group: 'site', sortOrder: 50 },
  { href: '/app/site/domaine', label: 'Nom de domaine', icon: 'globe', capability: 'domain.manage', group: 'site', sortOrder: 70 },
  { href: '/app/site/referencement', label: 'Referencement', icon: 'search', capability: 'content.edit', group: 'site', sortOrder: 80 },

  { href: '/app/entreprise', label: 'Mon entreprise', icon: 'building', capability: 'org.view', group: 'entreprise', sortOrder: 10 },
  { href: '/app/equipe-stax', label: 'Collaborateurs', icon: 'user-plus', capability: 'members.manage', group: 'entreprise', sortOrder: 20 },
  { href: '/app/facturation', label: 'Facturation', icon: 'receipt', capability: 'billing.view', group: 'entreprise', sortOrder: 30 },
  { href: '/app/abonnement', label: 'Maintenance', icon: 'shield-check', capability: 'billing.view', group: 'entreprise', sortOrder: 40 },
  { href: '/app/securite', label: 'Securite', icon: 'lock', capability: 'org.view', group: 'entreprise', sortOrder: 50 },
  { href: '/app/donnees', label: 'Mes donnees', icon: 'database', capability: 'data.export', group: 'entreprise', sortOrder: 60 },
  { href: '/app/activite', label: 'Journal d’activite', icon: 'history', capability: 'org.manage', group: 'entreprise', sortOrder: 70 },
  { href: '/app/support', label: 'Aide & support', icon: 'life-buoy', capability: 'org.view', group: 'entreprise', sortOrder: 80 },
];

export function buildDashboardNavigation(context: NavContext): NavGroup[] {
  const entries = new Map<string, DashboardEntry>();

  const accept = (entry: DashboardEntry) => {
    if (!context.can(entry.capability as OrgCapability)) return;
    // Une entree deja presente garde le rang le plus faible (la plus haute).
    const existing = entries.get(entry.href);
    if (existing && existing.sortOrder <= entry.sortOrder) return;
    entries.set(entry.href, entry);
  };

  for (const entry of CORE_ENTRIES) accept(entry);

  for (const moduleId of context.enabledModules) {
    const mod = getModule(moduleId);
    if (!mod) continue;
    if (mod.requiredFeature && !context.hasFeature(mod.requiredFeature)) continue;
    for (const entry of mod.dashboardEntries) accept(entry);
  }

  const groups: NavGroup[] = GROUP_ORDER.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    items: [],
  }));

  for (const entry of entries.values()) {
    const group = groups.find((g) => g.id === entry.group);
    group?.items.push(entry);
  }

  for (const group of groups) {
    group.items.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr'));
  }

  return groups.filter((group) => group.items.length > 0);
}

/** Modules reellement utilisables : actifs sur le site ET inclus dans l'offre. */
export function usableModules(
  enabledModules: readonly string[],
  hasFeature: (key: FeatureKey) => boolean,
): ModuleId[] {
  return enabledModules
    .map((id) => getModule(id))
    .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod))
    .filter((mod) => !mod.requiredFeature || hasFeature(mod.requiredFeature))
    .map((mod) => mod.id);
}

/** Modules proposables a la vente : actifs sur le site mais bloques par l'offre. */
export function lockedModules(
  enabledModules: readonly string[],
  hasFeature: (key: FeatureKey) => boolean,
): ModuleId[] {
  return enabledModules
    .map((id) => getModule(id))
    .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod))
    .filter((mod) => Boolean(mod.requiredFeature) && !hasFeature(mod.requiredFeature as FeatureKey))
    .map((mod) => mod.id);
}

export { MODULES };
