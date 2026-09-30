'use server';

import { revalidatePath } from 'next/cache';
import { tryCreateServiceClient, unwrapMaybe } from '@nemasus/database';
import { recordQualityAudit } from '~/lib/external-sites/operations';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/** Un bilan de moins d'un quart d'heure est à jour : on ne sollicite pas le site pour rien. */
const FRESH_MS = 15 * 60_000;

/**
 * « Vérifier maintenant » : refait le bilan qualité du site du client.
 *
 * Le droit est vérifié avec le jeton de la personne (lecture du site et de
 * son dernier bilan sous RLS) ; l'enregistrement passe ensuite par la clé de
 * service, seule autorisée à écrire un bilan — un client ne peut donc jamais
 * s'attribuer un score, seulement demander une mesure.
 */
export async function runQualityCheckAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  if (!site || !workspace.capabilities.includes('content.view')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de lancer ce contrôle.' };
  }
  if (site.architecture !== 'external_repository' || !site.deliveredAt) {
    return { status: 'error', message: 'Le bilan est disponible une fois le site livré.' };
  }

  const lastReport = await db
    .from('site_quality_reports')
    .select('checked_at')
    .eq('site_id', site.id)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastReport.error) {
    return { status: 'error', message: 'Le bilan qualité n’est pas encore disponible.' };
  }
  const latest = unwrapMaybe<{ checked_at: string }>(lastReport as never);
  if (latest && Date.now() - new Date(latest.checked_at).getTime() < FRESH_MS) {
    return { status: 'success', message: 'Le bilan a moins d’un quart d’heure : il est à jour.' };
  }

  const overview = ((await db.rpc('site_management_overview', { p_site: site.id })).data ?? {}) as {
    productionUrl?: string | null;
    primaryDomain?: string | null;
  };
  const url = overview.primaryDomain
    ? `https://${overview.primaryDomain}/`
    : (overview.productionUrl ?? null);
  if (!url || !url.startsWith('https://')) {
    return { status: 'error', message: 'Votre site n’a pas encore d’adresse en ligne à vérifier.' };
  }

  const service = tryCreateServiceClient();
  if (!service) {
    return { status: 'error', message: 'Le contrôle est momentanément indisponible.' };
  }
  try {
    const audit = await recordQualityAudit(service, site.id, url);
    revalidatePath('/app/site/sante');
    return {
      status: 'success',
      message: `Bilan mis à jour : ${Math.round((audit.score / audit.maxScore) * 100)} / 100.`,
    };
  } catch (error) {
    console.error('[nemasus:quality] bilan impossible', error);
    return { status: 'error', message: 'Le contrôle n’a pas pu aboutir. Réessayez plus tard.' };
  }
}
