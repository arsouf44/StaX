/**
 * Adresse que l'editeur peut encadrer : le build servi par le projet
 * Cloudflare du site (`*.pages.dev`, `*.workers.dev`), en HTTPS.
 *
 * La politique de securite de l'editeur (`src/proxy.ts`) n'autorise que ces
 * origines dans un iframe. Le domaine du client sert le meme deploiement, mais
 * l'autoriser supposerait d'ouvrir l'editeur a n'importe quelle origine.
 */
export function frameableProjectUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return /\.(pages|workers)\.dev$/.test(parsed.hostname) ? `${parsed.origin}/` : null;
  } catch {
    return null;
  }
}
