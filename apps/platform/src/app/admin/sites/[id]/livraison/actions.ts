'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, tryCreateServiceClient, unwrapMaybe, type Db } from '@stax/database';
import { retryDeployment, type InstallationRepository } from '@stax/infrastructure';
import { emailSchema, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import {
  addDomain,
  connectHosting,
  connectRepository,
  importManifest,
  initializeContent,
  refreshDeployments,
  refreshRepository,
  repositoriesOfInstallation,
  runDeliveryChecks,
  syncDomains,
  syncGitHubInstallations,
  type FlowResult,
  type ManifestImportReport,
} from '~/lib/external-sites/admin-flows';
import { syncHostingDeployments } from '~/lib/external-sites/publisher';
import { loadHosting, toHostingTarget } from '~/lib/external-sites/records';
import { startMaintenanceAtDelivery } from '~/lib/maintenance';
import { sendDeliveryEmails } from '~/lib/delivery-email';
import type { ActionState } from '~/lib/form-state';

/**
 * Actions de la page « Infrastructure & livraison ».
 *
 * Chacune verifie le role COTE SERVEUR, passe la limitation de debit, puis
 * agit avec le jeton de la personne (la base journalise son nom). La cle de
 * service n'est utilisee que pour les fonctions reservees au serveur
 * (preuves de controle, etat relu chez GitHub ou Cloudflare). Aucun secret
 * GitHub ou Cloudflare ne transite jamais par ces reponses.
 */

type Gate = { ok: true; db: Db; service: Db; userId: string } | { ok: false; state: ActionState };

async function gate(role: 'platform_admin' | 'designer' = 'platform_admin'): Promise<Gate> {
  const { session } = await requireAdminRole(role);
  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { ok: false, state: { status: 'error', message: guard.message } };
  const service = tryCreateServiceClient();
  if (!service) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'La clé de service Supabase n’est pas configurée sur ce déploiement.',
      },
    };
  }
  return {
    ok: true,
    db: createUserClient(session.user.accessToken),
    service,
    userId: session.user.id,
  };
}

function toState<T>(result: FlowResult<T>): ActionState {
  return { status: result.ok ? 'success' : 'error', message: result.message };
}

async function siteContext(db: Db, siteId: string) {
  return unwrapMaybe<{ id: string; organization_id: string; architecture: string }>(
    (await db
      .from('sites')
      .select('id, organization_id, architecture')
      .eq('id', siteId)
      .maybeSingle()) as never,
  );
}

function refresh(siteId: string) {
  revalidatePath(`/admin/sites/${siteId}/livraison`);
  revalidatePath(`/admin/sites/${siteId}`);
}

const siteOnly = z.object({ siteId: uuidSchema }).strict();

/* -------------------------------------------------------------------------- */
/*  GitHub                                                                      */
/* -------------------------------------------------------------------------- */

export async function syncInstallationsAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const result = await syncGitHubInstallations(access.service);
  refresh(parsed.data.siteId);
  return toState(result);
}

export async function listRepositoriesAction(payload: unknown): Promise<
  ActionState & {
    repositories?: Array<
      Pick<InstallationRepository, 'id' | 'fullName' | 'defaultBranch' | 'archived' | 'private'>
    >;
  }
> {
  const parsed = z
    .object({ installationId: z.coerce.number().int().positive() })
    .strict()
    .safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Installation invalide.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const result = await repositoriesOfInstallation(parsed.data.installationId);
  if (!result.ok) return { status: 'error', message: result.message };
  return {
    status: 'success',
    message: result.message,
    // Seules des informations publiques du depot sont renvoyees au navigateur.
    repositories: (result.data ?? []).map((repository) => ({
      id: repository.id,
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      archived: repository.archived,
      private: repository.private,
    })),
  };
}

const branchSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._/-]{1,200}$/)
  .refine((value) => !value.includes('..'), 'Branche invalide.');

const connectRepositorySchema = z
  .object({
    siteId: uuidSchema,
    installationId: z.coerce.number().int().positive(),
    repositoryId: z.coerce.number().int().positive(),
    productionBranch: branchSchema,
    manifestPath: z
      .string()
      .trim()
      .regex(/^(?!\/)[A-Za-z0-9._/-]{1,200}\.json$/)
      .refine((value) => !value.includes('..'), 'Chemin invalide.')
      .default('stax.manifest.json'),
  })
  .strict();

export async function connectRepositoryAction(payload: unknown): Promise<ActionState> {
  const parsed = connectRepositorySchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: 'Vérifiez le dépôt, la branche et le chemin du manifeste.' };
  }
  const access = await gate();
  if (!access.ok) return access.state;
  const result = await connectRepository(access.db, parsed.data);
  refresh(parsed.data.siteId);
  return toState(result);
}

