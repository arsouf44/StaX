import { deliveryPolicyConfig, legalValue, platformUrl } from '@stax/config';
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
      `Une question ? Écrivez à ${support}.`,
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
        'Nous vous accompagnons à chaque étape : vous n’avez rien à installer et ' +
          'rien à configurer techniquement.',
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
      'Ce lien expire dans 24 heures. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
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
        'Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable une heure ' +
          'et ne fonctionne qu une seule fois.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), 'Reinitialisez votre mot de passe (lien valable une heure).'],
    action: { label: 'Choisir un nouveau mot de passe', url: ctx.resetUrl },
    footerNote:
      'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.',
  });
}

export function activationCodeEmail(
  ctx: BaseContext & { code: string; businessName: string; expiresAt: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'activation_code',
    subject: `Votre code d accès — ${ctx.businessName}`,
    preheader: 'Récupérez l’accès à votre espace client.',
    heading: 'Votre site vous attend',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Le site de ${ctx.businessName} est prêt. Ce code vous donne accès à votre espace, ` +
          'depuis lequel vous pourrez modifier votre contenu et recevoir vos messages.',
      ),
      codeBlock(ctx.code),
      paragraph(
        `Ce code est à usage unique et expire le ${ctx.expiresAt}. Ne le transmettez à personne.`,
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Votre code d accès : ${ctx.code}`,
      `Code à usage unique, valable jusqu’au ${ctx.expiresAt}.`,
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
    subject: `Invitation à rejoindre ${ctx.organizationName}`,
    preheader: 'Vous avez été invité à collaborer.',
    heading: `Rejoignez ${ctx.organizationName}`,
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Vous avez été invité à rejoindre l’espace de ${ctx.organizationName} sur StaX ` +
          `avec le rôle « ${ctx.roleLabel} ».`,
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Invitation à rejoindre ${ctx.organizationName} (rôle : ${ctx.roleLabel}).`,
    ],
    action: { label: 'Accepter l’invitation', url: ctx.inviteUrl },
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
    /** Deja formate avec sa periodicite : « 12 € / mois ». */
    maintenanceAmount: string;
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
        ['Maintenance', `${ctx.maintenanceAmount}, à partir de la livraison de votre site`],
      ]),
      paragraph(
        'Rien n’est prélevé au titre de la maintenance avant la livraison : elle commence le ' +
          'jour où nous vous remettons votre site, en ligne.',
      ),
      paragraph(
        'Prochaine étape : complétez le questionnaire de votre projet. Plus vos réponses ' +
          'sont précises, mieux nous concevrons votre site.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Commande ${ctx.reference} confirmée.`,
      `Offre : ${ctx.planName} — ${ctx.setupAmount}, puis ${ctx.maintenanceAmount} de maintenance.`,
      'La maintenance commence à la livraison de votre site : rien n’est prélevé avant.',
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
    heading: 'La création a commencé',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Notre équipe a commencé la conception du site de ${ctx.businessName}. ` +
          'Vous pouvez suivre chaque étape depuis votre espace, et nous écrire à tout moment.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), `La création du site de ${ctx.businessName} a commencé.`],
    action: { label: 'Suivre mon projet', url: ctx.projectUrl },
  });
}

export function previewReadyEmail(
  ctx: BaseContext & { previewUrl: string; projectUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'preview_ready',
    subject: 'Votre site est prêt à être relu',
    preheader: 'Decouvrez votre site avant sa mise en ligne.',
    heading: 'Votre site est prêt à être relu',
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
    preheader: 'Félicitations, votre site est accessible à tous.',
    heading: 'Votre site est en ligne',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      strongLine('Votre site est désormais accessible publiquement.'),
      paragraph(
        'Vous pouvez modifier vos contenus à tout moment depuis votre espace : textes, photos, ' +
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

/**
 * Livraison d'un site concu et developpe par l'equipe : il est en ligne,
 * l'editeur s'ouvre, et la maintenance mensuelle commence ce jour-la.
 */
export function siteDeliveredEmail(
  ctx: BaseContext & {
    siteUrl: string | null;
    appUrl: string;
    /** Deja formate avec sa periodicite, ou `null` sans maintenance facturee. */
    maintenanceAmount: string | null;
    refundDeadline: string | null;
  },
): EmailMessage {
  const rows: Array<[string, string]> = [];
  if (ctx.siteUrl) rows.push(['Adresse de votre site', ctx.siteUrl]);
  if (ctx.maintenanceAmount) {
    rows.push(['Maintenance', `${ctx.maintenanceAmount}, à partir d’aujourd’hui`]);
  }
  if (ctx.refundDeadline) {
    rows.push(['Garantie commerciale', `jusqu’au ${ctx.refundDeadline}`]);
  }

  return shell({
    to: ctx.to,
    template: 'site_delivered',
    subject: 'Votre site vous est livré',
    preheader: 'Il est en ligne : vous pouvez désormais le modifier depuis StaX.',
    heading: 'Votre site vous est livré',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      strongLine('Votre site est en ligne, et il est désormais entre vos mains.'),
      paragraph(
        'Depuis votre espace, vous pouvez modifier son contenu, voir l’aperçu de votre vrai ' +
          'site, enregistrer un brouillon puis publier : vos modifications sont réellement ' +
          'déployées, et chaque version reste restaurable.',
      ),
      paragraph(
        'Pour une nouvelle page, une nouvelle fonctionnalité ou un changement de design, ' +
          'écrivez-nous depuis votre espace.',
      ),
      rows.length > 0 ? definitionList(rows) : '',
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      'Votre site vous est livré : il est en ligne et vous pouvez le modifier depuis StaX.',
      ...rows.map(([label, value]) => `${label} : ${value}.`),
    ],
    action: { label: 'Ouvrir mon espace', url: ctx.appUrl },
    ...(ctx.siteUrl ? { secondaryAction: { label: 'Voir mon site', url: ctx.siteUrl } } : {}),
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
    preheader: 'Mettez à jour votre moyen de paiement.',
    heading: 'Nous n avons pas pu encaisser votre maintenance',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Le prélèvement de ${ctx.amount} n’a pas abouti. Votre site reste en ligne : ` +
          `nous réessaierons automatiquement le ${ctx.retryDate}.`,
      ),
      paragraph('Pour éviter toute interruption, vérifiez votre moyen de paiement des maintenant.'),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Échec du prelevement de ${ctx.amount}. Nouvelle tentative le ${ctx.retryDate}.`,
    ],
    action: { label: 'Mettre à jour mon paiement', url: ctx.billingUrl },
  });
}

export function invoiceEmail(
  ctx: BaseContext & { amount: string; periodLabel: string; invoiceUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'invoice',
    subject: `Votre facture — ${ctx.periodLabel}`,
    preheader: `Facture de ${ctx.amount}.`,
    heading: 'Votre facture est disponible',
    bodyHtml: definitionList([
      ['Période', ctx.periodLabel],
      ['Montant', ctx.amount],
    ]),
    bodyText: [`Facture ${ctx.periodLabel} — ${ctx.amount}.`],
    action: { label: 'Télécharger ma facture', url: ctx.invoiceUrl },
  });
}

/**
 * Facture de vente emise apres un accord commercial hors ligne.
 *
 * Le client n'a pas encore de compte : ce message est souvent le premier qu'il
 * recoit de nous. Il doit donc dire trois choses sans detour : ce qui a ete
 * convenu, combien, et quoi faire maintenant.
 *
 * Le numero de facture n'est PAS un mot de passe. Il est ecrit ici en clair
 * parce qu'il n'a de valeur qu'associe a cette adresse e-mail : c'est elle qui
 * autorise le rattachement, et le message le dit pour que personne ne croie
 * detenir un secret.
 */
export function salesInvoiceIssuedEmail(
  ctx: BaseContext & {
    invoiceNumber: string;
    companyName: string;
    planName: string;
    setupAmount: string;
    /** Deja formate avec sa periodicite : « 12 € / mois ». */
    maintenanceAmount: string;
    totalAmount: string;
    dueLabel: string;
    claimUrl: string;
    /** Delai de realisation de l'offre ; a defaut, la politique generale. */
    deliveryLabel?: string;
  },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'sales_invoice_issued',
    subject: `Votre facture ${ctx.invoiceNumber} — ${ctx.planName}`,
    preheader: `${ctx.totalAmount} à régler avant le ${ctx.dueLabel}.`,
    heading: 'Votre facture est prête',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      // `paragraph` echappe deja : le nom d entreprise vient d une saisie.
      paragraph(
        `Voici la facture correspondant à ce que nous avons convenu pour ${ctx.companyName}.`,
      ),
      definitionList([
        ['Numéro de facture', ctx.invoiceNumber],
        ['Offre', ctx.planName],
        ['Création du site', ctx.setupAmount],
        ['Maintenance', `${ctx.maintenanceAmount}, à partir de la livraison`],
        ['Total à régler', ctx.totalAmount],
        ['Échéance', ctx.dueLabel],
      ]),
      strongLine('Pour démarrer : créez votre compte avec CETTE adresse e-mail.'),
      paragraph(
        'Le bouton ci-dessous vous y mène, numéro de facture déjà rempli. Ce numéro ne vaut ' +
          'que depuis cette adresse : il ne donne accès à rien tout seul, et le règlement reste ' +
          'à effectuer séparément.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Facture ${ctx.invoiceNumber} — ${ctx.planName}.`,
      `Création du site : ${ctx.setupAmount}. Maintenance : ${ctx.maintenanceAmount}, à partir de la livraison.`,
      `Total à régler : ${ctx.totalAmount}, avant le ${ctx.dueLabel}.`,
      `Créez votre compte avec cette adresse e-mail, puis saisissez le numéro ${ctx.invoiceNumber}.`,
    ],
    action: { label: 'Rattacher ma facture', url: ctx.claimUrl },
    footerNote:
      `Le délai de réalisation de votre site est de ${ctx.deliveryLabel ?? deliveryPolicyConfig().label} ` +
      'à compter de la réception de vos contenus.',
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
          `jusqu’à cette date, puis pendant une période de continuité jusqu’au ${ctx.gracePeriodEnd}.`,
      ),
      paragraph(
        'Vos données ne sont pas supprimées à l’échéance : vous pouvez les exporter ou ' +
          'réactiver votre maintenance à tout moment.',
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
    subject: 'Votre remboursement a été effectué',
    preheader: `${ctx.amount} remboursés.`,
    heading: 'Remboursement effectué',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Un remboursement de ${ctx.amount} a été émis pour la commande ${ctx.reference}. ` +
          'Le délai de crédit dépend de votre banque, généralement 5 à 10 jours ouvrés.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), `Remboursement de ${ctx.amount} effectué (${ctx.reference}).`],
  });
}

/**
 * Rappel de reconduction — contrats ANNUELS vendus avant le passage a la
 * maintenance mensuelle, uniquement (le webhook Stripe filtre sur
 * `billing_interval = 'year'`).
 *
 * Envoye entre trois mois et un mois avant l'echeance : pour un client non
 * professionnel, l'article L215-1 du Code de la consommation l'impose, faute
 * de quoi il peut resilier a tout moment apres la reconduction. Nous
 * l'envoyons a tous les clients concernes, par loyaute. La maintenance
 * mensuelle, sans duree minimale, n'a pas de reconduction a annoncer.
 */
export function renewalReminderEmail(
  ctx: BaseContext & { renewalDate: string; amount: string; cancelUrl: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'renewal_reminder',
    subject: `Votre maintenance sera reconduite le ${ctx.renewalDate}`,
    preheader: `Reconduction le ${ctx.renewalDate} pour ${ctx.amount}. Vous pouvez résilier d’ici là.`,
    heading: 'Reconduction de votre maintenance',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Votre contrat de maintenance sera reconduit automatiquement le ${ctx.renewalDate}, ` +
          `pour une nouvelle période, au prix de ${ctx.amount}.`,
      ),
      paragraph(
        'Si vous ne souhaitez pas la reconduire, vous pouvez résilier en ligne en quelques ' +
          'clics d’ici cette date, sans frais ni justification. Votre site reste en ligne ' +
          'jusqu’à l’échéance.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Maintenance reconduite le ${ctx.renewalDate} pour ${ctx.amount}.`,
      `Pour ne pas la reconduire : ${ctx.cancelUrl}`,
    ],
    action: { label: 'Résilier votre contrat', url: ctx.cancelUrl },
    secondaryAction: { label: 'Gérer mon abonnement', url: `${platformUrl()}/app/abonnement` },
  });
}

