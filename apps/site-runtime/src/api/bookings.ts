import { createServiceClient, unwrap, unwrapList } from '@stax/database';
import { hmacHex, randomToken, visitorHash } from '@stax/security';
import { jsonResponse } from '../responses';
import { clientIp, field, guardPublicWrite, intField, refuse } from './shared';
import type { ResolvedSite } from '../resolve';

/**
 * Reservations.
 *
 * Les creneaux ne sont JAMAIS calcules dans le navigateur : la capacite, les
 * regles de disponibilite, les fermetures et les reservations deja prises ne
 * quittent pas le serveur. Le navigateur demande « quels creneaux le jour J ? »
 * et recoit une liste deja filtree.
 *
 * La creation passe par une fonction SQL qui verifie la capacite et insere dans
 * la meme transaction, sous verrou : deux visiteurs qui reservent la derniere
 * place au meme instant ne peuvent pas passer tous les deux.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleBookingSlots(request: Request, site: ResolvedSite): Promise<Response> {
  const url = new URL(request.url);
  const day = url.searchParams.get('date');
  const serviceId = url.searchParams.get('service');

  if (!day || !ISO_DATE.test(day) || !serviceId) {
    return jsonResponse({ ok: true, slots: [] });
  }

  try {
    const rows = unwrapList<{ slot_start: string; remaining: number }>(
      (await createServiceClient().rpc('available_slots', {
        p_site: site.siteId,
        p_service: serviceId,
        p_day: day,
      })) as never,
    );

    const formatter = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: site.timezone,
    });

    return jsonResponse({
      ok: true,
      slots: rows
        .filter((row) => row.remaining > 0)
        .map((row) => ({
          value: row.slot_start,
          label: formatter.format(new Date(row.slot_start)),
          remaining: row.remaining,
        })),
    });
  } catch {
    return jsonResponse({ ok: false, slots: [] }, 503);
  }
}

export async function handleBookingCreate(request: Request, site: ResolvedSite): Promise<Response> {
  const guard = await guardPublicWrite(request, site, 'booking');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);

  const payload = guard.payload;
  const serviceId = field(payload, 'bookingServiceId', 64);
  const slot = field(payload, 'slot', 40);
  const name = field(payload, 'name', 120);
  const email = field(payload, 'email', 200);
  const phone = field(payload, 'phone', 40);

  if (!serviceId || !slot || !name) {
    return refuse('Merci de choisir un créneau et d’indiquer votre nom.', 422, 'missing_fields');
  }
  if (!email && !phone) {
    return refuse('Indiquez au moins un e-mail ou un téléphone.', 422, 'missing_fields');
  }

  const startsAt = new Date(slot);
  if (Number.isNaN(startsAt.getTime())) {
    return refuse('Créneau invalide. Rechargez la page et réessayez.', 422, 'bad_slot');
  }

  // Jeton d annulation remis au client : seule son empreinte est conservee,
  // exactement comme un mot de passe.
  const manageToken = randomToken(24);
  const manageTokenHash = await hmacHex(manageToken, 'booking-manage');

  const db = createServiceClient();
  let result: { ok: boolean; code?: string; reference?: string; requiresApproval?: boolean };
  try {
    result = unwrap<typeof result>(
      (await db.rpc('create_booking', {
        p_site: site.siteId,
        p_service: serviceId,
        p_starts_at: startsAt.toISOString(),
        p_party_size: intField(payload, 'partySize') ?? 1,
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_note: field(payload, 'note', 1000),
        p_token_hash: manageTokenHash,
      })) as never,
    );
  } catch {
    return refuse(
      'Votre demande n’a pas pu être enregistrée. Merci de réessayer.',
      503,
      'storage_unavailable',
    );
  }

  if (!result.ok) {
    const messages: Record<string, string> = {
      service_unavailable: 'Cette prestation n’est plus proposée à la réservation.',
      invalid_party_size: 'Le nombre de personnes indiqué n’est pas valide.',
      too_soon: 'Ce créneau est trop proche pour être réservé en ligne. Appelez-nous directement.',
      too_far: 'Ce créneau est trop éloigné pour être réservé dès maintenant.',
      contact_required: 'Indiquez au moins un e-mail ou un téléphone.',
      slot_full: 'Ce créneau vient d’être complet. Choisissez-en un autre.',
      closed: 'L’établissement est fermé à cette date.',
    };
    return jsonResponse(
      {
        ok: false,
        code: result.code ?? 'unavailable',
        message: messages[result.code ?? ''] ?? 'Cette réservation n’a pas pu être enregistrée.',
      },
      409,
    );
  }

  try {
    const hash = await visitorHash({
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      siteId: site.siteId,
    });
    await db.rpc('record_page_view', {
      p_site: site.siteId,
      p_path: '/reservation',
      p_visitor_hash: hash,
      p_referrer_host: null,
      p_country: request.headers.get('cf-ipcountry'),
      p_kind: 'booking',
    });
  } catch {
    // Sans effet sur la reservation, qui est deja enregistree.
  }

  return jsonResponse({
    ok: true,
    reference: result.reference,
    message: result.requiresApproval
      ? `Votre demande est enregistrée sous la référence ${result.reference}. Vous recevrez une confirmation dès qu’elle sera validée.`
      : `Votre réservation est confirmée sous la référence ${result.reference}.`,
  });
}
