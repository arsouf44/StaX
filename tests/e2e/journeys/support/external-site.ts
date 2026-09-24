import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildContentBundle,
  contentHash,
  parseManifest,
  sha256Hex,
  stableStringify,
  validateContent,
  type ContentDocument,
  type SiteManifest,
} from '../../../../packages/site-contract/src/index';

/**
 * Un site developpe HORS de StaX, tel que l'equipe le livre : un depot GitHub
 * (manifeste + fichier de contenu que le site lit au build), un projet
 * Cloudflare Pages qui le deploie. Dans la pile de test, GitHub et Cloudflare
 * sont les faux fournisseurs de `tests/e2e/stack/providers.mjs`.
 */

export const PROVIDERS_URL = process.env.STAX_E2E_PROVIDERS_URL ?? 'http://127.0.0.1:54350';
export const CLOUDFLARE_ACCOUNT = '0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e';

/** Contrat d'edition d'un site Premium : une langue, une page d'accueil, des coordonnees. */
export function e2eManifest(siteName: string): SiteManifest {
  const raw = {
    contract: 1,
    site: { name: siteName, locales: ['fr'], defaultLocale: 'fr' },
    content: {
      file: 'src/content/stax.content.json',
      mediaDir: 'public/media/stax',
      mediaUrl: '/media/stax',
    },
    preview: { bridge: true },
    globals: [
      {
        id: 'coordonnees',
        label: 'Coordonnées',
        fields: [
          { id: 'telephone', label: 'Téléphone', type: 'phone', required: true },
          { id: 'email', label: 'E-mail', type: 'email' },
        ],
      },
    ],
    pages: [
      {
        id: 'accueil',
        label: 'Accueil',
        path: '/',
        seo: true,
        sections: [
          {
            id: 'hero',
            label: 'Bandeau d’accueil',
            fields: [
              { id: 'titre', label: 'Titre', type: 'text', required: true, maxLength: 120 },
              { id: 'accroche', label: 'Accroche', type: 'text', maxLength: 200 },
            ],
          },
        ],
      },
    ],
    forms: [
      {
        slug: 'contact',
        label: 'Contact',
        kind: 'contact',
        fields: [
          { name: 'nom', label: 'Nom', type: 'text', required: true },
          { name: 'email', label: 'E-mail', type: 'email', required: true },
          { name: 'message', label: 'Message', type: 'textarea', required: true },
        ],
      },
    ],
    modules: ['contact'],
  };
  const parsed = parseManifest(JSON.stringify(raw));
  if (!parsed.ok) {
    throw new Error(`Manifeste de test invalide : ${JSON.stringify(parsed.errors)}`);
  }
  return parsed.manifest;
}

export function e2eInitialContent(title: string): ContentDocument {
  return {
    globals: { coordonnees: { telephone: '+33 4 78 00 00 00', email: 'contact@exemple.test' } },
    pages: {
      accueil: {
        sections: { hero: { titre: title, accroche: 'Fait maison, chaque matin.' } },
      },
    },
    collections: {},
  };
}