const disconnectSchema = z
  .object({ siteId: uuidSchema, reason: z.string().trim().min(5).max(300) })
  .strict();

export async function disconnectRepositoryAction(payload: unknown): Promise<ActionState> {
  const parsed = disconnectSchema.safeParse(payload);
  if (!parsed.success)
    return { status: 'error', message: 'Indiquez le motif (5 caractères minimum).' };
  const access = await gate();
  if (!access.ok) return access.state;
  const { data, error } = await access.db.rpc('disconnect_site_repository', {
    p_site: parsed.data.siteId,
    p_reason: parsed.data.reason,
  });
  refresh(parsed.data.siteId);
  if (error) return { status: 'error', message: 'Déconnexion refusée.' };
  return data
    ? {
        status: 'success',
        message: 'Dépôt détaché. La publication est suspendue jusqu’au prochain rattachement.',
      }
    : { status: 'error', message: 'Aucun dépôt rattaché.' };
}

export async function refreshRepositoryAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate('designer');
  if (!access.ok) return access.state;
  const result = await refreshRepository(access.db, access.service, parsed.data.siteId);
  refresh(parsed.data.siteId);
  return toState(result);
}

/* -------------------------------------------------------------------------- */
/*  Cloudflare                                                                  */
/* -------------------------------------------------------------------------- */

const connectHostingSchema = z
  .object({
    siteId: uuidSchema,
    provider: z.enum(['cloudflare_pages', 'cloudflare_workers']),
    accountId: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{32}$/, 'Identifiant de compte Cloudflare invalide.'),
    projectName: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Nom de projet invalide.'),
    productionUrl: z
      .string()
      .trim()
      .regex(/^https:\/\/[a-z0-9.-]+\/?$/)
      .optional()
      .or(z.literal('')),
    productionBranch: branchSchema.optional().or(z.literal('')),
    workersTriggerId: z
      .string()
      .trim()
      .regex(/^[0-9a-f-]{36}$/)
      .optional()
      .or(z.literal('')),
  })
  .strict();

export async function connectHostingAction(payload: unknown): Promise<ActionState> {
  const parsed = connectHostingSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Vérifiez les informations du projet Cloudflare.',
    };
  }
  const access = await gate();
  if (!access.ok) return access.state;
  const result = await connectHosting(access.db, access.service, {
    siteId: parsed.data.siteId,
    provider: parsed.data.provider,
    accountId: parsed.data.accountId,
    projectName: parsed.data.projectName,
    productionUrl: parsed.data.productionUrl || null,
    productionBranch: parsed.data.productionBranch || null,
    workersTriggerId: parsed.data.workersTriggerId || null,
  });
  refresh(parsed.data.siteId);
  return toState(result);
}

export async function disconnectHostingAction(payload: unknown): Promise<ActionState> {
  const parsed = disconnectSchema.safeParse(payload);
  if (!parsed.success)
    return { status: 'error', message: 'Indiquez le motif (5 caractères minimum).' };
  const access = await gate();
  if (!access.ok) return access.state;
  const { data, error } = await access.db.rpc('disconnect_site_hosting', {
    p_site: parsed.data.siteId,
    p_reason: parsed.data.reason,
  });
  refresh(parsed.data.siteId);
  if (error) return { status: 'error', message: 'Déconnexion refusée.' };
  return data
    ? { status: 'success', message: 'Projet Cloudflare détaché.' }
    : { status: 'error', message: 'Aucun projet rattaché.' };
}

export async function refreshDeploymentsAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate('designer');
  if (!access.ok) return access.state;
  const result = await refreshDeployments(access.db, access.service, parsed.data.siteId);
  refresh(parsed.data.siteId);
  return toState(result);
}

const retrySchema = z.object({ siteId: uuidSchema, deploymentId: uuidSchema }).strict();

