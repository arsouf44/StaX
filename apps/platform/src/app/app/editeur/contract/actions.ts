'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasFeature, tryCreateServiceClient, unwrapMaybe, type Db } from '@stax/database';
import { parseManifest, validateContent, type ValueIssue } from '@stax/site-contract';
import { uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import {
  processPreview,
  processRelease,
  syncHostingDeployments,
} from '~/lib/external-sites/publisher';
import { loadHosting } from '~/lib/external-sites/records';
import { getWorkspace } from '~/lib/workspace';
import { loadReleaseViews } from './data';
import type { ReleaseView } from './types';

/**
 * Actions de l'editeur d'un site independant.
 *
 * Les droits ne sont pas decides ici : chaque ecriture passe par le JETON de
 * la personne et par une fonction SQL qui verifie qu'elle peut modifier CE
 * site, et que le site lui a ete livre (`app.site_content_access`). Avant la
 * livraison, un client recoit un refus de la base, quoi que fasse
 * l'interface.
 *
 * La cle de service n'intervient qu'APRES, pour le travail que seul le
 * serveur fait : ecrire le commit dans le depot et relire Cloudflare.
 */

export type ContractResult<T = object> =
  | ({ status: 'success'; message?: string } & T)
  | { status: 'error'; message: string; issues?: ValueIssue[]; revision?: number };

async function context() {
  const { workspace, db, userId } = await getWorkspace();
  const site = workspace.currentSite;
  if (!site || site.architecture !== 'external_repository') return null;
  return { workspace, db, userId, site };
}

async function activeManifest(db: Db, siteId: string) {
  const row = unwrapMaybe<{ manifest: unknown }>(
    (await db
      .from('site_manifests')
      .select('manifest')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .maybeSingle()) as never,
  );
  const parsed = row ? parseManifest(row.manifest) : null;
  return parsed?.ok ? parsed.manifest : null;
}

const DENIED =
  'Votre site est encore entre les mains de l’équipe StaX : vous pourrez le modifier dès sa livraison.';

/* -------------------------------------------------------------------------- */
/*  Brouillon                                                                   */
/* -------------------------------------------------------------------------- */

const saveSchema = z
  .object({
    content: z.record(z.string(), z.unknown()),
    expectedRevision: z.number().int().min(1),
  })
  .strict();

export async function saveContractDraftAction(
  payload: unknown,
): Promise<ContractResult<{ revision: number; warnings: ValueIssue[]; dropped: string[] }>> {
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Contenu illisible.' };
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site à modifier.' };
  const guard = await guardAction({ limit: 'apiWrite', userId: ctx.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const manifest = await activeManifest(ctx.db, ctx.site.id);
  if (!manifest)
    return { status: 'error', message: 'Le contrat d’édition du site est indisponible.' };

  // Le serveur revalide TOUT : ce qui n'est pas declare par le contrat est
  // retire, ce qui est invalide est refuse.
  const validation = validateContent(manifest, parsed.data.content, { mode: 'draft' });
  if (!validation.ok) {
    return {
      status: 'error',
      message: 'Certaines valeurs ne sont pas valides : corrigez-les avant d’enregistrer.',
      issues: validation.errors,
    };
  }

  const { data, error } = await ctx.db.rpc('save_site_draft', {
    p_site: ctx.site.id,
    p_content: validation.content,
    p_expected_revision: parsed.data.expectedRevision,
  });
  if (error) {
    return {
      status: 'error',
      message: error.code === '42501' ? DENIED : 'Enregistrement impossible.',
    };
  }
  const result = (data ?? {}) as { ok?: boolean; code?: string; revision?: number };
  if (!result.ok) {
    if (result.code === 'conflict') {
      return {
        status: 'error',
        message:
          'Le brouillon a été modifié entre-temps (autre onglet ou autre personne). Rechargez la page pour repartir de la dernière version.',
        revision: result.revision,
      };
    }
    return { status: 'error', message: 'Enregistrement refusé.' };
  }
  revalidatePath('/app');
  return {
    status: 'success',
    message: 'Brouillon enregistré. Votre site en ligne n’a pas changé.',
    revision: result.revision ?? parsed.data.expectedRevision + 1,
    warnings: validation.warnings,
    dropped: validation.dropped,
  };
}

/* -------------------------------------------------------------------------- */
/*  Apercu : un vrai build Cloudflare du brouillon                              */
/* -------------------------------------------------------------------------- */

export async function requestContractPreviewAction(): Promise<
  ContractResult<{ previewId: string }>
> {
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site à prévisualiser.' };
  const guard = await guardAction({ limit: 'apiWrite', userId: ctx.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { data, error } = await ctx.db.rpc('begin_site_preview', { p_site: ctx.site.id });
  if (error) {
    return { status: 'error', message: error.code === '42501' ? DENIED : 'Aperçu impossible.' };
  }
  const result = (data ?? {}) as { ok?: boolean; code?: string; deploymentId?: string };
  if (!result.ok || !result.deploymentId) {
    const messages: Record<string, string> = {
      rate_limited: 'Beaucoup d’aperçus en une heure : patientez quelques minutes.',
      preview_in_progress: 'Un aperçu est déjà en préparation.',
      infrastructure_missing: 'L’hébergement du site n’est pas disponible : contactez StaX.',
      not_initialized: 'Le site n’est pas encore prêt pour un aperçu.',
    };
    return { status: 'error', message: messages[result.code ?? ''] ?? 'Aperçu impossible.' };
  }
  const service = tryCreateServiceClient();
  if (!service) return { status: 'error', message: 'Service momentanément indisponible.' };
  const outcome = await processPreview(service, result.deploymentId);
  if (outcome.status === 'failed') return { status: 'error', message: outcome.message };
  return {
    status: 'success',
    message: 'Aperçu en préparation : votre site est reconstruit avec le brouillon.',
    previewId: result.deploymentId,
  };
}

export async function contractPreviewStatusAction(
  payload: unknown,
): Promise<
  ContractResult<{ preview: { status: string; url: string | null; error: string | null } }>
> {
  const parsed = z.object({ previewId: uuidSchema }).strict().safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Aperçu inconnu.' };
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site.' };

  const read = async () =>
    unwrapMaybe<{
      status: string;
      url: string | null;
      error_message: string | null;
      created_at: string;
    }>(
      (await ctx.db
        .from('site_deployments')
        .select('status, url, error_message, created_at')
        .eq('id', parsed.data.previewId)
        .eq('site_id', ctx.site.id)
        .maybeSingle()) as never,
    );
  let row = await read();
  if (!row) return { status: 'error', message: 'Aperçu introuvable.' };

  // Relecture de Cloudflare a la demande (limitee), pour ne pas attendre la
  // tache de fond pendant que la personne regarde son ecran.
  if (['queued', 'building', 'deploying'].includes(row.status)) {
    const guard = await guardAction({ limit: 'providerSync', userId: ctx.userId });
    const service = guard.ok ? tryCreateServiceClient() : null;
    if (service) {
      const hosting = await loadHosting(service, ctx.site.id);
      if (hosting) await syncHostingDeployments(service, hosting).catch(() => undefined);
      row = (await read()) ?? row;
    }
  }
  return {
    status: 'success',
    preview: { status: row.status, url: row.url, error: row.error_message },
  };
}

/* -------------------------------------------------------------------------- */
/*  Publication, programmation, restauration                                   */
/* -------------------------------------------------------------------------- */

const publishSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    note: z.string().trim().max(200).optional(),
    scheduledFor: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const RELEASE_ERRORS: Record<string, string> = {
  release_in_progress: 'Une publication est déjà en cours : attendez qu’elle se termine.',
  schedule_exists: 'Une publication est déjà programmée : annulez-la d’abord.',
  conflict: 'Le brouillon a changé entre-temps : enregistrez-le de nouveau, puis publiez.',
  feature_unavailable: 'La publication programmée n’est pas incluse dans votre offre.',
  schedule_out_of_range: 'Choisissez une date entre dans 5 minutes et dans un an.',
  infrastructure_missing: 'L’hébergement du site n’est pas disponible : contactez StaX.',
  site_unavailable: 'Votre site est suspendu : la publication est impossible.',
  not_initialized: 'Le site n’est pas encore prêt.',
  source_not_found: 'Cette version est introuvable.',
};

export async function publishContractAction(
  payload: unknown,
): Promise<ContractResult<{ releaseId: string; version: number; scheduled: boolean }>> {
  const parsed = publishSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande de publication invalide.' };
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site à publier.' };
  const guard = await guardAction({ limit: 'apiWrite', userId: ctx.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  // Le brouillon EXACT qui sera publie est relu et valide en mode publication.
  const [manifest, draft] = await Promise.all([
    activeManifest(ctx.db, ctx.site.id),
    (async () =>
      unwrapMaybe<{ content: unknown; revision: number }>(
        (await ctx.db
          .from('site_content_drafts')
          .select('content, revision')
          .eq('site_id', ctx.site.id)
          .maybeSingle()) as never,
      ))(),
  ]);
  if (!manifest || !draft) return { status: 'error', message: 'Le site n’est pas encore prêt.' };
  if (draft.revision !== parsed.data.expectedRevision) {
    return {
      status: 'error',
      message: RELEASE_ERRORS['conflict'] ?? 'Conflit.',
      revision: draft.revision,
    };
  }
  const validation = validateContent(manifest, draft.content, { mode: 'publish' });
  if (!validation.ok) {
    return {
      status: 'error',
      message: 'Quelques éléments sont à compléter avant de publier.',
      issues: validation.errors,
    };
  }

  const { data, error } = await ctx.db.rpc('request_site_release', {
    p_site: ctx.site.id,
    p_kind: 'publish',
    p_source_release: null,
    p_expected_revision: parsed.data.expectedRevision,
    p_scheduled_for: parsed.data.scheduledFor ?? null,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    return { status: 'error', message: error.code === '42501' ? DENIED : 'Publication refusée.' };
  }
  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    releaseId?: string;
    version?: number;
    scheduled?: boolean;
  };
  if (!result.ok || !result.releaseId) {
    return {
      status: 'error',
      message: RELEASE_ERRORS[result.code ?? ''] ?? 'Publication refusée.',
    };
  }

  if (!result.scheduled) {
    // L'ecriture dans le depot commence tout de suite ; le deploiement
    // Cloudflare prend ensuite quelques minutes. « Publie » ne s'affichera
    // qu'apres sa confirmation.
    const service = tryCreateServiceClient();
    if (service) await processRelease(service, result.releaseId).catch(() => undefined);
  }
  revalidatePath('/app');
  revalidatePath('/app/site/versions');
  return {
    status: 'success',
    message: result.scheduled
      ? 'Publication programmée.'
      : 'Publication lancée : votre site est en cours de mise à jour.',
    releaseId: result.releaseId,
    version: result.version ?? 0,
    scheduled: Boolean(result.scheduled),
  };
}

export async function restoreReleaseAction(
  payload: unknown,
): Promise<ContractResult<{ releaseId: string; version: number }>> {
  const parsed = z
    .object({ sourceReleaseId: uuidSchema, note: z.string().trim().max(200).optional() })
    .strict()
    .safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Version inconnue.' };
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site.' };
  const guard = await guardAction({ limit: 'apiWrite', userId: ctx.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { data, error } = await ctx.db.rpc('request_site_release', {
    p_site: ctx.site.id,
    p_kind: 'rollback',
    p_source_release: parsed.data.sourceReleaseId,
    p_expected_revision: null,
    p_scheduled_for: null,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    return { status: 'error', message: error.code === '42501' ? DENIED : 'Restauration refusée.' };
  }
  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    releaseId?: string;
    version?: number;
  };
  if (!result.ok || !result.releaseId) {
    return {
      status: 'error',
      message: RELEASE_ERRORS[result.code ?? ''] ?? 'Restauration refusée.',
    };
  }
  const service = tryCreateServiceClient();
  if (service) await processRelease(service, result.releaseId).catch(() => undefined);
  revalidatePath('/app/site/versions');
  revalidatePath('/app');
  return {
    status: 'success',
    message:
      'Restauration lancée : cette version est redéployée, votre site sera mis à jour dans quelques minutes.',
    releaseId: result.releaseId,
    version: result.version ?? 0,
  };
}

export async function cancelScheduledReleaseAction(payload: unknown): Promise<ContractResult> {
  const parsed = z.object({ releaseId: uuidSchema }).strict().safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Version inconnue.' };
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site.' };
  const { data, error } = await ctx.db.rpc('cancel_site_release', {
    p_release: parsed.data.releaseId,
  });
  if (error || !data)
    return { status: 'error', message: 'Cette publication ne peut plus être annulée.' };
  revalidatePath('/app/site/versions');
  return { status: 'success', message: 'Publication programmée annulée.' };
}

/** Etat d'une version : relu chez Cloudflare si elle est en cours de deploiement. */
export async function releaseStatusAction(
  payload: unknown,
): Promise<ContractResult<{ release: ReleaseView }>> {
  const parsed = z.object({ releaseId: uuidSchema }).strict().safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Version inconnue.' };
  const ctx = await context();
  if (!ctx) return { status: 'error', message: 'Aucun site.' };

  const find = async () =>
    (await loadReleaseViews(ctx.db, ctx.site.id, 30)).find(
      (release) => release.id === parsed.data.releaseId,
    );
  let release = await find();
  if (!release) return { status: 'error', message: 'Version introuvable.' };

  // `committing` n'est jamais relance ici : une ecriture est peut-etre en
  // cours ; seule la reprise de la tache de fond (apres 5 minutes) y touche.
  if (release.status === 'queued' || release.status === 'deploying') {
    const guard = await guardAction({ limit: 'providerSync', userId: ctx.userId });
    const service = guard.ok ? tryCreateServiceClient() : null;
    if (service) {
      await processRelease(service, release.id).catch(() => undefined);
      release = (await find()) ?? release;
    }
  }
  return { status: 'success', release };
}

/** La publication programmee est-elle incluse dans l'offre ? */
export async function schedulingAvailable(): Promise<boolean> {
  const ctx = await context();
  if (!ctx) return false;
  return hasFeature(ctx.db, ctx.workspace.organization.id, 'scheduled_publishing');
}