/* -------------------------------------------------------------------------- */
/*  Signalements de contenus (DSA)                                             */
/* -------------------------------------------------------------------------- */

export function contentReportReceivedEmail(ctx: {
  to: string;
  reference: string;
  url: string;
}): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'content_report_received',
    subject: `Signalement reçu — ${ctx.reference}`,
    preheader: 'Votre signalement sera examiné par une personne.',
    heading: 'Nous avons bien reçu votre signalement',
    bodyHtml: [
      paragraph('Bonjour,'),
      paragraph(
        'Votre signalement a bien été enregistré. Il sera examiné par une personne de notre ' +
          'équipe, sans décision automatisée, et vous serez informé de la suite qui lui est donnée.',
      ),
      definitionList([
        ['Référence', ctx.reference],
        ['Contenu signalé', ctx.url],
      ]),
      paragraph('En cas de danger immédiat pour une personne, appelez le 17 ou le 112.'),
    ].join(''),
    bodyText: [
      'Bonjour,',
      `Signalement enregistré (${ctx.reference}) pour ${ctx.url}.`,
      'Il sera examiné par une personne et vous serez informé de la suite donnée.',
    ],
  });
}

export function contentReportDecisionEmail(ctx: {
  to: string;
  reference: string;
  url: string;
  actioned: boolean;
  decision: string;
}): EmailMessage {
  const outcome = ctx.actioned
    ? 'Après examen, l’accès au contenu signalé a été retiré ou restreint.'
    : 'Après examen, nous n’avons pas retiré le contenu signalé.';
  return shell({
    to: ctx.to,
    template: 'content_report_decision',
    subject: `Suite donnée à votre signalement — ${ctx.reference}`,
    preheader: outcome,
    heading: 'Suite donnée à votre signalement',
    bodyHtml: [
      paragraph('Bonjour,'),
      paragraph(outcome),
      definitionList([
        ['Référence', ctx.reference],
        ['Contenu signalé', ctx.url],
        ['Motifs', ctx.decision],
      ]),
      paragraph(
        'Cette décision a été prise par une personne, sans recours à un traitement automatisé. ' +
          'Si vous la contestez, vous pouvez nous répondre en indiquant la référence ci-dessus, ' +
          'ou saisir la juridiction compétente.',
      ),
    ].join(''),
    bodyText: [
      'Bonjour,',
      outcome,
      `Référence : ${ctx.reference}. Motifs : ${ctx.decision}`,
      'Vous pouvez contester cette décision en répondant à ce message.',
    ],
  });
}

/**
 * Exposé des motifs adresse a l'editeur du site quand un contenu est retire ou
 * restreint (reglement (UE) 2022/2065, article 17).
 */
export function contentRestrictedEmail(
  ctx: BaseContext & { reference: string; url: string; decision: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'content_restricted',
    subject: `Un contenu de votre site a été restreint — ${ctx.reference}`,
    preheader: 'Voici les motifs de cette décision et comment la contester.',
    heading: 'Un contenu de votre site a été restreint',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'À la suite d’un signalement, nous avons examiné un contenu publié sur votre site et ' +
          'avons décidé d’en retirer ou d’en restreindre l’accès.',
      ),
      definitionList([
        ['Référence', ctx.reference],
        ['Contenu concerné', ctx.url],
        ['Motifs', ctx.decision],
      ]),
      paragraph(
        'Cette décision a été prise par une personne, sans traitement automatisé. Vous pouvez ' +
          'la contester en répondant à ce message avec vos explications : elle sera réexaminée. ' +
          'Vous conservez la possibilité de saisir la juridiction compétente.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Contenu restreint (${ctx.reference}) : ${ctx.url}.`,
      `Motifs : ${ctx.decision}`,
      'Vous pouvez contester cette décision en répondant à ce message.',
    ],
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
