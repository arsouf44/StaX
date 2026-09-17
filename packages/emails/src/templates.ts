import { legalValue, platformUrl } from '@stax/config';
import {
  codeBlock,
  definitionList,
  paragraph,
  renderEmailLayout,
  strongLine,
  toPlainText,
} from './layout';
import type { EmailMessage } from './provider';

/**
 * Gabarits transactionnels.
 *
 * Chaque gabarit produit une version HTML et une version texte. Le ton suit
 * celui du produit : clair, concret, sans emphase commerciale inutile dans un
 * message de service.
 */

interface BaseContext {
  to: string;
  firstName?: string | null;
}

function shell(params: {
  to: string;
  template: string;
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  bodyText: string[];
  action?: { label: string; url: string };
  secondaryAction?: { label: string; url: string };
  footerNote?: string;
}): EmailMessage {
  const base = platformUrl();
  const support = legalValue('SUPPORT_EMAIL');
  const company = legalValue('LEGAL_COMPANY_NAME');

  return {
    to: params.to,
    template: params.template,
    subject: params.subject,
    replyTo: support.startsWith('[') ? undefined : support,
    html: renderEmailLayout({
      preheader: params.preheader,
      heading: params.heading,
      body: params.bodyHtml,
      action: params.action,
      secondaryAction: params.secondaryAction,
      footerNote: params.footerNote,
      platformUrl: base,
      supportEmail: support,
      companyName: company,
    }),
    text: toPlainText([
      params.heading,
      ...params.bodyText,
      params.action ? `${params.action.label} : ${params.action.url}` : '',
      `Une question ? Écrivez a ${support}.`,
      `${company} — ${base}`,
    ]),
  };
}

const hello = (firstName?: string | null) => (firstName ? `Bonjour ${firstName},` : 'Bonjour,');

/* -------------------------------------------------------------------------- */
/*  Compte                                                                     */
/* -------------------------------------------------------------------------- */

export function welcomeEmail(ctx: BaseContext): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'welcome',
    subject: 'Bienvenue sur StaX',
    preheader: 'Votre compte est cree. Voici la suite.',
    heading: 'Bienvenue sur StaX',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Votre compte est cree. Vous pouvez des maintenant commander votre site, ' +
          'suivre son avancement et gérer votre entreprise depuis votre espace.',
      ),
      paragraph(
        'Nous vous accompagnons a chaque étape : vous n avez rien a installer et ' +
          'rien a configurer techniquement.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      'Votre compte StaX est cree. Vous pouvez commander votre site et suivre son avancement depuis votre espace.',
    ],
    action: { label: 'Ouvrir mon espace', url: `${platformUrl()}/app` },
  });
}

export function verifyEmailEmail(ctx: BaseContext & { verifyUrl: string }): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'verify_email',
    subject: 'Confirmez votre adresse e-mail',
    preheader: 'Une dernière étape pour activer votre compte.',
    heading: 'Confirmez votre adresse e-mail',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Confirmez votre adresse pour sécuriser votre compte et recevoir les messages ' +
          'de vos visiteurs.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), 'Confirmez votre adresse e-mail pour activer votre compte.'],
    action: { label: 'Confirmer mon adresse', url: ctx.verifyUrl },
    footerNote:
      'Ce lien expire dans 24 heures. Si vous n etes pas a l origine de cette demande, ignorez ce message.',
  });
}

export function passwordResetEmail(ctx: BaseContext & { resetUrl: string }): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'password_reset',
    subject: 'Reinitialiser votre mot de passe',
    preheader: 'Lien valable une heure.',
    heading: 'Reinitialiser votre mot de passe',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Vous avez demande a reinitialiser votre mot de passe. Ce lien est valable une heure ' +
          'et ne fonctionne qu une seule fois.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), 'Reinitialisez votre mot de passe (lien valable une heure).'],
    action: { label: 'Choisir un nouveau mot de passe', url: ctx.resetUrl },
    footerNote:
      'Si vous n etes pas a l origine de cette demande, ignorez ce message : votre mot de passe reste inchange.',
  });
}

