import { paragraph, renderEmailLayout, strongLine, toPlainText } from './layout';
import type { EmailMessage } from './provider';

/**
 * Messages adresses aux VISITEURS d'un site client.
 *
 * Ils ne sont pas signes StaX, et c'est essentiel : le destinataire est le
 * client d'une boulangerie ou d'un salon, pas le notre. Recevoir un message
 * signe par une plateforme dont il n'a jamais entendu parler serait au mieux
 * deroutant, au pire pris pour une tentative d'hameconnage.
 *
 * Le nom affiche, l'adresse de reponse et le lien de bas de page viennent donc
 * du commercant. StaX n'apparait nulle part.
 */

export interface TenantEmailContext {
  to: string;
  /** Nom commercial affiche au destinataire. */
  businessName: string;
  /** Origine du site, pour les liens de bas de page. */
  siteUrl: string;
  /** Adresse de contact du commercant, si elle est renseignee. */
  contactEmail?: string | null;
}

export function customerLoginEmail(
  ctx: TenantEmailContext & { loginUrl: string; expiresLabel: string },
): EmailMessage {
  const heading = 'Votre lien de connexion';
  const body = [
    paragraph('Bonjour,'),
    paragraph(
      `Voici votre lien pour accéder à votre espace sur le site de ${ctx.businessName}. ` +
        'Il vous connecte directement : il n’y a pas de mot de passe à retenir.',
    ),
    strongLine(`Ce lien n’est utilisable qu’une seule fois, jusqu’au ${ctx.expiresLabel}.`),
    paragraph(
      'Si vous n’avez pas demandé ce lien, ignorez ce message : personne ne peut accéder à ' +
        'votre espace sans ouvrir ce lien depuis cette boîte.',
    ),
  ].join('');

  return {
    to: ctx.to,
    template: 'customer_login',
    subject: `Votre lien de connexion — ${ctx.businessName}`,
    ...(ctx.contactEmail ? { replyTo: ctx.contactEmail } : {}),
    html: renderEmailLayout({
      preheader: `Connexion à votre espace ${ctx.businessName}.`,
      heading,
      body,
      action: { label: 'Accéder à mon espace', url: ctx.loginUrl },
      footerNote: 'Ce lien est personnel. Ne le transférez à personne.',
      platformUrl: ctx.siteUrl,
      supportEmail: ctx.contactEmail ?? '',
      companyName: ctx.businessName,
    }),
    text: toPlainText([
      heading,
      'Bonjour,',
      `Voici votre lien pour accéder à votre espace sur le site de ${ctx.businessName}.`,
      `Utilisable une seule fois, jusqu’au ${ctx.expiresLabel} : ${ctx.loginUrl}`,
      'Si vous n’avez pas demandé ce lien, ignorez ce message.',
      `${ctx.businessName} — ${ctx.siteUrl}`,
    ]),
  };
}