async function providers<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PROVIDERS_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`Faux fournisseurs ${path} : ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export interface SiteInfrastructure {
  installationId: number;
  accountLogin: string;
  accountId: number;
  repositoryId: number;
  repository: string;
  project: string;
  head: string;
  productionUrl: string;
  deploymentId: string;
  deploymentUrl: string;
  manifest: SiteManifest;
  manifestText: string;
  content: ContentDocument;
}

/**
 * Cree le depot et le projet Cloudflare du site chez les faux fournisseurs,
 * comme l'equipe les cree chez les vrais, puis declare l'installation de
 * l'application GitHub a StaX (ce que fait le webhook d'installation).
 */
export async function createSiteInfrastructure(
  service: SupabaseClient,
  options: { slug: string; siteName: string; title: string },
): Promise<SiteInfrastructure> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const installationId = 700_000_000 + seed;
  const accountId = 800_000_000 + seed;
  const repositoryId = 900_000_000 + seed;
  const accountLogin = `stax-sites-${options.slug}`;
  const manifest = e2eManifest(options.siteName);
  const manifestText = JSON.stringify(manifest, null, 2);
  const content = e2eInitialContent(options.title);
  const bundle = buildContentBundle(manifest, content, new Map(), {
    siteId: 'initial',
    version: null,
    releaseId: null,
  });

  const repository = await providers<{ fullName: string; head: string }>('/__fake/repositories', {
    method: 'POST',
    body: JSON.stringify({
      installationId,
      accountLogin,
      accountId,
      repositoryId,
      name: `site-${options.slug}`,
      files: {
        'stax.manifest.json': manifestText,
        [manifest.content.file]: bundle.json,
        'package.json': '{ "name": "site", "private": true }',
      },
    }),
  });
  const project = `site-${options.slug}`.slice(0, 58);
  const created = await providers<{
    productionUrl: string;
    deploymentId: string;
    deploymentUrl: string;
  }>('/__fake/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: project,
      accountId: CLOUDFLARE_ACCOUNT,
      repository: repository.fullName,
      domains: [`www.${options.slug}.example.test`],
    }),
  });

  const { error } = await service.rpc('upsert_github_installation', {
    p_installation_id: installationId,
    p_account_login: accountLogin,
    p_account_id: accountId,
    p_account_type: 'Organization',
    p_repository_selection: 'selected',
    p_suspended: false,
  });
  if (error) throw new Error(`Installation GitHub : ${error.message}`);

  return {
    installationId,
    accountLogin,
    accountId,
    repositoryId,
    repository: repository.fullName,
    project,
    head: repository.head,
    productionUrl: created.productionUrl,
    deploymentId: created.deploymentId,
    deploymentUrl: created.deploymentUrl,
    manifest,
    manifestText,
    content,
  };
}

/**
 * Rattachement par l'equipe (identite d'une personne de l'equipe, RLS
 * appliquee) : depot, projet, contrat d'edition, contenu initial = version 1.
 * Le parcours `external-site.spec.ts` fait la meme chose par l'interface.
 */
export async function connectSiteInfrastructure(
  staff: SupabaseClient,
  siteId: string,
  infra: SiteInfrastructure,
): Promise<void> {
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await staff.rpc(name, args);
    if (error) throw new Error(`${name} : ${error.message}`);
    const result = (data ?? {}) as { ok?: boolean; code?: string };
    if (result.ok === false) throw new Error(`${name} : ${result.code ?? 'refus'}`);
    return data as Record<string, unknown>;
  };

  await call('connect_site_repository', {
    p_site: siteId,
    p_installation_id: infra.installationId,
    p_repository_id: infra.repositoryId,
    p_owner_login: infra.accountLogin,
    p_owner_id: infra.accountId,
    p_name: infra.repository.split('/')[1],
    p_full_name: infra.repository,
    p_html_url: `https://github.com/${infra.repository}`,
    p_default_branch: 'main',
    p_production_branch: 'main',
    p_manifest_path: 'stax.manifest.json',
    p_head_commit_sha: infra.head,
  });
  await call('connect_site_hosting', {
    p_site: siteId,
    p_provider: 'cloudflare_pages',
    p_account_id: CLOUDFLARE_ACCOUNT,
    p_project_name: infra.project,
    p_project_id: null,
    p_production_branch: 'main',
    p_production_url: infra.productionUrl,
    p_workers_trigger_id: null,
  });

  const parsed = parseManifest(infra.manifestText);
  if (!parsed.ok) throw new Error('Manifeste invalide');
  const recorded = await call('record_site_manifest', {
    p_site: siteId,
    p_commit_sha: infra.head,
    p_path: 'stax.manifest.json',
    p_contract_version: parsed.manifest.contract,
    p_manifest: parsed.manifest,
    p_manifest_hash: await sha256Hex(stableStringify(parsed.manifest)),
    p_status: 'valid',
    p_errors: [],
    p_warnings: parsed.warnings,
    p_summary: parsed.summary,
    p_activate: true,
  });

  const content = validateContent(parsed.manifest, infra.content, { mode: 'draft' }).content;
  await call('initialize_site_content', {
    p_site: siteId,
    p_manifest: recorded['manifestId'],
    p_content: content,
    p_content_hash: await contentHash(content),
    p_commit_sha: infra.head,
    p_deployment: {
      status: 'success',
      providerDeploymentId: infra.deploymentId,
      url: infra.deploymentUrl,
    },
  });
}

/**
 * Checklist : les deux controles attestes a la main par l'equipe, et les
 * controles automatiques enregistres par le serveur. Ceux-ci supposent un
 * vrai reseau (HTTPS, domaine) : dans la pile, le serveur les inscrit avec la
 * preuve qu'il aurait relevee.
 */
export async function completeDeliveryChecklist(
  staff: SupabaseClient,
  service: SupabaseClient,
  siteId: string,
  infra: SiteInfrastructure,
): Promise<void> {
  for (const [key, note] of [
    ['forms', 'Formulaire de contact envoyé depuis le site, reçu dans la messagerie StaX.'],
    ['responsive', 'Vérifié sur téléphone, tablette et écran de 1440 px.'],
  ] as const) {
    const { error } = await staff.rpc('attest_delivery_check', {
      p_site: siteId,
      p_key: key,
      p_passed: true,
      p_note: note,
    });
    if (error) throw new Error(`Attestation ${key} : ${error.message}`);
  }
  for (const [key, evidence] of [
    ['deployed', { deployment: infra.deploymentId }],
    ['domain', { hostname: `www.${infra.project}.example.test` }],
    ['https', { status: 200 }],
    ['seo', { title: true, description: true, sitemap: true }],
  ] as const) {
    const { error } = await service.rpc('record_delivery_check', {
      p_site: siteId,
      p_key: key,
      p_passed: true,
      p_evidence: evidence,
    });
    if (error) throw new Error(`Controle ${key} : ${error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Ce que les faux fournisseurs ont recu, et ce qui est « en ligne »          */
/* -------------------------------------------------------------------------- */

export interface RepositoryState {
  branches: Record<string, string>;
  commits: Array<{ sha: string; message: string }>;
  writes: Array<{ branch: string; sha: string; force: boolean; message: string }>;
}

export function repositoryState(fullName: string): Promise<RepositoryState> {
  return providers<RepositoryState>(`/__fake/repositories/${fullName}`);
}

/**
 * Ce que sert le site en ligne : le fichier de contenu du dernier deploiement
 * de production reussi. L'equivalent d'une requete HTTP sur le vrai site.
 */
export async function liveContent(
  project: string,
  file = 'src/content/stax.content.json',
): Promise<{ commit: string; content: Record<string, unknown> | null }> {
  const live = await providers<{ commit: string; content: string | null }>(
    `/__fake/projects/${project}/live?file=${encodeURIComponent(file)}`,
  );
  return {
    commit: live.commit,
    content: live.content ? (JSON.parse(live.content) as Record<string, unknown>) : null,
  };
}

export function failNextDeployment(project: string): Promise<unknown> {
  return providers(`/__fake/projects/${project}/fail-next`, { method: 'POST', body: '{}' });
}
