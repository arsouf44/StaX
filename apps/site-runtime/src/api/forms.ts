import { createServiceClient, unwrap } from '@stax/database';
import { scoreSubmission, visitorHash } from '@stax/security';
import { jsonResponse } from '../responses';
import { clientIp, field, guardPublicWrite, refuse } from './shared';
import type { ResolvedSite } from '../resolve';

/**
 * Reception d une soumission de formulaire public.
 *
 * Le slug vient de l URL, mais la resolution se fait TOUJOURS par couple
 * (site, slug) cote base : un slug appartenant a un autre client ne remonte
 * jamais. La validation des champs obligatoires et la liste blanche des cles
 * sont egalement appliquees en base, dans la meme transaction que l ecriture.
 */
export async function handleFormSubmit(
  request: Request,
  site: ResolvedSite,
  slug: string,
): Promise<Response> {
  const isQuote = slug.includes('devis') || slug.includes('quote');
  const guard = await guardPublicWrite(request, site, isQuote ? 'quoteForm' : 'contactForm');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);

  const payload = guard.payload;

  // Le champ piege porte un nom choisi par le client : on teste toutes les
  // valeurs non declarees plutot que d en supposer un seul.
  const honeypot =
    field(payload, 'website_url') ?? field(payload, 'url') ?? field(payload, 'company_website');

  const verdict = scoreSubmission({
    honeypot,
    message: field(payload, 'message', 5000),
    email: field(payload, 'email', 200),
  });

  const db = createServiceClient();
  let result: { ok: boolean; message?: string; code?: string; fields?: string[] };
  try {
    result = unwrap<typeof result>(
      (await db.rpc('submit_form', {
        p_site: site.siteId,
        p_form_slug: slug,
        p_data: payload,
        p_spam_score: verdict.score,
        p_ip_hash: guard.ipHash,
        p_user_agent: (request.headers.get('user-agent') ?? '').slice(0, 60),
        p_referrer: request.headers.get('referer') ?? null,
        p_locale: site.snapshot.snapshot.site.defaultLocale,
      })) as never,
    );
  } catch {
    return refuse(
      'Votre message n’a pas pu être enregistré. Merci de réessayer dans quelques instants.',
      503,
      'storage_unavailable',
    );
  }

  if (!result.ok) {
    if (result.code === 'missing_fields') {
      return jsonResponse(
        {
          ok: false,
          code: 'missing_fields',
          message: `Merci de renseigner : ${(result.fields ?? []).join(', ')}.`,
          fields: result.fields ?? [],
        },
        422,
      );
    }
    return refuse('Formulaire indisponible.', 404, 'not_found');
  }

  // Comptabilise la conversion, sans cookie ni identifiant persistant.
  try {
    const hash = await visitorHash({
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      siteId: site.siteId,
    });
    await db.rpc('record_page_view', {
      p_site: site.siteId,
      p_path: field(payload, '_path', 512) ?? '/',
      p_visitor_hash: hash,
      p_referrer_host: null,
      p_country: request.headers.get('cf-ipcountry'),
      p_kind: 'form_submit',
    });
  } catch {
    // La mesure d audience n est jamais bloquante pour un envoi reussi.
  }

  return jsonResponse({
    ok: true,
    message: result.message ?? 'Merci, votre message a bien été envoyé.',
  });
}
