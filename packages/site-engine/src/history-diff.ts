import { getBlockDefinition } from './blocks/registry';
import { editorFieldsFor } from './editor/fields';
import type { DraftBlock, DraftPage, DraftState } from './draft-state';

/**
 * Comparaison de deux etats d un site, en francais courant.
 *
 * « Comparer » dans l historique doit repondre a « qu est-ce qui a change ? »
 * avec les mots du client : « Page Accueil : la section Bannière principale a
 * été modifiée (Titre, Image) ». Jamais un diff JSON, jamais un identifiant.
 */

export type ChangeKind = 'added' | 'removed' | 'modified' | 'moved' | 'hidden' | 'shown';

export interface HistoryChange {
  kind: ChangeKind;
  /** Page concernee, ou `null` pour un changement global (theme, menu...). */
  page: string | null;
  label: string;
}

const SETTING_LABELS: Record<string, string> = {
  business_name: 'Nom de l’entreprise',
  tagline: 'Slogan',
  description: 'Présentation',
  email: 'E-mail',
  phone: 'Téléphone',
  address_line1: 'Adresse',
  address_line2: 'Complément d’adresse',
  postal_code: 'Code postal',
  city: 'Ville',
  social_links: 'Réseaux sociaux',
  seo_title: 'Titre pour Google',
  seo_description: 'Description pour Google',
  seo_keywords: 'Mots-clés',
  og_image_media_id: 'Image de partage',
  robots_indexable: 'Visibilité sur Google',
  cookie_banner_enabled: 'Bandeau cookies',
  analytics_enabled: 'Mesure d’audience',
};

const THEME_LABELS: Record<string, string> = {
  preset: 'Style général',
  tokens: 'Couleurs',
  font_heading: 'Police des titres',
  font_body: 'Police du texte',
  logo_media_id: 'Logo',
  favicon_media_id: 'Icône d’onglet',
};

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function blockLabel(block: DraftBlock): string {
  return getBlockDefinition(block.type)?.label ?? 'Section';
}

/** Libelles des champs qui different entre deux versions d une section. */
function changedFields(before: DraftBlock, after: DraftBlock): string[] {
  const fields = editorFieldsFor(after.type);
  const labels: string[] = [];
  const keys = new Set([...Object.keys(before.props), ...Object.keys(after.props)]);
  for (const key of keys) {
    if (same(before.props[key], after.props[key])) continue;
    labels.push(fields.find((field) => field.name === key)?.label ?? 'Contenu');
  }
  if (!same(before.settings, after.settings)) labels.push('Apparence');
  return [...new Set(labels)];
}

function pageName(page: DraftPage): string {
  return page.title || page.path;
}

function comparePageBlocks(before: DraftPage, after: DraftPage): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const name = pageName(after);
  const beforeBlocks = before.blocks ?? [];
  const afterBlocks = after.blocks ?? [];
  const beforeById = new Map(beforeBlocks.map((block) => [block.id, block]));
  const afterById = new Map(afterBlocks.map((block) => [block.id, block]));

  for (const block of afterBlocks) {
    if (!beforeById.has(block.id)) {
      changes.push({
        kind: 'added',
        page: name,
        label: `Section « ${blockLabel(block)} » ajoutée`,
      });
    }
  }
  for (const block of beforeBlocks) {
    if (!afterById.has(block.id)) {
      changes.push({
        kind: 'removed',
        page: name,
        label: `Section « ${blockLabel(block)} » supprimée`,
      });
    }
  }

  // Ordre relatif des sections presentes des deux cotes.
  const commonBefore = beforeBlocks.filter((block) => afterById.has(block.id)).map((b) => b.id);
  const commonAfter = afterBlocks.filter((block) => beforeById.has(block.id)).map((b) => b.id);
  const moved = new Set<string>();
  commonAfter.forEach((id, index) => {
    if (commonBefore[index] !== id) moved.add(id);
  });

  for (const block of afterBlocks) {
    const previous = beforeById.get(block.id);
    if (!previous) continue;
    if (previous.visible !== block.visible) {
      changes.push({
        kind: block.visible ? 'shown' : 'hidden',
        page: name,
        label: `Section « ${blockLabel(block)} » ${block.visible ? 'affichée' : 'masquée'}`,
      });
    }
    const fields = changedFields(previous, block);
    if (fields.length > 0) {
      changes.push({
        kind: 'modified',
        page: name,
        label: `Section « ${blockLabel(block)} » modifiée (${fields.join(', ')})`,
      });
    }
  }

  if (moved.size > 0) {
    changes.push({ kind: 'moved', page: name, label: 'Ordre des sections modifié' });
  }
  return changes;
}