/** Relance d'un deploiement : reservee a l'administration, journalisee. */
export async function retryDeploymentAction(payload: unknown): Promise<ActionState> {
  const parsed = retrySchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const deployment = unwrapMaybe<{
    id: string;
    organization_id: string;
    provider_deployment_id: string | null;
    commit_sha: string | null;
    branch: string | null;
    status: string;
  }>(
    (await access.db
      .from('site_deployments')
      .select('id, organization_id, provider_deployment_id, commit_sha, branch, status')
      .eq('id', parsed.data.deploymentId)
      .eq('site_id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  if (!deployment) return { status: 'error', message: 'Déploiement introuvable.' };
  if (!['failure', 'canceled', 'skipped'].includes(deployment.status)) {
    return { status: 'error', message: 'Seul un déploiement en échec se relance.' };
  }
  const hosting = await loadHosting(access.db, parsed.data.siteId);
  if (!hosting) return { status: 'error', message: 'Aucun projet Cloudflare rattaché.' };
  try {
    const providerId = await retryDeployment(toHostingTarget(hosting), {
      providerDeploymentId: deployment.provider_deployment_id,
      commitSha: deployment.commit_sha,
      branch: deployment.branch,
    });
    await access.db.rpc('write_audit', {
      p_action: 'site.deployment_retried',
      p_org: deployment.organization_id,
      p_site: parsed.data.siteId,
      p_target_type: 'site_deployment',
      p_target_id: deployment.id,
      p_metadata: { provider_deployment: providerId, commit: deployment.commit_sha },
    });
    await syncHostingDeployments(access.service, hosting).catch(() => undefined);
    refresh(parsed.data.siteId);
    return {
      status: 'success',
      message: 'Déploiement relancé chez Cloudflare. Son état s’affichera ici dès qu’il évolue.',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Cloudflare a refusé la relance.',
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Contrat d'edition                                                           */
/* -------------------------------------------------------------------------- */

export async function importManifestAction(
  payload: unknown,
): Promise<ActionState & { report?: ManifestImportReport }> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const site = await siteContext(access.db, parsed.data.siteId);
  if (!site || site.architecture !== 'external_repository') {
    return { status: 'error', message: 'Ce site n’utilise pas de contrat d’édition.' };
  }
  const result = await importManifest(access.db, access.service, {
    id: site.id,
    organizationId: site.organization_id,
  });
  refresh(site.id);
  return { ...toState(result), ...(result.ok && result.data ? { report: result.data } : {}) };
}

export async function initializeContentAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const result = await initializeContent(access.db, access.service, parsed.data.siteId);
  refresh(parsed.data.siteId);
  return toState(result);
}

/* -------------------------------------------------------------------------- */
/*  Domaines                                                                    */
/* -------------------------------------------------------------------------- */

const domainSchema = z
  .object({
    siteId: uuidSchema,
    hostname: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/, 'Nom de domaine invalide.'),
    primary: z.boolean().default(true),
  })
  .strict();

export async function addDomainAction(payload: unknown): Promise<ActionState> {
  const parsed = domainSchema.safeParse(payload);
  if (!parsed.success)
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Domaine invalide.' };
  if (/\.(local|localhost|test|internal)$/.test(parsed.data.hostname)) {
    return { status: 'error', message: 'Ce nom de domaine ne peut pas être utilisé sur Internet.' };
  }
  const access = await gate();
  if (!access.ok) return access.state;
  const site = await siteContext(access.db, parsed.data.siteId);
  if (!site) return { status: 'error', message: 'Site introuvable.' };
  const result = await addDomain(
    access.db,
    { id: site.id, organizationId: site.organization_id },
    parsed.data.hostname,
    parsed.data.primary,
  );
  refresh(site.id);
  return toState(result);
}

export async function syncDomainsAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate('designer');
  if (!access.ok) return access.state;
  const result = await syncDomains(access.db, parsed.data.siteId);
  refresh(parsed.data.siteId);
  return toState(result);
}

/* -------------------------------------------------------------------------- */
/*  Checklist, etapes du projet, livraison                                      */
/* -------------------------------------------------------------------------- */

export async function runChecksAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const site = await siteContext(access.db, parsed.data.siteId);
  if (!site) return { status: 'error', message: 'Site introuvable.' };
  const result = await runDeliveryChecks(access.db, access.service, {
    id: site.id,
    organizationId: site.organization_id,
  });
  refresh(site.id);
  return toState(result);
}

const attestSchema = z
  .object({
    siteId: uuidSchema,
    key: z.enum(['forms', 'responsive']),
    passed: z.boolean(),
    note: z
      .string()
      .trim()
      .min(10, 'Décrivez ce qui a été vérifié (10 caractères minimum).')
      .max(1000),
  })
  .strict();

export async function attestCheckAction(payload: unknown): Promise<ActionState> {
  const parsed = attestSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Attestation invalide.' };
  }
  const access = await gate();
  if (!access.ok) return access.state;
  const { error } = await access.db.rpc('attest_delivery_check', {
    p_site: parsed.data.siteId,
    p_key: parsed.data.key,
    p_passed: parsed.data.passed,
    p_note: parsed.data.note,
  });
  refresh(parsed.data.siteId);
  if (error) return { status: 'error', message: 'Attestation refusée.' };
  return {
    status: 'success',
    message: parsed.data.passed ? 'Contrôle attesté, à votre nom.' : 'Contrôle marqué en échec.',
  };
}