export function activationCodeEmail(
  ctx: BaseContext & { code: string; businessName: string; expiresAt: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'activation_code',
    subject: `Votre code d accès — ${ctx.businessName}`,
    preheader: 'Récupérez l accès a votre espace client.',
    heading: 'Votre site vous attend',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Le site de ${ctx.businessName} est pret. Ce code vous donne accès a votre espace, ` +
          'depuis lequel vous pourrez modifier votre contenu et recevoir vos messages.',
      ),
      codeBlock(ctx.code),
      paragraph(
        `Ce code est a usage unique et expire le ${ctx.expiresAt}. Ne le transmettez a personne.`,
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Votre code d accès : ${ctx.code}`,
      `Code a usage unique, valable jusqu au ${ctx.expiresAt}.`,
    ],
    action: { label: 'Activer mon espace', url: `${platformUrl()}/activation` },
    footerNote: 'Ce code est personnel. StaX ne vous le demandera jamais par téléphone.',
  });
}

export function teamInvitationEmail(
  ctx: BaseContext & { inviteUrl: string; organizationName: string; roleLabel: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'team_invitation',
    subject: `Invitation a rejoindre ${ctx.organizationName}`,
    preheader: 'Vous avez ete invite a collaborer.',
    heading: `Rejoignez ${ctx.organizationName}`,
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Vous avez ete invite a rejoindre l espace de ${ctx.organizationName} sur StaX ` +
          `avec le role « ${ctx.roleLabel} ».`,
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Invitation a rejoindre ${ctx.organizationName} (role : ${ctx.roleLabel}).`,
    ],
    action: { label: 'Accepter l invitation', url: ctx.inviteUrl },
    footerNote: 'Cette invitation expire dans 7 jours.',
  });
}

/* -------------------------------------------------------------------------- */
/*  Commande et projet                                                         */
/* -------------------------------------------------------------------------- */

export function orderConfirmedEmail(
  ctx: BaseContext & {
    reference: string;
    planName: string;
    setupAmount: string;
    monthlyAmount: string;
    firstMaintenanceDate: string;
    orderUrl: string;
  },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'order_confirmed',
    subject: `Commande confirmée — ${ctx.reference}`,
    preheader: 'Nous démarrons votre projet.',
    heading: 'Votre commande est confirmée',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph('Merci pour votre confiance. Voici le recapitulatif de votre commande.'),
      definitionList([
        ['Reference', ctx.reference],
        ['Offre', ctx.planName],
        ['Paiement initial', ctx.setupAmount],
        ['Maintenance mensuelle', ctx.monthlyAmount],
        ['Première échéance de maintenance', ctx.firstMaintenanceDate],
      ]),
      paragraph(
        'Prochaine étape : complétez le questionnaire de votre projet. Plus vos réponses ' +
          'sont précises, plus votre site vous ressemblera.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Commande ${ctx.reference} confirmée.`,
      `Offre : ${ctx.planName} — ${ctx.setupAmount} puis ${ctx.monthlyAmount}.`,
      `Première échéance de maintenance : ${ctx.firstMaintenanceDate}.`,
    ],
    action: { label: 'Compléter mon questionnaire', url: ctx.orderUrl },
  });
}

export function projectStartedEmail(
  ctx: BaseContext & { projectUrl: string; businessName: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'project_started',
    subject: 'Nous démarrons la création de votre site',
    preheader: 'Votre projet est entre les mains de notre équipe.',
    heading: 'La création a commence',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Notre équipe a commence la conception du site de ${ctx.businessName}. ` +
          'Vous pouvez suivre chaque étape depuis votre espace, et nous écrire a tout moment.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), `La création du site de ${ctx.businessName} a commence.`],
    action: { label: 'Suivre mon projet', url: ctx.projectUrl },
  });
}

export function previewReadyEmail(
  ctx: BaseContext & { previewUrl: string; projectUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'preview_ready',
    subject: 'Votre site est pret a être relu',
    preheader: 'Decouvrez votre site avant sa mise en ligne.',
    heading: 'Votre site est pret a être relu',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Votre site est disponible en aperçu privé. Prenez le temps de tout relire : textes, ' +
          'photos, horaires, coordonnees.',
      ),
      paragraph(
        'Si quelque chose ne va pas, indiquez-le directement depuis votre espace : nous ' +
          'corrigeons avant la mise en ligne.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), 'Votre site est disponible en aperçu privé.'],
    action: { label: 'Voir mon site', url: ctx.previewUrl },
    secondaryAction: { label: 'Demander des modifications', url: ctx.projectUrl },
  });
}

export function sitePublishedEmail(
  ctx: BaseContext & { siteUrl: string; appUrl: string; refundDeadline: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'site_published',
    subject: 'Votre site est en ligne',
    preheader: 'Felicitations, votre site est accessible a tous.',
    heading: 'Votre site est en ligne',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      strongLine('Votre site est désormais accessible publiquement.'),
      paragraph(
        'Vous pouvez modifier vos contenus a tout moment depuis votre espace : textes, photos, ' +
          'horaires, tarifs. Les modifications ne sont visibles qu après publication.',
      ),
      definitionList([
        ['Adresse de votre site', ctx.siteUrl],
        ['Période de garantie commerciale', `jusqu au ${ctx.refundDeadline}`],
      ]),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Votre site est en ligne : ${ctx.siteUrl}`,
      `Période de garantie commerciale jusqu au ${ctx.refundDeadline}.`,
    ],
    action: { label: 'Voir mon site', url: ctx.siteUrl },
    secondaryAction: { label: 'Gérer mon site', url: ctx.appUrl },
  });
}

