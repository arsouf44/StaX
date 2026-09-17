import { escapeHtml } from '@stax/security';

/**
 * Production de HTML sans DOM.
 *
 * Les sites clients sont rendus en HTML par un Worker Cloudflare, sans React
 * cote serveur ni hydratation cote navigateur : une page de site vitrine n a
 * pas besoin d embarquer un moteur de rendu de 40 ko pour afficher du texte.
 *
 * Regle de securite structurante : `html` ECHAPPE tout ce qui est interpole.
 * La seule facon d inserer du balisage est de passer par `raw()`, ce qui rend
 * chaque echappatoire visible a la relecture et cherchable dans le depot.
 */

const RAW = Symbol('stax.raw');

export interface RawHtml {
  readonly [RAW]: true;
  readonly value: string;
}

export function raw(value: string): RawHtml {
  return { [RAW]: true, value };
}

export function isRaw(value: unknown): value is RawHtml {
  return typeof value === 'object' && value !== null && RAW in value;
}

export type Renderable = RawHtml | string | number | null | undefined | false | Renderable[];

function stringify(value: Renderable): string {
  if (value === null || value === undefined || value === false) return '';
  if (isRaw(value)) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  if (typeof value === 'number') return String(value);
  return escapeHtml(value);
}

/** Gabarit HTML : tout ce qui est interpole est echappe, sauf `raw()`. */
export function html(strings: TemplateStringsArray, ...values: Renderable[]): RawHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i += 1) {
    out += stringify(values[i]) + (strings[i + 1] ?? '');
  }
  return raw(out);
}

/** Concatene des fragments sans separateur. */
export function join(parts: Renderable[], separator = ''): RawHtml {
  return raw(parts.map(stringify).filter(Boolean).join(separator));
}

/** Rend la chaine finale, pour ecriture dans une reponse HTTP. */
export function renderToString(value: Renderable): string {
  return stringify(value);
}

/**
 * Construit une liste de classes. Les valeurs fausses sont ignorees, ce qui
 * evite les `class=" undefined"` et les conditions ternaires illisibles.
 */
export function cls(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * Serialise des attributs. Une valeur `true` produit un attribut booleen,
 * `false`/`null`/`undefined` supprime l attribut, le reste est echappe.
 */
export function attrs(map: Record<string, string | number | boolean | null | undefined>): RawHtml {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === false || value === null || value === undefined || value === '') continue;
    if (value === true) {
      parts.push(escapeHtml(key));
      continue;
    }
    parts.push(`${escapeHtml(key)}="${escapeHtml(String(value))}"`);
  }
  return raw(parts.length > 0 ? ` ${parts.join(' ')}` : '');
}
