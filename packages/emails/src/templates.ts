import { deliveryPolicyConfig, legalValue, platformUrl } from '@nemasus/config';
import {
  codeBlock,
  definitionList,
  paragraph,
  renderEmailLayout,
  strongLine,
  toPlainText,
} from './layout';
import { escapeHtml } from './escape';
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

/**
 * Information due a un prospect (article 13 du RGPD) : qui traite ses
 * coordonnees, pourquoi, et comment s'y opposer. Figure sur chaque message
 * adresse a une entreprise qui n'est pas encore cliente.
 */
/**
 * Information du prospect au premier message (RGPD, art. 14 : ses coordonnees
 * n'ont pas ete collectees aupres de lui, mais dans une source publique puis
 * au telephone). Tout y est : responsable, finalite, base legale, source,
 * duree, droits, opposition immediate.
 */
function prospectPrivacyNotice(): string {
  const company = legalValue('LEGAL_COMPANY_NAME');
  const address = legalValue('LEGAL_ADDRESS');
  const contact = legalValue('LEGAL_DPO_CONTACT');
  return (
    'Pourquoi ce message : lors de notre échange téléphonique, vous avez accepté de recevoir ' +
    `cette proposition. Responsable du traitement : ${company} (Nemasus), ${address}. Nous ` +
    'utilisons vos coordonnées professionnelles (nom, entreprise, téléphone, e-mail) pour vous ' +
    'adresser cette proposition et en assurer le suivi, sur le fondement de notre intérêt ' +
    'légitime à présenter nos services aux entreprises (RGPD, art. 6.1.f). Le numéro de votre ' +
    'établissement provient d’une source publique professionnelle (registre, annuaire ou site ' +
    'de votre entreprise). Ces données sont conservées trois ans après notre dernier contact. ' +
    'Vous pouvez vous y opposer à tout moment, sans motif, en répondant « STOP » : elles seront ' +
    `supprimées. Vous pouvez aussi y accéder, les faire rectifier ou effacer (${contact}) et ` +
    `saisir la CNIL. En savoir plus : ${platformUrl()}/confidentialite.`
  );
}

const hello = (firstName?: string | null) => (firstName ? `Bonjour ${firstName},` : 'Bonjour,');

/* -------------------------------------------------------------------------- */
/*  Compte                                                                     */
/* -------------------------------------------------------------------------- */

