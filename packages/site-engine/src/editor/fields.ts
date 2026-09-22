import type { z } from 'zod';
import { getBlockDefinition } from '../blocks/registry';

/**
 * Description des champs editables d un bloc.
 *
 * Elle est DERIVEE du schema Zod du bloc, pas ecrite a cote. Consequence
 * directe : ajouter une propriete a un bloc la rend editable sans toucher a
 * l interface, et il est impossible que l editeur propose un champ que le
 * schema refuserait — les deux ne peuvent pas diverger.
 *
 * Le libelle affiche vient d une table de traduction : le nom technique
 * (`seoTitle`, `showPrices`) ne doit jamais apparaitre dans l espace client.
 */

export type EditorFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'media'
  | 'link'
  | 'list'
  | 'rich'
  | 'unsupported';

export interface EditorField {
  name: string;
  label: string;
  kind: EditorFieldKind;
  /** Longueur maximale, quand le schema en impose une. */
  maxLength?: number;
  options?: Array<{ value: string; label: string }>;
  /** Pour une liste : description des champs de chaque element. */
  itemFields?: EditorField[];
  /** Nombre maximal d elements d une liste. */
  maxItems?: number;
  optional: boolean;
}

/** Libelles en francais courant. Aucun nom technique ne sort d ici. */
const LABELS: Record<string, string> = {
  eyebrow: 'Surtitre',
  title: 'Titre',
  subtitle: 'Sous-titre',
  description: 'Description',
  body: 'Texte',
  blocks: 'Paragraphes',
  media: 'Photo',
  items: 'Éléments',
  actions: 'Boutons',
  layout: 'Disposition',
  columns: 'Colonnes',
  highlights: 'Points forts',
  mediaPosition: 'Position de l’image',
  action: 'Bouton',
  steps: 'Étapes',
  plans: 'Formules',
  categoryFilter: 'Catégories affichées',
  showPrices: 'Afficher les prix',
  showDurations: 'Afficher les durées',
  showBookingButton: 'Proposer la réservation',
  showCoordinates: 'Afficher vos coordonnées',
  showMap: 'Afficher le plan',
  showCurrentStatus: 'Indiquer si c’est ouvert',
  showClosures: 'Afficher les fermetures',
  showContact: 'Afficher les contacts',
  showImages: 'Afficher les photos',
  showAllergens: 'Afficher les allergènes',
  showAddToCart: 'Permettre l’ajout au panier',
  showTeamSelection: 'Laisser choisir la personne',
  showPartySize: 'Demander le nombre de personnes',
  showPast: 'Inclure les dates passées',
  onlyFeatured: 'Uniquement la sélection',
  onlySignature: 'Uniquement les spécialités',
  formSlug: 'Formulaire utilisé',
  menuGroups: 'Cartes affichées',
  limit: 'Nombre affiché',
  zoom: 'Niveau de zoom',
  showDirectionsLink: 'Proposer l’itinéraire',
  transactionKind: 'Type de transaction',
  targetPath: 'Page de résultats',
  grayscale: 'Logos en noir et blanc',
  provider: 'Service',
  resourceId: 'Identifiant',
  aspectRatio: 'Format',
  consentText: 'Texte de consentement',
  presetAmountsCents: 'Montants proposés',
  allowCustomAmount: 'Autoriser un autre montant',
  bookingServiceId: 'Prestation',
  categoryId: 'Catégorie',
  label: 'Libellé',
  value: 'Valeur',
  suffix: 'Suffixe',
  icon: 'Icône',
  quote: 'Témoignage',
  author: 'Auteur',
  role: 'Fonction',
  rating: 'Note',
  date: 'Date',
  question: 'Question',
  answer: 'Réponse',
  price: 'Prix',
  period: 'Période',
  features: 'Ce qui est inclus',
  highlighted: 'Mise en avant',
  name: 'Nom',
  href: 'Lien',
  style: 'Apparence',
  external: 'Ouvrir dans un nouvel onglet',
  alt: 'Description de l’image',
  before: 'Avant',
  after: 'Après',
};

/** Choix presentes en francais plutot qu en identifiants techniques. */
const OPTION_LABELS: Record<string, string> = {
  centered: 'Centré',
  split: 'Deux colonnes',
  overlay: 'Image en fond',
  minimal: 'Épuré',
  grid: 'Grille',
  mosaic: 'Mosaïque',
  carousel: 'Défilement',
  strip: 'Bandeau',
  list: 'Liste',
  cards: 'Cartes',
  table: 'Tableau',
  tabs: 'Onglets',
  columns: 'Colonnes',
  row: 'Ligne',
  single: 'Un seul',
  tags: 'Étiquettes',
  map: 'Carte',
  left: 'À gauche',
  right: 'À droite',
  none: 'Aucune',
  all: 'Tous',
  sale: 'Vente',
  rent: 'Location',
  seasonal: 'Saisonnier',
  primary: 'Bouton principal',
  secondary: 'Bouton secondaire',
  ghost: 'Bouton discret',
  link: 'Lien simple',
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  openstreetmap: 'OpenStreetMap',
  'google-maps': 'Google Maps',
  calendly: 'Calendly',
  '16:9': 'Panoramique (16:9)',
  '4:3': 'Classique (4:3)',
  '1:1': 'Carré',
  main: 'Carte principale',
  lunch: 'Formule midi',
  dinner: 'Carte du soir',
  drinks: 'Boissons',
  wine: 'Vins',
  dessert: 'Desserts',
  brunch: 'Brunch',
  set_menu: 'Menus',
  kids: 'Enfants',
};

