/**
 * Assainissement du contenu.
 *
 * Choix d'architecture : le contenu riche n'est JAMAIS stocke en HTML. Il est
 * stocke en blocs structures (voir @stax/site-engine), et le rendu produit le
 * HTML a partir de ces structures. Une injection ne peut donc pas survivre au
 * cycle de vie du contenu — il n'existe aucun chemin ou une chaine fournie par
 * l'utilisateur serait interpretee comme du balisage.
 *
 * Ce module fournit les garde-fous complementaires : echappement, allowlist de
 * balises pour les rares champs de texte enrichi, et nettoyage des chaines.
 */

// U+2028 / U+2029 terminent une ligne en JavaScript mais pas en JSON :
// non echappes, ils cassent un bloc <script> embarquant du JSON-LD.
const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Echappe une chaine destinee a etre interpolee dans du HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Echappe une chaine destinee a un attribut HTML. */
export function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/**
 * Echappe une chaine destinee a etre inseree dans un bloc JSON-LD.
 * Neutralise la sequence de fermeture de balise script, seule veritable
 * echappatoire dans ce contexte.
 */
export function escapeJsonLd(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATORS, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'));
}

/**
 * Balises autorisees dans un champ de texte enrichi (description longue d'un
 * produit, article). Volontairement minimal : aucune balise capable de charger
 * une ressource, d'executer du code ou de modifier la mise en page globale.
 */
const ALLOWED_INLINE_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'blockquote', 'code',
]);

const ALLOWED_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'title']),
};

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

/**
 * Assainit un fragment HTML par reconstruction : le document d'entree est
 * tokenise, et seules les balises et attributs explicitement autorises sont
 * reemis. Tout le reste est supprime ou echappe.
 *
 * Fonctionne sans DOM, donc identiquement sur Cloudflare Workers et Node.
 */
export function sanitizeRichText(input: string, maxLength = 20_000): string {
  if (!input) return '';
  const source = input.slice(0, maxLength);
  const out: string[] = [];
  const openTags: string[] = [];

  // Retire d'emblee les contenus dont le texte lui-meme est dangereux.
  const stripped = source
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const tokenizer = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenizer.exec(stripped)) !== null) {
    out.push(escapeHtml(stripped.slice(lastIndex, match.index)));
    lastIndex = tokenizer.lastIndex;

    const raw = match[0];
    const tag = (match[1] ?? '').toLowerCase();
    const attrs = match[2] ?? '';
    const isClosing = raw.startsWith('</');

    if (!ALLOWED_INLINE_TAGS.has(tag)) {
      continue; // Balise inconnue : purement et simplement supprimee.
    }

    if (isClosing) {
      const index = openTags.lastIndexOf(tag);
      if (index !== -1) {
        openTags.splice(index, 1);
        out.push(`</${tag}>`);
      }
      continue;
    }

    if (tag === 'br') {
      out.push('<br />');
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[tag];
    const kept: string[] = [];
    if (allowed) {
      const attrPattern = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrPattern.exec(attrs)) !== null) {
        const name = (attrMatch[1] ?? '').toLowerCase();
        const value = attrMatch[3] ?? attrMatch[4] ?? '';
        if (!allowed.has(name)) continue;
        if (name === 'href' && !SAFE_HREF.test(value.trim())) continue;
        kept.push(`${name}="${escapeAttribute(value)}"`);
      }
      if (tag === 'a') {
        // Tout lien sortant est neutralise contre le detournement d'onglet.
        kept.push('rel="noopener noreferrer nofollow"');
      }
    }

    openTags.push(tag);
    out.push(kept.length > 0 ? `<${tag} ${kept.join(' ')}>` : `<${tag}>`);
  }

  out.push(escapeHtml(stripped.slice(lastIndex)));

  // Referme proprement les balises restees ouvertes.
  while (openTags.length > 0) {
    out.push(`</${openTags.pop()}>`);
  }
  return out.join('');
}

/** Texte simple : retire tout balisage et normalise les espaces. */
export function sanitizePlainText(input: string, maxLength = 5_000): string {
  return input
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, '')
    .replace(new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g'), '')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

/**
 * Neutralise l'injection de formule dans un export CSV : un tableur execute
 * une cellule commencant par =, +, - ou @.
 */
export function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  const needsGuard = /^[=+\-@\t\r]/.test(escaped);
  return `"${needsGuard ? `'${escaped}` : escaped}"`;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