export function welcomeEmail(ctx: BaseContext): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'welcome',
    subject: 'Bienvenue sur Nemasus',
    preheader: 'Votre compte est créé. Voici la suite.',
    heading: 'Bienvenue sur Nemasus',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Votre compte est créé. Vous pouvez dès maintenant commander votre site, ' +
          'suivre son avancement et gérer votre entreprise depuis votre espace.',
      ),
      paragraph(
        'Nous vous accompagnons à chaque étape : vous n’avez rien à installer et ' +
          'rien à configurer techniquement.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      'Votre compte Nemasus est créé. Vous pouvez commander votre site et suivre son avancement depuis votre espace.',
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
    subject: 'Réinitialiser votre mot de passe',
    preheader: 'Lien valable une heure.',
    heading: 'Réinitialiser votre mot de passe',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable une heure ' +
          'et ne fonctionne qu’une seule fois.',
      ),
    ].join(''),
    bodyText: [hello(ctx.firstName), 'Réinitialisez votre mot de passe (lien valable une heure).'],
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
    subject: `Votre code d’accès — ${ctx.businessName}`,
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
      `Votre code d’accès : ${ctx.code}`,
      `Code à usage unique, valable jusqu’au ${ctx.expiresAt}.`,
    ],
    action: { label: 'Activer mon espace', url: `${platformUrl()}/activation` },
    footerNote: 'Ce code est personnel. Nemasus ne vous le demandera jamais par téléphone.',
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
        `Vous avez été invité à rejoindre l’espace de ${ctx.organizationName} sur Nemasus ` +
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
    preheader: 'Découvrez votre site avant sa mise en ligne.',
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
          'horaires, tarifs. Les modifications ne sont visibles qu’après publication.',
      ),
      definitionList([
        ['Adresse de votre site', ctx.siteUrl],
        ['Période de garantie commerciale', `jusqu’au ${ctx.refundDeadline}`],
      ]),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Votre site est en ligne : ${ctx.siteUrl}`,
      `Période de garantie commerciale jusqu’au ${ctx.refundDeadline}.`,
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
    preheader: 'Il est en ligne : vous pouvez désormais le modifier depuis Nemasus.',
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
      'Votre site vous est livré : il est en ligne et vous pouvez le modifier depuis Nemasus.',
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
  ctx: BaseContext & {
    siteName: string;
    senderName: string;
    excerpt: string;
    inboxUrl: string;
    formName?: string | null;
    /** Adresse du visiteur : « Répondre » lui écrit directement. */
    replyTo?: string | null;
  },
): EmailMessage {
  const origin = ctx.formName ? ` (formulaire « ${ctx.formName} »)` : '';
  const message = shell({
    to: ctx.to,
    template: 'new_message',
    subject: `Nouveau message de ${ctx.senderName} — ${ctx.siteName}`,
    preheader: ctx.excerpt.slice(0, 120),
    heading: 'Vous avez reçu un message',
    bodyHtml: [
      paragraph(`${ctx.senderName} vous a écrit depuis ${ctx.siteName}${origin} :`),
      ctx.excerpt
        ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #E4E4E7;
        color:#3F3F46;font-style:italic;white-space:pre-line;">${escapeHtml(ctx.excerpt.slice(0, 500))}</blockquote>`
        : '',
      ctx.replyTo
        ? paragraph('Répondez directement à cet e-mail : votre réponse lui parviendra.')
        : '',
    ].join(''),
    bodyText: [
      `${ctx.senderName} vous a écrit depuis ${ctx.siteName}${origin} :`,
      ctx.excerpt.slice(0, 500),
      ...(ctx.replyTo ? ['Répondez directement à cet e-mail : votre réponse lui parviendra.'] : []),
    ],
    action: { label: 'Lire le message', url: ctx.inboxUrl },
  });
  return ctx.replyTo ? { ...message, replyTo: ctx.replyTo } : message;
}

export function newBookingEmail(
  ctx: BaseContext & {
    siteName: string;
    customerName: string;
    dateLabel: string;
    partySize: number;
    bookingsUrl: string;
    serviceName?: string | null;
    /** Demande à accepter ou refuser (sinon : réservation confirmée d'office). */
    needsAnswer?: boolean;
    replyTo?: string | null;
  },
): EmailMessage {
  const people = `${ctx.partySize} ${ctx.partySize > 1 ? 'personnes' : 'personne'}`;
  const needsAnswer = ctx.needsAnswer !== false;
  const message = shell({
    to: ctx.to,
    template: 'new_booking',
    subject: `${needsAnswer ? 'Demande de réservation' : 'Nouvelle réservation'} — ${ctx.dateLabel}`,
    preheader: `${ctx.customerName}, ${people}, sur ${ctx.siteName}.`,
    heading: needsAnswer ? 'Nouvelle demande de réservation' : 'Nouvelle réservation',
    bodyHtml: [
      definitionList([
        ['Client', ctx.customerName],
        ['Date et heure', ctx.dateLabel],
        ['Nombre de personnes', String(ctx.partySize)],
        ...(ctx.serviceName ? ([['Prestation', ctx.serviceName]] as Array<[string, string]>) : []),
        ['Site', ctx.siteName],
      ]),
      needsAnswer
        ? paragraph('Votre client attend votre réponse : acceptez ou refusez la demande.')
        : '',
    ].join(''),
    bodyText: [
      `${needsAnswer ? 'Demande de réservation' : 'Nouvelle réservation'} sur ${ctx.siteName} : ${ctx.customerName}, ${ctx.dateLabel}, ${people}.`,
      ...(needsAnswer
        ? ['Votre client attend votre réponse : acceptez ou refusez la demande.']
        : []),
    ],
    action: {
      label: needsAnswer ? 'Accepter ou refuser' : 'Voir la réservation',
      url: ctx.bookingsUrl,
    },
  });
  return ctx.replyTo ? { ...message, replyTo: ctx.replyTo } : message;
}

