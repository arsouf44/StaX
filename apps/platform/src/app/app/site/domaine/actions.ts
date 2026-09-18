'use server';

import { revalidatePath } from 'next/cache';
import { hasFeature, unwrapList, unwrapMaybe } from '@stax/database';
import { domainProvider } from '@stax/infrastructure';
import { hostnameSchema, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace, type WorkspaceContext } from '~/lib/workspace';

/**
 * Rattachement d'un nom de domaine.
 *
 * Point de securite central : un nom d'hote ne peut etre rattache qu'a UN site
 * verifie. La base porte un index unique partiel qui l'impose — deux
 * organisations ne peuvent pas revendiquer le meme domaine, et une demande en
 * attente ne bloque jamais le proprietaire legitime.
 *
 * Le passage a l'etat « verifie » ne vient JAMAIS de ce formulaire : il vient
 * du fournisseur de domaines, apres lecture reelle du DNS. Un client ne peut
 * pas declarer son domaine actif.
 */

interface DomainContext extends WorkspaceContext {
  siteId: string;
}

type Gate = { ok: true; value: DomainContext } | { ok: false; state: ActionState };

async function requireDomainManager(): Promise<Gate> {
  const context = await getWorkspace();

  if (!context.workspace.capabilities.includes('domain.manage')) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'Seul un propriétaire de votre organisation peut gérer les noms de domaine.',
      },
    };
  }

  const site = context.workspace.currentSite;
  if (!site) {
    return {
      ok: false,
      state: { status: 'error', message: 'Aucun site n’est encore rattaché à votre compte.' },
    };
  }

  const included = await hasFeature(context.db, context.workspace.organization.id, 'custom_domain');
  if (!included) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'Le nom de domaine personnalisé n’est pas inclus dans votre offre actuelle.',
      },
    };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { ok: false, state: { status: 'error', message: guard.message } };

  return { ok: true, value: { ...context, siteId: site.id } };
}

const attachSchema = z.object({ hostname: hostnameSchema });

export async function attachDomainAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireDomainManager();
  if (!gate.ok) return gate.state;

  const raw = formData.get('hostname');
  const normalized =
    typeof raw === 'string'
      ? raw
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/^www\.(?=.*\..*\.)/, '')
          .replace(/\/.*$/, '')
      : '';

  const parsed = attachSchema.safeParse({ hostname: normalized });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Saisissez un nom de domaine valide, par exemple « mon-entreprise.fr ».',
      errors: { hostname: ['Nom de domaine invalide.'] },
    };
  }

  const hostname = parsed.data.hostname;

  if (hostname.endsWith('.local') || hostname.endsWith('.localhost') || hostname.endsWith('.test')) {
    return {
      status: 'error',
      message: 'Ce nom de domaine ne peut pas être utilisé sur Internet.',
    };
  }

  const { db, workspace, siteId } = gate.value;

  const existing = unwrapList<{ id: string; site_id: string; status: string }>(
    (await db
      .from('site_domains')
      .select('id, site_id, status')
      .eq('hostname', hostname)
      .neq('status', 'detached')) as never,
  );

  // La RLS ne laisse voir que les domaines de l'organisation : si rien ne
  // remonte alors que la base refuse l'insertion, c'est qu'il appartient a
  // quelqu'un d'autre. On le dit sans reveler a qui.
  if (existing.some((domain) => domain.site_id === siteId)) {
    return { status: 'error', message: 'Ce domaine est déjà rattaché à votre site.' };
  }

  const count = unwrapList<{ id: string }>(
    (await db
      .from('site_domains')
      .select('id')
      .eq('site_id', siteId)
      .neq('status', 'detached')) as never,
  ).length;

  if (count >= 10) {
    return {
      status: 'error',
      message: 'Votre site a atteint le nombre maximum de domaines rattachés.',
    };
  }

  const { data, error } = await db
    .from('site_domains')
    .insert({
      site_id: siteId,
      organization_id: workspace.organization.id,
      hostname,
      kind: 'custom',
      status: 'pending',
      created_by: gate.value.userId,
    })
    .select('id, verification_token')
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        status: 'error',
        message:
          'Ce domaine est déjà revendiqué. Si vous en êtes le propriétaire, écrivez-nous : nous vérifierons et le libérerons.',
      };
    }
    return { status: 'error', message: 'Ce domaine n’a pas pu être enregistré.' };
  }

  const created = data as { id: string; verification_token: string } | null;

  // Le fournisseur est appele APRES l'enregistrement : si l'appel echoue, la
  // demande existe et peut etre reprise, plutot que d'etre perdue.
  if (created) {
    try {
      const attachment = await domainProvider().attach(hostname, created.verification_token);
      await db
        .from('site_domains')
        .update({
          cf_hostname_id: attachment.externalId,
          status: attachment.status === 'failed' ? 'failed' : 'pending',
          last_error: attachment.message,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', created.id)
        .eq('site_id', siteId);
    } catch (providerError) {
      console.error('[stax:domains] rattachement impossible', providerError);
    }
  }

  revalidatePath('/app/site/domaine');
  return {
    status: 'success',
    message:
      'Domaine enregistré. Ajoutez les deux enregistrements DNS ci-dessous chez votre hébergeur, puis lancez la vérification.',
  };
}

const domainIdSchema = z.object({ domainId: uuidSchema });

export async function verifyDomainAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireDomainManager();
  if (!gate.ok) return gate.state;

  const parsed = domainIdSchema.safeParse({ domainId: formData.get('domainId') });
  if (!parsed.success) return { status: 'error', message: 'Ce domaine est introuvable.' };

  const { db, siteId } = gate.value;

  const domain = unwrapMaybe<{
    id: string;
    hostname: string;
    cf_hostname_id: string | null;
    check_attempts: number;
  }>(
    (await db
      .from('site_domains')
      .select('id, hostname, cf_hostname_id, check_attempts')
      .eq('id', parsed.data.domainId)
      .eq('site_id', siteId)
      .maybeSingle()) as never,
  );

  if (!domain) return { status: 'error', message: 'Ce domaine est introuvable.' };

  const provider = domainProvider();

  if (!provider.available) {
    await db
      .from('site_domains')
      .update({
        last_checked_at: new Date().toISOString(),
        check_attempts: domain.check_attempts + 1,
      })
      .eq('id', domain.id)
      .eq('site_id', siteId);

    revalidatePath('/app/site/domaine');
    return {
      status: 'success',
      message:
        'Votre demande est bien enregistrée. La mise en service de ce domaine est faite par notre équipe : vous serez prévenu dès qu’il est actif.',
    };
  }

  let outcome;
  try {
    outcome = await provider.check(domain.hostname, domain.cf_hostname_id);
  } catch (error) {
    console.error('[stax:domains] verification impossible', error);
    return {
      status: 'error',
      message: 'La vérification n’a pas pu aboutir. Réessayez dans quelques minutes.',
    };
  }

  const now = new Date().toISOString();
  const verified = outcome.status === 'active';

  await db
    .from('site_domains')
    .update({
      status: verified ? 'active' : outcome.status === 'failed' ? 'failed' : 'verifying',
      ssl_status: verified ? 'active' : 'pending',
      verified_at: verified ? now : null,
      last_checked_at: now,
      check_attempts: domain.check_attempts + 1,
      last_error: outcome.message,
    })
    .eq('id', domain.id)
    .eq('site_id', siteId);

  revalidatePath('/app/site/domaine');

  if (verified) {
    return {
      status: 'success',
      message: `${domain.hostname} est actif et sécurisé en HTTPS.`,
    };
  }

  return {
    status: 'error',
    message:
      outcome.message ??
      'Les enregistrements DNS ne sont pas encore visibles. Une propagation DNS prend souvent quelques heures, parfois jusqu’à 48 heures.',
  };
}