/* -------------------------------------------------------------------------- */
/*  Activite du site                                                           */
/* -------------------------------------------------------------------------- */

export function newMessageEmail(
  ctx: BaseContext & { senderName: string; excerpt: string; inboxUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'new_message',
    subject: `Nouveau message de ${ctx.senderName}`,
    preheader: ctx.excerpt.slice(0, 120),
    heading: 'Vous avez reçu un message',
    bodyHtml: [
      paragraph(`${ctx.senderName} vous a écrit depuis votre site :`),
      `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #E4E4E7;
        color:#3F3F46;font-style:italic;">${ctx.excerpt.slice(0, 500)}</blockquote>`,
    ].join(''),
    bodyText: [`${ctx.senderName} vous a écrit :`, ctx.excerpt.slice(0, 500)],
    action: { label: 'Lire le message', url: ctx.inboxUrl },
  });
}

export function newBookingEmail(
  ctx: BaseContext & {
    customerName: string;
    dateLabel: string;
    partySize: number;
    bookingsUrl: string;
  },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'new_booking',
    subject: `Nouvelle réservation — ${ctx.dateLabel}`,
    preheader: `${ctx.customerName}, ${ctx.partySize} personne(s).`,
    heading: 'Nouvelle demande de réservation',
    bodyHtml: definitionList([
      ['Client', ctx.customerName],
      ['Date et heure', ctx.dateLabel],
      ['Nombre de personnes', String(ctx.partySize)],
    ]),
    bodyText: [
      `Nouvelle réservation : ${ctx.customerName}, ${ctx.dateLabel}, ${ctx.partySize} personne(s).`,
    ],
    action: { label: 'Confirmer ou refuser', url: ctx.bookingsUrl },
  });
}

export function newShopOrderEmail(
  ctx: BaseContext & { reference: string; total: string; customerName: string; ordersUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'new_shop_order',
    subject: `Nouvelle commande — ${ctx.reference}`,
    preheader: `${ctx.customerName} — ${ctx.total}`,
    heading: 'Vous avez reçu une commande',
    bodyHtml: definitionList([
      ['Reference', ctx.reference],
      ['Client', ctx.customerName],
      ['Montant', ctx.total],
    ]),
    bodyText: [`Nouvelle commande ${ctx.reference} de ${ctx.customerName} — ${ctx.total}.`],
    action: { label: 'Voir la commande', url: ctx.ordersUrl },
  });
}

/* -------------------------------------------------------------------------- */
/*  Facturation                                                                */
/* -------------------------------------------------------------------------- */

export function paymentFailedEmail(
  ctx: BaseContext & { amount: string; retryDate: string; billingUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'payment_failed',
    subject: 'Échec du prelevement de votre maintenance',
    preheader: 'Mettez a jour votre moyen de paiement.',
    heading: 'Nous n avons pas pu encaisser votre maintenance',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Le prelevement de ${ctx.amount} n a pas abouti. Votre site reste en ligne : ` +
          `nous réessaierons automatiquement le ${ctx.retryDate}.`,
      ),
      paragraph('Pour éviter toute interruption, vérifiez votre moyen de paiement des maintenant.'),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Échec du prelevement de ${ctx.amount}. Nouvelle tentative le ${ctx.retryDate}.`,
    ],
    action: { label: 'Mettre a jour mon paiement', url: ctx.billingUrl },
  });
}

