/**
 * Manifeste de l'application GitHub de Nemasus : module pur, partagé entre le
 * serveur et le formulaire de l'administration. Voir `github-manifest.ts`.
 */

export interface GithubAppManifest {
  name: string;
  url: string;
  hook_attributes: { url: string; active: boolean };
  redirect_url: string;
  description: string;
  public: false;
  default_permissions: { contents: 'write'; metadata: 'read' };
  default_events: string[];
}

/** Le strict nécessaire : écrire les publications, lire les dépôts. Rien d'autre. */
export function buildGithubAppManifest(platformUrl: string, name: string): GithubAppManifest {
  const base = platformUrl.replace(/\/+$/, '');
  return {
    name,
    url: base,
    hook_attributes: { url: `${base}/api/webhooks/github`, active: true },
    redirect_url: `${base}/admin/integrations/github/retour`,
    description: 'Publie les modifications des clients Nemasus dans le dépôt de leur site.',
    public: false,
    default_permissions: { contents: 'write', metadata: 'read' },
    // « installation » est toujours envoyé ; les autres sont ceux que le
    // webhook de la plateforme traite.
    default_events: ['installation_repositories', 'push', 'repository'],
  };
}

/** Nom d'organisation GitHub : lettres, chiffres, tirets, 39 caractères au plus. */
const GITHUB_ORG = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export function isValidGithubOrganization(value: string): boolean {
  return GITHUB_ORG.test(value);
}