/**
 * Ce qui change quand on passe de `before` a `after`.
 * Pour « Comparer une version avec mon brouillon », `before` est la version
 * choisie et `after` le brouillon actuel.
 */
export function compareDraftStates(before: DraftState, after: DraftState): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const beforePages = new Map(before.pages.map((page) => [page.id, page]));
  const afterPages = new Map(after.pages.map((page) => [page.id, page]));

  for (const page of after.pages) {
    const previous = beforePages.get(page.id);
    if (!previous) {
      changes.push({ kind: 'added', page: null, label: `Page « ${pageName(page)} » ajoutée` });
      continue;
    }
    if (previous.title !== page.title) {
      changes.push({
        kind: 'modified',
        page: null,
        label: `Page « ${pageName(previous)} » renommée en « ${pageName(page)} »`,
      });
    }
    if (previous.path !== page.path) {
      changes.push({
        kind: 'modified',
        page: pageName(page),
        label: `Adresse de la page changée (${previous.path} → ${page.path})`,
      });
    }
    if (previous.is_published !== page.is_published) {
      changes.push({
        kind: page.is_published ? 'shown' : 'hidden',
        page: pageName(page),
        label: page.is_published ? 'Page remise en ligne' : 'Page retirée du site',
      });
    }
    if (previous.is_visible_in_nav !== page.is_visible_in_nav) {
      changes.push({
        kind: 'modified',
        page: pageName(page),
        label: page.is_visible_in_nav ? 'Page ajoutée au menu' : 'Page retirée du menu',
      });
    }
    if (
      previous.seo_title !== page.seo_title ||
      previous.seo_description !== page.seo_description
    ) {
      changes.push({ kind: 'modified', page: pageName(page), label: 'Référencement modifié' });
    }
    changes.push(...comparePageBlocks(previous, page));
  }

  for (const page of before.pages) {
    if (!afterPages.has(page.id)) {
      changes.push({ kind: 'removed', page: null, label: `Page « ${pageName(page)} » supprimée` });
    }
  }

  const themeKeys = new Set([...Object.keys(before.theme), ...Object.keys(after.theme)]);
  for (const key of themeKeys) {
    const label = THEME_LABELS[key];
    if (!label) continue;
    if (
      !same(
        before.theme[key as keyof typeof before.theme],
        after.theme[key as keyof typeof after.theme],
      )
    ) {
      changes.push({ kind: 'modified', page: null, label: `${label} modifié(e)` });
    }
  }

  if (!same(before.settings.navigation, after.settings.navigation)) {
    changes.push({ kind: 'modified', page: null, label: 'Menu de navigation modifié' });
  }
  const settingKeys = new Set([...Object.keys(before.settings), ...Object.keys(after.settings)]);
  for (const key of settingKeys) {
    const label = SETTING_LABELS[key];
    if (!label) continue;
    const a = (before.settings as Record<string, unknown>)[key];
    const b = (after.settings as Record<string, unknown>)[key];
    if (!same(a, b)) changes.push({ kind: 'modified', page: null, label: `${label} modifié(e)` });
  }

  return changes;
}