function labelFor(name: string): string {
  if (LABELS[name]) return LABELS[name];
  // Repli lisible : « seoTitle » devient « Seo title ». Jamais parfait, mais
  // jamais un identifiant brut non plus.
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function optionLabel(value: string): string {
  return OPTION_LABELS[value] ?? labelFor(value);
}

interface Unwrapped {
  schema: z.ZodTypeAny;
  optional: boolean;
}

/** Retire les enveloppes `default`, `optional` et `nullable`. */
function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let optional = false;

  for (let depth = 0; depth < 8; depth += 1) {
    const def = current.def as { type?: string; innerType?: z.ZodTypeAny };
    if (def.type === 'default' || def.type === 'optional' || def.type === 'nullable') {
      if (def.type !== 'default') optional = true;
      if (!def.innerType) break;
      current = def.innerType;
      continue;
    }
    break;
  }

  return { schema: current, optional };
}

function maxLengthOf(schema: z.ZodTypeAny): number | undefined {
  const checks = (
    schema.def as { checks?: Array<{ _zod?: { def?: { check?: string; maximum?: number } } }> }
  ).checks;
  if (!Array.isArray(checks)) return undefined;
  for (const check of checks) {
    const inner = check?._zod?.def;
    if (inner?.check === 'max_length' && typeof inner.maximum === 'number') return inner.maximum;
  }
  return undefined;
}

function describeField(name: string, schema: z.ZodTypeAny, depth: number): EditorField {
  const { schema: inner, optional } = unwrap(schema);
  const def = inner.def as {
    type?: string;
    entries?: Record<string, string>;
    element?: z.ZodTypeAny;
    shape?: Record<string, z.ZodTypeAny>;
    options?: z.ZodTypeAny[];
  };

  const base = { name, label: labelFor(name), optional };

  switch (def.type) {
    case 'string': {
      const max = maxLengthOf(inner);
      return {
        ...base,
        // Au-dela de 200 caracteres, un champ d une ligne devient penible.
        kind: max !== undefined && max > 200 ? 'textarea' : 'text',
        ...(max !== undefined ? { maxLength: max } : {}),
      };
    }

    case 'number':
      return { ...base, kind: 'number' };

    case 'boolean':
      return { ...base, kind: 'boolean' };

    case 'enum': {
      const values = Object.values(def.entries ?? {});
      return {
        ...base,
        kind: 'select',
        options: values.map((value) => ({ value, label: optionLabel(value) })),
      };
    }

    case 'union': {
      // `z.union([z.literal(2), z.literal(3)])` sert a borner un nombre de
      // colonnes : on le presente comme un choix.
      const literals = (def.options ?? [])
        .map((option) => (option.def as { values?: unknown[] }).values?.[0])
        .filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        );
      if (literals.length > 0) {
        return {
          ...base,
          kind: 'select',
          options: literals.map((value) => ({ value: String(value), label: String(value) })),
        };
      }
      return { ...base, kind: 'unsupported' };
    }

    case 'array': {
      const element = def.element ? unwrap(def.element).schema : null;
      const elementDef = element?.def as
        { type?: string; shape?: Record<string, z.ZodTypeAny> } | undefined;

      if (elementDef?.type === 'string') {
        return { ...base, kind: 'list', itemFields: [] };
      }
      if (elementDef?.type === 'object' && depth < 2 && elementDef.shape) {
        return {
          ...base,
          kind: 'list',
          itemFields: Object.entries(elementDef.shape).map(([key, value]) =>
            describeField(key, value, depth + 1),
          ),
        };
      }
      return { ...base, kind: 'list', itemFields: [] };
    }

    case 'object': {
      const shape = def.shape ?? {};
      // Un objet portant `mediaId` est une reference de media, pas un groupe
      // de champs quelconque : il merite son propre selecteur.
      if ('mediaId' in shape) return { ...base, kind: 'media' };
      if ('href' in shape && 'label' in shape) return { ...base, kind: 'link' };
      if ('kind' in shape && 'text' in shape) return { ...base, kind: 'rich' };
      return { ...base, kind: 'unsupported' };
    }

    default:
      return { ...base, kind: 'unsupported' };
  }
}

/**
 * Champs editables d un type de bloc.
 * Retourne une liste vide pour un type inconnu : l editeur affiche alors un
 * message clair plutot que de planter.
 */
export function editorFieldsFor(blockType: string): EditorField[] {
  const definition = getBlockDefinition(blockType);
  if (!definition) return [];

  const { schema } = unwrap(definition.schema);
  const shape = (schema.def as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (!shape) return [];

  return (
    Object.entries(shape)
      .map(([name, field]) => describeField(name, field, 0))
      // Les champs non representables (identifiants internes, structures
      // exotiques) sont masques plutot que rendus a moitie.
      .filter((field) => field.kind !== 'unsupported')
  );
}
