import 'server-only';
import { platformUrl } from '@nemasus/config';
import { unwrapList, unwrapMaybe, type Db } from '@nemasus/database';
import { sendEmail, siteDeliveredEmail } from '@nemasus/emails';

/**
 * E-mail de livraison.
 *
 * La base notifie deja le client dans son espace (`deliver_site`) ; l'e-mail
 * reprend l'essentiel hors de Nemasus : le site est en ligne, a telle adresse,
 * et l'editeur s'ouvre. Un envoi manque ne remet jamais la livraison en cause.
 */
export async function sendDeliveryEmails(service: Db, siteId: string): Promise<void> {
  const site = unwrapMaybe<{ organization_id: string; delivered_at: string | null }>(
    (await service
      .from('sites')
      .select('organization_id, delivered_at')
      .eq('id', siteId)
      .maybeSingle()) as never,
  );
  if (!site?.delivered_at) return;

  const [domains, hosting, members] = await Promise.all([
    service
      .from('site_domains')
      .select('hostname, is_primary')
      .eq('site_id', siteId)
      .eq('status', 'active'),
    service
      .from('site_hosting')
      .select('production_url')
      .eq('site_id', siteId)
      .eq('status', 'connected')
      .maybeSingle(),
    service
      .from('organization_members')
      .select('profiles!organization_members_user_id_fkey ( email, first_name, platform_role )')
      .eq('organization_id', site.organization_id)
      .eq('role', 'owner'),
  ]);

  const activeDomains = unwrapList<{ hostname: string; is_primary: boolean }>(domains as never);
  const primary = activeDomains.find((domain) => domain.is_primary) ?? activeDomains[0];
  const productionUrl = unwrapMaybe<{ production_url: string }>(hosting as never)?.production_url;
  const siteUrl = primary ? `https://${primary.hostname}` : (productionUrl ?? null);

  const recipients = unwrapList<{
    profiles: { email: string; first_name: string | null; platform_role: string | null } | null;
  }>(members as never)
    .map((member) => member.profiles)
    .filter((profile): profile is NonNullable<typeof profile> =>
      Boolean(profile?.email && !profile.platform_role),
    );

  for (const profile of recipients) {
    const result = await sendEmail(
      siteDeliveredEmail({
        to: profile.email,
        firstName: profile.first_name,
        siteUrl,
        appUrl: `${platformUrl()}/app`,
      }),
      { db: service, organizationId: site.organization_id },
    );
    if (!result.ok) {
      console.error('[nemasus:delivery] e-mail de livraison non envoyé', result.error);
    }
  }
}