export function invoiceEmail(
  ctx: BaseContext & { amount: string; periodLabel: string; invoiceUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'invoice',
    subject: `Votre facturé — ${ctx.periodLabel}`,
    preheader: `Facture de ${ctx.amount}.`,
    heading: 'Votre facturé est disponible',
    bodyHtml: definitionList([
      ['Période', ctx.periodLabel],
      ['Montant', ctx.amount],
    ]),
    bodyText: [`Facture ${ctx.periodLabel} — ${ctx.amount}.`],
    action: { label: 'Télécharger ma facturé', url: ctx.invoiceUrl },
  });
}

export function subscriptionCancelledEmail(
  ctx: BaseContext & { endDate: string; gracePeriodEnd: string; billingUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'subscription_cancelled',
    subject: 'Résiliation de votre maintenance enregistrée',
    preheader: `Votre site reste en ligne jusqu au ${ctx.endDate}.`,
    heading: 'Votre résiliation est enregistrée',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Votre maintenance prendra fin le ${ctx.endDate}. Votre site reste accessible ` +
          `jusqu a cette date, puis pendant une période de continuite jusqu au ${ctx.gracePeriodEnd}.`,
      ),
      paragraph(
        'Vos données ne sont pas supprimées a l échéance : vous pouvez les exporter ou ' +
          'réactiver votre maintenance a tout moment.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Maintenance résiliée au ${ctx.endDate}. Période de continuite jusqu au ${ctx.gracePeriodEnd}.`,
    ],
    action: { label: 'Gérer mon abonnement', url: ctx.billingUrl },
  });
}

export function refundRequestedEmail(
  ctx: BaseContext & { reference: string; amount: string; deduction: string | null },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'refund_requested',
    subject: 'Votre demande de remboursement est enregistrée',
    preheader: 'Nous revenons vers vous rapidement.',
    heading: 'Demande de remboursement reçue',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph('Nous avons bien reçu votre demande et nous l examinons.'),
      definitionList([
        ['Commande', ctx.reference],
        ['Montant estimé du remboursement', ctx.amount],
        ...(ctx.deduction
          ? ([['Retenue pour achat du nom de domaine', ctx.deduction]] as Array<[string, string]>)
          : []),
      ]),
      paragraph(
        'Ce montant est une estimation : il sera confirme après vérification. ' +
          'Cette garantie commerciale ne remplacé pas vos droits légaux.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Demande de remboursement reçue pour la commande ${ctx.reference}. Montant estimé : ${ctx.amount}.`,
    ],
    action: { label: 'Suivre ma demande', url: `${platformUrl()}/app/facturation` },
  });
}

export function refundProcessedEmail(
  ctx: BaseContext & { amount: string; reference: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'refund_processed',
    subject: 'Votre remboursement a ete effectué',
    preheader: `${ctx.amount} remboursés.`,
    heading: 'Remboursement effectué',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Un remboursement de ${ctx.amount} a ete émis pour la commande ${ctx.reference}. ` +
          'Le délai de credit dépend de votre banque, généralement 5 a 10 jours ouvrés.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), `Remboursement de ${ctx.amount} effectué (${ctx.reference}).`],
  });
}

/* -------------------------------------------------------------------------- */
/*  Interne                                                                    */
/* -------------------------------------------------------------------------- */

export function internalLeadEmail(ctx: {
  to: string;
  kind: 'contact' | 'quote';
  name: string;
  email: string;
  summary: string;
  adminUrl: string;
}): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'internal_lead',
    subject:
      ctx.kind === 'quote'
        ? `Nouvelle demande de devis — ${ctx.name}`
        : `Nouveau message — ${ctx.name}`,
    preheader: ctx.summary.slice(0, 120),
    heading: ctx.kind === 'quote' ? 'Nouvelle demande de devis' : 'Nouveau message',
    bodyHtml: [
      definitionList([
        ['Nom', ctx.name],
        ['E-mail', ctx.email],
      ]),
      paragraph(ctx.summary.slice(0, 1500)),
    ].join(''),
    bodyText: [`${ctx.name} <${ctx.email}>`, ctx.summary.slice(0, 1500)],
    action: { label: 'Ouvrir dans l administration', url: ctx.adminUrl },
  });
}