export function newShopOrderEmail(
  ctx: BaseContext & {
    siteName: string;
    reference: string;
    total: string;
    customerName: string;
    ordersUrl: string;
    replyTo?: string | null;
  },
): EmailMessage {
  const message = shell({
    to: ctx.to,
    template: 'new_shop_order',
    subject: `Nouvelle commande payée — ${ctx.reference}`,
    preheader: `${ctx.customerName} — ${ctx.total}, sur ${ctx.siteName}.`,
    heading: 'Vous avez reçu une commande',
    bodyHtml: [
      definitionList([
        ['Référence', ctx.reference],
        ['Client', ctx.customerName],
        ['Montant payé', ctx.total],
        ['Site', ctx.siteName],
      ]),
      paragraph('Le paiement est confirmé : vous pouvez préparer la commande.'),
    ].join(''),
    bodyText: [
      `Nouvelle commande ${ctx.reference} de ${ctx.customerName} — ${ctx.total}, sur ${ctx.siteName}.`,
      'Le paiement est confirmé : vous pouvez préparer la commande.',
    ],
    action: { label: 'Voir la commande', url: ctx.ordersUrl },
  });
  return ctx.replyTo ? { ...message, replyTo: ctx.replyTo } : message;
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
    subject: 'Échec du prélèvement de votre maintenance',
    preheader: 'Mettez à jour votre moyen de paiement.',
    heading: 'Nous n’avons pas pu encaisser votre maintenance',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Le prélèvement de ${ctx.amount} n’a pas abouti. Votre site reste en ligne : ` +
          `nous réessaierons automatiquement le ${ctx.retryDate}.`,
      ),
      paragraph('Pour éviter toute interruption, vérifiez votre moyen de paiement dès maintenant.'),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Échec du prélèvement de ${ctx.amount}. Nouvelle tentative le ${ctx.retryDate}.`,
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
  ctx: BaseContext & {
    endDate: string;
    gracePeriodEnd: string;
    billingUrl: string;
    /** Choix du Client pour ses données (RGPD art. 28 § 3 g). */
    dataFate: 'restitution' | 'suppression';
    deletionDate: string;
  },
): EmailMessage {
  const fate =
    ctx.dataFate === 'suppression'
      ? `Vous avez choisi la suppression de vos données : elles seront supprimées définitivement le ${ctx.deletionDate}.`
      : `Vous avez choisi de récupérer vos données : jusqu’au ${ctx.deletionDate}, vous pouvez les exporter depuis votre espace et demander la copie du code de votre site. Elles seront ensuite supprimées définitivement.`;
  return shell({
    to: ctx.to,
    template: 'subscription_cancelled',
    subject: 'Résiliation de votre maintenance enregistrée',
    preheader: `Votre site reste en ligne jusqu’au ${ctx.endDate}.`,
    heading: 'Votre résiliation est enregistrée',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Votre maintenance prendra fin le ${ctx.endDate}. Votre site reste accessible ` +
          `jusqu’à cette date, puis pendant une période de continuité jusqu’au ${ctx.gracePeriodEnd}.`,
      ),
      paragraph(fate),
      paragraph(
        'Vous pouvez changer d’avis, ou réactiver votre maintenance, jusqu’à cette date : ' +
          'répondez simplement à cet e-mail.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Maintenance résiliée au ${ctx.endDate}. Période de continuité jusqu’au ${ctx.gracePeriodEnd}.`,
      fate,
      'Vous pouvez changer d’avis, ou réactiver votre maintenance, jusqu’à cette date.',
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
      paragraph('Nous avons bien reçu votre demande et nous l’examinons.'),
      definitionList([
        ['Commande', ctx.reference],
        ['Montant estimé du remboursement', ctx.amount],
        ...(ctx.deduction
          ? ([['Retenue pour achat du nom de domaine', ctx.deduction]] as Array<[string, string]>)
          : []),
      ]),
      paragraph(
        'Ce montant est une estimation : il sera confirmé après vérification. ' +
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
    action: { label: 'Ouvrir dans l’administration', url: ctx.adminUrl },
  });
}

/* -------------------------------------------------------------------------- */
/*  Proposition de site (vente par telephone)                                  */
/* -------------------------------------------------------------------------- */

function quote(text: string): string {
  return `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #E4E4E7;
    color:#3F3F46;">${escapeHtml(text)}</blockquote>`;
}

/**
 * « Votre site est prêt » : envoyé après un appel concluant.
 *
 * Le prospect n'a rien d'autre en main que ce message : il doit comprendre en
 * trois lignes ce qu'il voit (son site, déjà en ligne), ce qu'il paie (le prix
 * de l'offre, la maintenance mensuelle) et quoi faire (un seul bouton). Le code
 * est rappelé en clair au cas où le lien ne s'ouvrirait pas.
 */
export function siteProposalEmail(ctx: {
  to: string;
  firstName?: string | null;
  companyName: string;
  siteUrl: string | null;
  claimUrl: string;
  code: string;
  planName: string;
  /** Prix de création, déjà formaté (TTC). */
  priceLabel: string;
  /** Maintenance, déjà formatée avec sa périodicité, ou `null`. */
  maintenanceLabel: string | null;
  expiresLabel: string;
  message: string | null;
  reminder?: boolean;
}): EmailMessage {
  const rows: Array<[string, string]> = [
    ['Offre', ctx.planName],
    ['Création du site', ctx.priceLabel],
  ];
  if (ctx.maintenanceLabel) rows.push(['Maintenance', `${ctx.maintenanceLabel}, sans engagement`]);
  rows.push(['Proposition valable jusqu’au', ctx.expiresLabel]);

  const subject = ctx.reminder
    ? `Rappel : le site de ${ctx.companyName} vous attend`
    : `Le site de ${ctx.companyName} est prêt`;

  return shell({
    to: ctx.to,
    template: ctx.reminder ? 'site_proposal_reminder' : 'site_proposal',
    subject,
    preheader: 'Découvrez-le en ligne, puis récupérez-le en quelques minutes.',
    heading: `Le site de ${ctx.companyName} est prêt`,
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Comme convenu lors de notre appel, nous avons préparé votre site. Il est déjà en ' +
          'ligne : vous pouvez le découvrir dès maintenant.',
      ),
      ctx.message ? quote(ctx.message) : '',
      strongLine('Pour le récupérer, trois étapes :'),
      paragraph('1. Cliquez sur « Récupérer mon site » ci-dessous.'),
      paragraph('2. Créez votre compte Nemasus avec cette adresse e-mail.'),
      paragraph(
        '3. Vérifiez votre site et réglez-le en ligne : il est à vous aussitôt, et vous ' +
          'pouvez le modifier vous-même.',
      ),
      definitionList(rows),
      paragraph('Votre code personnel, si l’on vous le demande :'),
      codeBlock(ctx.code),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Comme convenu, le site de ${ctx.companyName} est prêt et déjà en ligne.`,
      ctx.siteUrl ? `Voir le site : ${ctx.siteUrl}` : '',
      ctx.message ?? '',
      'Pour le récupérer : cliquez sur le lien ci-dessous, créez votre compte Nemasus avec cette adresse e-mail, puis réglez en ligne.',
      ...rows.map(([label, value]) => `${label} : ${value}`),
      `Votre code personnel : ${ctx.code}`,
      prospectPrivacyNotice(),
    ],
    action: { label: 'Récupérer mon site', url: ctx.claimUrl },
    ...(ctx.siteUrl ? { secondaryAction: { label: 'Voir mon site', url: ctx.siteUrl } } : {}),
    footerNote:
      'Ce code est personnel et ne fonctionne qu’avec votre adresse e-mail. Nemasus ne vous le ' +
      `demandera jamais par téléphone. ${prospectPrivacyNotice()}`,
  });
}

/** Rappel à un prospect qui a déjà récupéré son site mais n'a pas encore réglé. */
export function proposalPaymentReminderEmail(ctx: {
  to: string;
  firstName?: string | null;
  companyName: string;
  appUrl: string;
  priceLabel: string;
  expiresLabel: string;
}): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'site_proposal_payment_reminder',
    subject: `Votre site ${ctx.companyName} vous attend`,
    preheader: 'Une dernière étape pour qu’il soit à vous.',
    heading: 'Une dernière étape',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Votre site est prêt dans votre espace Nemasus. Il ne reste qu’à le régler ` +
          `(${ctx.priceLabel}) pour qu’il soit à vous et que vous puissiez le modifier.`,
      ),
      paragraph(`Cette proposition est valable jusqu’au ${ctx.expiresLabel}.`),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Votre site est prêt dans votre espace Nemasus. Réglez-le (${ctx.priceLabel}) avant le ${ctx.expiresLabel}.`,
      prospectPrivacyNotice(),
    ],
    action: { label: 'Finaliser', url: ctx.appUrl },
    footerNote: prospectPrivacyNotice(),
  });
}

/* -------------------------------------------------------------------------- */
/*  Discussion avec l'equipe                                                   */
/* -------------------------------------------------------------------------- */

/** L'équipe Nemasus a répondu au client. */
export function teamReplyEmail(ctx: {
  to: string;
  firstName?: string | null;
  excerpt: string;
  conversationUrl: string;
}): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'team_reply',
    subject: 'L’équipe Nemasus vous a répondu',
    preheader: ctx.excerpt.slice(0, 120),
    heading: 'Vous avez une réponse',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph('L’équipe Nemasus vous a répondu :'),
      quote(ctx.excerpt.slice(0, 800)),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      'L’équipe Nemasus vous a répondu :',
      ctx.excerpt.slice(0, 800),
    ],
    action: { label: 'Lire et répondre', url: ctx.conversationUrl },
  });
}

/**
 * Alerte interne à l'équipe Nemasus (nouveau message d'un client, site récupéré,
 * paiement reçu, livraison bloquée). Jamais envoyée à un client.
 */
export function staffAlertEmail(ctx: {
  to: string;
  subject: string;
  heading: string;
  lines: ReadonlyArray<[string, string]>;
  excerpt?: string | null;
  actionUrl: string;
  actionLabel?: string;
}): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'staff_alert',
    subject: ctx.subject,
    preheader: ctx.excerpt?.slice(0, 120) ?? ctx.heading,
    heading: ctx.heading,
    bodyHtml: [
      definitionList(ctx.lines),
      ctx.excerpt ? quote(ctx.excerpt.slice(0, 1500)) : '',
    ].join(''),
    bodyText: [
      ...ctx.lines.map(([label, value]) => `${label} : ${value}`),
      ctx.excerpt ? ctx.excerpt.slice(0, 1500) : '',
    ],
    action: { label: ctx.actionLabel ?? 'Ouvrir dans l’administration', url: ctx.actionUrl },
  });
}

/* -------------------------------------------------------------------------- */
/*  Bilan mensuel du site                                                      */
/* -------------------------------------------------------------------------- */

export interface MonthlyReportFigures {
  siteName: string;
  /** Mois couvert, AAAA-MM-01. */
  month: string;
  visitors: number;
  pageviews: number;
  contacts: number;
  orders: number;
  /** Montant encaissé, déjà formaté (`formatMoney`), `null` sans commande. */
  revenueLabel: string | null;
  /** Mois précédent, `null` s'il n'a aucune mesure (pas de variation inventée). */
  previousVisitors: number | null;
  previousContacts: number | null;
  uptimeBps: number | null;
  avgResponseMs: number | null;
  qualityScore: number | null;
  topPages: Array<{ path: string; views: number }>;
  topSources: Array<{ source: string; visits: number }>;
}

const MONTH_NAME = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const INTEGER = new Intl.NumberFormat('fr-FR');

/** « +12 % », « −8 % », « stable » ; `null` sans mois précédent mesuré. */
export function monthOverMonth(current: number, previous: number | null): string | null {
  if (previous === null || previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return 'stable';
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} % par rapport au mois précédent`;
}

/**
 * Bilan du mois écoulé, envoyé aux responsables d'un site livré. Tous les
 * chiffres viennent de la base ; une valeur non mesurée n'apparaît pas (on
 * n'écrit jamais « 0 % de disponibilité » pour un mois sans vérification).
 */
export function siteMonthlyReportEmail(
  ctx: BaseContext & { figures: MonthlyReportFigures; appUrl: string; preferencesUrl: string },
): EmailMessage {
  const f = ctx.figures;
  const monthLabel = MONTH_NAME.format(new Date(`${f.month}T12:00:00Z`));
  const visitorsTrend = monthOverMonth(f.visitors, f.previousVisitors);
  const contactsTrend = monthOverMonth(f.contacts, f.previousContacts);

  const rows: Array<[string, string]> = [
    ['Visiteurs', `${INTEGER.format(f.visitors)}${visitorsTrend ? ` (${visitorsTrend})` : ''}`],
    ['Pages vues', INTEGER.format(f.pageviews)],
    [
      'Prises de contact',
      `${INTEGER.format(f.contacts)}${contactsTrend ? ` (${contactsTrend})` : ''}`,
    ],
  ];
  if (f.orders > 0) {
    rows.push([
      'Commandes payées',
      `${INTEGER.format(f.orders)}${f.revenueLabel ? ` — ${f.revenueLabel}` : ''}`,
    ]);
  }
  if (f.uptimeBps !== null) {
    rows.push([
      'Disponibilité',
      `${(f.uptimeBps / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %${
        f.avgResponseMs !== null ? ` · réponse moyenne ${INTEGER.format(f.avgResponseMs)} ms` : ''
      }`,
    ]);
  }
  if (f.qualityScore !== null) rows.push(['Bilan qualité', `${f.qualityScore} / 100`]);

  const pages = f.topPages.map((page) => `${page.path} (${INTEGER.format(page.views)} vues)`);
  const sources = f.topSources.map(
    (source) => `${source.source} (${INTEGER.format(source.visits)})`,
  );

  return shell({
    to: ctx.to,
    template: 'site_monthly_report',
    subject: `${f.siteName} : votre bilan de ${monthLabel}`,
    preheader: `${INTEGER.format(f.visitors)} visiteurs et ${INTEGER.format(f.contacts)} prises de contact en ${monthLabel}.`,
    heading: `Votre site en ${monthLabel}`,
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(`Voici le bilan de ${f.siteName} pour le mois écoulé.`),
      definitionList(rows),
      pages.length > 0 ? paragraph(`Pages les plus consultées : ${pages.join(', ')}.`) : '',
      sources.length > 0 ? paragraph(`D’où viennent vos visiteurs : ${sources.join(', ')}.`) : '',
      paragraph(
        'Mesure sans cookie ni suivi : un visiteur est une personne distincte sur une journée. ' +
          'Le détail, jour par jour, est dans votre espace.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Voici le bilan de ${f.siteName} pour ${monthLabel}.`,
      ...rows.map(([label, value]) => `${label} : ${value}.`),
      pages.length > 0 ? `Pages les plus consultées : ${pages.join(', ')}.` : '',
      sources.length > 0 ? `D’où viennent vos visiteurs : ${sources.join(', ')}.` : '',
    ],
    action: { label: 'Voir mes statistiques', url: ctx.appUrl },
    footerNote:
      'Vous recevez ce bilan parce que vous êtes responsable de ce site sur Nemasus. ' +
      `Pour ne plus le recevoir : ${ctx.preferencesUrl}`,
  });
}