export async function setPrimaryDomainAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireDomainManager();
  if (!gate.ok) return gate.state;

  const parsed = domainIdSchema.safeParse({ domainId: formData.get('domainId') });
  if (!parsed.success) return { status: 'error', message: 'Ce domaine est introuvable.' };

  const { db, siteId } = gate.value;

  const domain = unwrapMaybe<{ id: string; hostname: string; status: string }>(
    (await db
      .from('site_domains')
      .select('id, hostname, status')
      .eq('id', parsed.data.domainId)
      .eq('site_id', siteId)
      .maybeSingle()) as never,
  );

  if (!domain) return { status: 'error', message: 'Ce domaine est introuvable.' };

  // Un domaine non verifie ne peut pas devenir principal : le site deviendrait
  // injoignable a son adresse annoncee.
  if (domain.status !== 'active') {
    return {
      status: 'error',
      message: 'Ce domaine doit d’abord être vérifié avant de devenir l’adresse principale.',
    };
  }

  await db.from('site_domains').update({ is_primary: false }).eq('site_id', siteId);

  const { error } = await db
    .from('site_domains')
    .update({ is_primary: true })
    .eq('id', domain.id)
    .eq('site_id', siteId);

  if (error) return { status: 'error', message: 'Ce changement n’a pas pu être enregistré.' };

  revalidatePath('/app/site/domaine');
  return {
    status: 'success',
    message: `${domain.hostname} est maintenant l’adresse principale de votre site. Les autres adresses y redirigent.`,
  };
}

export async function detachDomainAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireDomainManager();
  if (!gate.ok) return gate.state;

  const parsed = domainIdSchema.safeParse({ domainId: formData.get('domainId') });
  if (!parsed.success) return { status: 'error', message: 'Ce domaine est introuvable.' };

  const { db, siteId } = gate.value;

  const domain = unwrapMaybe<{
    id: string;
    hostname: string;
    kind: string;
    is_primary: boolean;
    cf_hostname_id: string | null;
  }>(
    (await db
      .from('site_domains')
      .select('id, hostname, kind, is_primary, cf_hostname_id')
      .eq('id', parsed.data.domainId)
      .eq('site_id', siteId)
      .maybeSingle()) as never,
  );

  if (!domain) return { status: 'error', message: 'Ce domaine est introuvable.' };

  // L'adresse technique fournie par StaX reste toujours joignable : c'est elle
  // qui garantit qu'un site ne devienne jamais totalement inaccessible.
  if (domain.kind === 'platform_subdomain') {
    return {
      status: 'error',
      message: 'L’adresse fournie par StaX ne peut pas être retirée : elle sert de secours.',
    };
  }

  try {
    await domainProvider().detach(domain.cf_hostname_id);
  } catch (error) {
    console.error('[stax:domains] detachement fournisseur impossible', error);
  }

  // Le domaine est DETACHE, pas supprime : l'historique reste consultable et
  // l'index partiel libere immediatement le nom d'hote pour un autre site.
  const { error } = await db
    .from('site_domains')
    .update({
      status: 'detached',
      is_primary: false,
      detached_at: new Date().toISOString(),
      cf_hostname_id: null,
    })
    .eq('id', domain.id)
    .eq('site_id', siteId);

  if (error) return { status: 'error', message: 'Ce domaine n’a pas pu être retiré.' };

  revalidatePath('/app/site/domaine');
  return {
    status: 'success',
    message: domain.is_primary
      ? `${domain.hostname} est retiré. Votre site reste joignable à son adresse StaX.`
      : `${domain.hostname} est retiré.`,
  };
}
