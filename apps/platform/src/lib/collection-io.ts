import 'server-only';
import { MoneyError, moneyInputValue, parseMoneyInput } from '@stax/payments';
import { slugify } from '@stax/security';
import type { CollectionDescriptor, CollectionField } from './collections';

/**
 * Traduction entre un formulaire HTML et une ligne PostgreSQL.
 *
 * Trois regles tiennent tout :
 *
 *  1. SEULS les champs declares dans la collection sont lus. Un navigateur qui
 *     poste `organization_id`, `price_cents` sur une table qui ne le declare
 *     pas, ou n'importe quel autre nom, ne produit rien : la valeur n'est meme
 *     pas regardee. C'est la defense contre l'affectation de masse.
 *  2. Les montants passent par `parseMoneyInput`, donc par des entiers de
 *     centimes, jamais par un flottant.
 *  3. Le resultat est ENSUITE valide par le schema Zod de la collection, qui
 *     reste l'autorite sur les bornes, les enumerations et les formats.
 */

export interface ParsedForm {
  values: Record<string, unknown>;
  errors: Record<string, string[]>;
}

function isAttributePath(column: string): boolean {
  return column.includes('.');
}

/** Valeur brute d'un champ, convertie selon son type d'affichage. */
function readField(field: CollectionField, formData: FormData): unknown {
  if (field.kind === 'boolean') {
    // Une case decochee n'est pas transmise : l'absence vaut « non ».
    return formData.get(field.name) === 'on';
  }

  if (field.kind === 'multiselect') {
    return formData
      .getAll(field.name)
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .filter((entry) => entry.length > 0);
  }

  const raw = formData.get(field.name);
  const text = typeof raw === 'string' ? raw.trim() : '';

  if (field.kind === 'money') {
    return text === '' ? null : parseMoneyInput(text);
  }

  if (field.kind === 'number') {
    if (text === '') return null;
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (field.kind === 'select' && field.valueType === 'number') {
    if (text === '') return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (text === '') {
    // Une chaine vide n'est jamais une valeur : c'est une absence. Les schemas
    // optionnels attendent `undefined`, les champs effacables attendent `null`.
    return field.required ? '' : field.kind === 'reference' ? null : undefined;
  }

  return text;
}

export function parseCollectionForm(
  descriptor: CollectionDescriptor,
  formData: FormData,
): ParsedForm {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string[]> = {};

  for (const field of descriptor.fields) {
    let value: unknown;
    try {
      value = readField(field, formData);
    } catch (error) {
      errors[field.name] = [
        error instanceof MoneyError ? error.message : 'Cette valeur n’est pas lisible.',
      ];
      continue;
    }

    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.length === 0) ||
      (typeof value === 'number' && Number.isNaN(value));

    if (field.required && missing) {
      errors[field.name] = [`« ${field.label} » est obligatoire.`];
      continue;
    }

    if (value !== undefined) values[field.name] = value;
  }

  return { values, errors };
}

/**
 * Ligne PostgreSQL a partir des donnees validees.
 *
 * Les attributs propres a une collection (`attributes.rating`…) sont
 * rassembles dans le seul objet JSON declare, jamais ecrits a plat.
 */
export function toDatabaseRow(
  descriptor: CollectionDescriptor,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = {};
  let hasAttributes = false;

  for (const field of descriptor.fields) {
    if (!Object.hasOwn(data, field.name)) continue;
    const value = data[field.name];

    if (isAttributePath(field.column)) {
      hasAttributes = true;
      const key = field.column.slice(field.column.indexOf('.') + 1);
      if (value !== undefined && value !== null && value !== '') attributes[key] = value;
      continue;
    }

    row[field.column] = value === undefined ? null : value;
  }

  if (hasAttributes) row.attributes = attributes;

  return row;
}

/** Valeurs pre-remplies du formulaire d'edition, a partir de la ligne lue. */
export function toFormValues(
  descriptor: CollectionDescriptor,
  row: Record<string, unknown>,
): Record<string, string | boolean | string[]> {
  const values: Record<string, string | boolean | string[]> = {};
  const attributes =
    typeof row.attributes === 'object' && row.attributes !== null
      ? (row.attributes as Record<string, unknown>)
      : {};

  for (const field of descriptor.fields) {
    const raw = isAttributePath(field.column)
      ? attributes[field.column.slice(field.column.indexOf('.') + 1)]
      : row[field.column];

    if (field.kind === 'boolean') {
      values[field.name] = raw === true;
      continue;
    }

    if (field.kind === 'multiselect') {
      values[field.name] = Array.isArray(raw) ? raw.map((entry) => String(entry)) : [];
      continue;
    }

    if (raw === null || raw === undefined) {
      values[field.name] = '';
      continue;
    }

    if (field.kind === 'money') {
      values[field.name] = moneyInputValue(typeof raw === 'number' ? raw : Number(raw));
      continue;
    }

    if (field.kind === 'date') {
      // Une date stockee en timestamptz revient en ISO complet : le champ HTML
      // n'accepte que la partie calendaire.
      values[field.name] = String(raw).slice(0, 10);
      continue;
    }

    if (field.kind === 'time') {
      values[field.name] = String(raw).slice(0, 5);
      continue;
    }

    values[field.name] = String(raw);
  }

  return values;
}

/**
 * Identifiant d'URL d'un nouvel element.
 *
 * Il n'est calcule QU'A LA CREATION. Renommer un element ne change pas son
 * adresse publique : une page deja partagee, indexee ou imprimee sur une carte
 * de visite doit continuer de repondre.
 */
export function buildSlug(source: string, taken: ReadonlySet<string>, maxLength = 60): string {
  const base = slugify(source, maxLength - 6) || 'element';
  const safe = base.length >= 2 ? base : `${base}-1`;
  if (!taken.has(safe)) return safe;

  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${safe}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${safe}-${Date.now().toString(36)}`;
}
