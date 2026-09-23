import { z } from 'zod';

/**
 * Texte riche du contrat d'edition.
 *
 * Il n'est JAMAIS stocke en HTML : c'est une structure (paragraphes, titres,
 * listes, citations ; gras, italique, liens), validee champ par champ. Le HTML
 * n'existe qu'a la sortie, produit ici, avec tout le texte echappe. Un client —
 * ou une requete forgee — ne peut donc pas injecter de balisage dans un site.
 */

export const inlineSchema = z
  .object({
    text: z.string().max(10_000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: z.string().max(2000).optional(),
  })
  .strict();

const inlineList = z.array(inlineSchema).max(500);

export const richBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), children: inlineList }).strict(),
  z
    .object({
      type: z.literal('heading'),
      level: z.union([z.literal(2), z.literal(3)]),
      children: inlineList,
    })
    .strict(),
  z
    .object({
      type: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(inlineList).max(200),
    })
    .strict(),
  z.object({ type: z.literal('quote'), children: inlineList }).strict(),
]);

export const richTextSchema = z.array(richBlockSchema).max(500);

export type RichInline = z.infer<typeof inlineSchema>;
export type RichBlock = z.infer<typeof richBlockSchema>;
export type RichText = z.infer<typeof richTextSchema>;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Destination d'un lien saisi par le client : une page du site (`/contact`),
 * une ancre (`#horaires`), un site en https, un e-mail ou un telephone.
 * `javascript:`, `data:` et consorts sont refuses : c'est ce qui rend le texte
 * riche inoffensif dans le site.
 */
export function isSafeHref(href: string, options: { allowExternal?: boolean } = {}): boolean {
  const value = href.trim();
  if (value.length === 0 || value.length > 2000) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (value.startsWith('#')) return /^#[A-Za-z0-9_-]{1,80}$/.test(value);
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(value)) return true;
  if (/^tel:\+?[0-9]{4,20}$/.test(value)) return true;
  if (options.allowExternal === false) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

function inlinesToHtml(children: readonly RichInline[]): string {
  return children
    .map((child) => {
      let html = escapeHtml(child.text).replace(/\n/g, '<br>');
      if (child.bold) html = `<strong>${html}</strong>`;
      if (child.italic) html = `<em>${html}</em>`;
      if (child.href && isSafeHref(child.href)) {
        const external = isExternalHref(child.href);
        html =
          `<a href="${escapeHtml(child.href.trim())}"` +
          (external ? ' rel="noopener noreferrer" target="_blank"' : '') +
          `>${html}</a>`;
      }
      return html;
    })
    .join('');
}

/** HTML sur de toute entree : seul du balisage genere ici en sort. */
export function richTextToHtml(value: RichText): string {
  return value
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return `<p>${inlinesToHtml(block.children)}</p>`;
        case 'heading':
          return `<h${block.level}>${inlinesToHtml(block.children)}</h${block.level}>`;
        case 'quote':
          return `<blockquote><p>${inlinesToHtml(block.children)}</p></blockquote>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          return `<${tag}>${block.items.map((item) => `<li>${inlinesToHtml(item)}</li>`).join('')}</${tag}>`;
        }
        default:
          return '';
      }
    })
    .join('');
}

export function richTextToPlain(value: RichText): string {
  const inline = (children: readonly RichInline[]) => children.map((child) => child.text).join('');
  return value
    .map((block) =>
      block.type === 'list'
        ? block.items.map((item) => `• ${inline(item)}`).join('\n')
        : inline(block.children),
    )
    .join('\n\n')
    .trim();
}

export function richTextLength(value: RichText): number {
  return richTextToPlain(value).length;
}

/** Texte riche a partir d'un texte simple (un paragraphe par ligne vide). */
export function richTextFromPlain(text: string): RichText {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ type: 'paragraph' as const, children: [{ text: part }] }));
}