const phaseSchema = z
  .object({
    siteId: uuidSchema,
    status: z.enum([
      'ordered',
      'questionnaire_pending',
      'assets_pending',
      'design',
      'client_review',
      'changes_requested',
      'development',
      'verification',
      'deploying',
    ]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function setPhaseAction(payload: unknown): Promise<ActionState> {
  const parsed = phaseSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Étape inconnue.' };
  const access = await gate('designer');
  if (!access.ok) return access.state;
  const { data, error } = await access.db.rpc('set_project_phase', {
    p_site: parsed.data.siteId,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });
  refresh(parsed.data.siteId);
  if (error) {
    return {
      status: 'error',
      message: error.code === '23514' ? 'Ce projet est clos.' : 'Changement d’étape refusé.',
    };
  }
  return data
    ? { status: 'success', message: 'Étape mise à jour : le client la voit dans son espace.' }
    : { status: 'error', message: 'Aucun projet de suivi pour ce site.' };
}

const deliverSchema = z
  .object({
    siteId: uuidSchema,
    email: z.union([emailSchema, z.literal('')]).optional(),
    role: z.enum(['owner', 'admin', 'editor']).default('owner'),
  })
  .strict();

const CHECK_LABELS: Record<string, string> = {
  repository: 'dépôt GitHub',
  hosting: 'projet Cloudflare',
  deployed: 'site déployé',
  domain: 'domaine fonctionnel',
  https: 'HTTPS',
  forms: 'formulaires testés',
  responsive: 'responsive vérifié',
  seo: 'SEO minimum',
  manifest: 'manifest valide',
  editor: 'éditeur compatible',
  client_account: 'compte client',
  plan: 'offre appliquée',
};

const DELIVERY_ERRORS: Record<string, string> = {
  no_account:
    'Aucun compte StaX n’utilise cette adresse. Le client doit d’abord créer son compte (ou utiliser un code d’activation).',
  no_client: 'Ce site n’a encore aucun client rattaché : indiquez l’adresse de son compte.',
  not_found: 'Ce site est introuvable.',
  archived: 'Ce site est archivé.',
};

/** « Livrer le site au client » : checklist exigee par la base, puis maintenance. */
export async function deliverExternalSiteAction(payload: unknown): Promise<ActionState> {
  const parsed = deliverSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Vérifiez l’adresse e-mail du client.' };
  const access = await gate();
  if (!access.ok) return access.state;

  const { data, error } = await access.db.rpc('deliver_site', {
    p_site: parsed.data.siteId,
    p_email: parsed.data.email ? parsed.data.email.trim().toLowerCase() : null,
    p_role: parsed.data.role,
  });
  if (error) return { status: 'error', message: 'La livraison a été refusée.' };
  const result = (data ?? {}) as { ok?: boolean; code?: string; missing?: string[] };
  if (!result.ok) {
    if (result.code === 'checklist_incomplete') {
      const missing = (result.missing ?? []).map((key) => CHECK_LABELS[key] ?? key).join(', ');
      return { status: 'error', message: `Checklist incomplète : ${missing}.` };
    }
    return {
      status: 'error',
      message: DELIVERY_ERRORS[result.code ?? ''] ?? 'La livraison a été refusée.',
    };
  }

  // La maintenance mensuelle commence ICI, a la livraison.
  const maintenance = await startMaintenanceAtDelivery(access.service, parsed.data.siteId);
  await sendDeliveryEmails(access.service, parsed.data.siteId).catch((mailError: unknown) => {
    console.error('[stax:delivery] e-mail de livraison', mailError);
  });
  refresh(parsed.data.siteId);
  revalidatePath('/admin/sites');
  const maintenanceText =
    maintenance.status === 'started'
      ? ' La maintenance mensuelle démarre aujourd’hui.'
      : maintenance.status === 'failed'
        ? ` Attention : la maintenance n’a pas pu démarrer (${maintenance.message}). Relancez-la depuis cette page.`
        : '';
  return {
    status: maintenance.status === 'failed' ? 'error' : 'success',
    message: `Site livré : le client en a désormais la main, il a été prévenu.${maintenanceText}`,
  };
}

export async function retryMaintenanceAction(payload: unknown): Promise<ActionState> {
  const parsed = siteOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await gate();
  if (!access.ok) return access.state;
  const site = unwrapMaybe<{ delivered_at: string | null }>(
    (await access.db
      .from('sites')
      .select('delivered_at')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  if (!site?.delivered_at) {
    return { status: 'error', message: 'La maintenance ne démarre qu’à la livraison du site.' };
  }
  const maintenance = await startMaintenanceAtDelivery(access.service, parsed.data.siteId);
  refresh(parsed.data.siteId);
  if (maintenance.status === 'started') {
    return { status: 'success', message: 'Maintenance mensuelle démarrée.' };
  }
  if (maintenance.status === 'not_applicable') {
    return { status: 'error', message: 'Aucune maintenance en attente pour ce site.' };
  }
  return { status: 'error', message: maintenance.message };
}
