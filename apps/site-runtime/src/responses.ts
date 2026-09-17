import { CACHE_POLICIES, securityHeaders } from '@stax/security';
import { escapeHtml } from '@stax/security';
import { SITE_STYLESHEET, resolveTheme } from '@stax/site-engine';

/**
 * Reponses du Worker.
 *
 * Toutes passent par ici afin qu aucune ne parte sans en-tetes de securite :
 * un oubli ponctuel sur une route serait une faille silencieuse.
 */

export function htmlResponse(
  body: string,
  init: { status?: number; nonce: string; cache?: string; allowMaps?: boolean },
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': init.cache ?? CACHE_POLICIES.private,
      ...securityHeaders({
        profile: 'tenant-site',
        nonce: init.nonce,
        allowMaps: init.allowMaps ?? false,
        connectSrc: ["'self'"],
      }),
    },
  });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...securityHeaders({ profile: 'api' }),
      ...extra,
    },
  });
}

export function textResponse(
  body: string,
  contentType: string,
  cache = CACHE_POLICIES.publicApi,
): Response {
  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': cache,
      ...securityHeaders({ profile: 'api' }),
    },
  });
}

export function redirectResponse(location: string, status = 301): Response {
  return new Response(null, {
    status,
    headers: { location, 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}

/**
 * Page d etat autonome.
 *
 * Volontairement sans dependance au theme du client : elle s affiche meme
 * quand le site n a pas encore de version publiee, ou quand la base est
 * injoignable.
 */
export interface StatusPageInput {
  status: number;
  title: string;
  message: string;
  detail?: string;
  action?: { label: string; href: string };
  nonce: string;
}

export function statusPage(input: StatusPageInput): Response {
  const theme = resolveTheme({});
  const body = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.title)}</title>
<meta name="robots" content="noindex, nofollow" />
<style nonce="${escapeHtml(input.nonce)}">
:root{${theme.cssVariables}}
${SITE_STYLESHEET}
.state{min-height:100dvh;display:grid;place-items:center;padding:2rem}
.state-in{max-width:34rem;text-align:center}
.state-code{font-family:var(--site-font-heading);font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;color:var(--site-muted)}
</style>
</head>
<body>
<main class="state">
  <div class="state-in">
    <p class="state-code">Erreur ${input.status}</p>
    <h1 style="margin-top:1rem">${escapeHtml(input.title)}</h1>
    <p class="lede">${escapeHtml(input.message)}</p>
    ${input.detail ? `<p class="muted" style="margin-top:1rem;font-size:.875rem">${escapeHtml(input.detail)}</p>` : ''}
    ${
      input.action
        ? `<p class="row" style="margin-top:2rem;justify-content:center"><a class="btn btn-primary" href="${escapeHtml(input.action.href)}">${escapeHtml(input.action.label)}</a></p>`
        : ''
    }
  </div>
</main>
</body>
</html>`;

  return htmlResponse(body, { status: input.status, nonce: input.nonce });
}
