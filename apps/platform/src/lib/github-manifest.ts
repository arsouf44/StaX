import { readEnv } from '@nemasus/config';

/**
 * Création de l'application GitHub de Nemasus par manifeste.
 *
 * Plutôt que de recopier à la main URL de webhook, permissions et événements
 * (docs/github-integration.md), l'administration envoie à GitHub un manifeste
 * qui les décrit exactement. GitHub crée l'application, puis renvoie vers la
 * plateforme avec un code à usage unique (valable une heure) que l'on échange
 * contre l'identifiant, le nom court, la clé privée et le secret du webhook.
 *
 * Ces secrets sont affichés UNE fois au propriétaire, pour être copiés dans les
 * variables du déploiement : ils ne sont ni journalisés ni écrits en base.
 */

export {
  buildGithubAppManifest,
  isValidGithubOrganization,
  type GithubAppManifest,
} from './github-app-manifest';

/** Page de création : compte personnel, ou organisation qui héberge les dépôts. */
export function githubAppCreationUrl(organization: string | null, state: string): string {
  const web = (readEnv('GITHUB_WEB_BASE_URL') ?? 'https://github.com').replace(/\/+$/, '');
  const path = organization
    ? `/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : '/settings/apps/new';
  return `${web}${path}?state=${encodeURIComponent(state)}`;
}

export interface CreatedGithubApp {
  id: number;
  slug: string;
  name: string;
  htmlUrl: string;
  pem: string;
  webhookSecret: string;
  owner: string | null;
}

/** Échange le code de retour de GitHub contre les identifiants de l'application. */
export async function exchangeManifestCode(
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<CreatedGithubApp> {
  if (!/^[\w-]{8,128}$/.test(code)) throw new Error('Code de retour GitHub invalide.');
  const api = (readEnv('GITHUB_API_BASE_URL') ?? 'https://api.github.com').replace(/\/+$/, '');
  const response = await fetcher(`${api}/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Nemasus',
    },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 422
        ? 'Ce lien de retour a déjà servi ou a expiré (une heure). Recommencez la création.'
        : `GitHub a refusé l’échange (HTTP ${response.status}).`,
    );
  }
  const body = (await response.json()) as {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    html_url?: unknown;
    pem?: unknown;
    webhook_secret?: unknown;
    owner?: { login?: unknown } | null;
  };
  if (
    typeof body.id !== 'number' ||
    typeof body.slug !== 'string' ||
    typeof body.pem !== 'string' ||
    typeof body.webhook_secret !== 'string'
  ) {
    throw new Error('Réponse de GitHub incomplète.');
  }
  return {
    id: body.id,
    slug: body.slug,
    name: typeof body.name === 'string' ? body.name : body.slug,
    htmlUrl: typeof body.html_url === 'string' ? body.html_url : '',
    pem: body.pem,
    webhookSecret: body.webhook_secret,
    owner: typeof body.owner?.login === 'string' ? body.owner.login : null,
  };
}

/**
 * La clé privée sur une seule ligne, encodée en base64 : collée telle quelle
 * dans une variable d'environnement, sans risque de perdre ses retours à la
 * ligne. `GITHUB_APP_PRIVATE_KEY` accepte ce format (docs/github-integration.md).
 */
export function privateKeyForEnv(pem: string): string {
  return Buffer.from(pem.trim(), 'utf8').toString('base64');
}
