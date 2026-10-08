import { emailSettings, legalValue, platformUrl } from '@nemasus/config';
import {
  codeBlock,
  definitionList,
  paragraph,
  renderEmailLayout,
  steps,
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
    replyTo: emailSettings().replyTo ?? (support.startsWith('[') ? undefined : support),
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
      `Vos données et vos droits : ${base.replace(/\/+$/, '')}/confidentialite`,
    ]),
  };
}

const hello = (firstName?: string | null) => (firstName ? `Bonjour ${firstName},` : 'Bonjour,');

/* -------------------------------------------------------------------------- */
/*  Compte                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Mot de passe oublie. Le lien porte un jeton aleatoire dont la base ne garde
 * que l'empreinte ; il expire au bout d'une heure et ne sert qu'une fois.
 */
export function passwordResetEmail(
  ctx: BaseContext & { resetUrl: string; validForMinutes: number },
): EmailMessage {
  const validity =
    ctx.validForMinutes % 60 === 0
      ? `${ctx.validForMinutes / 60} heure${ctx.validForMinutes === 60 ? '' : 's'}`
      : `${ctx.validForMinutes} minutes`;
  return shell({
    to: ctx.to,
    template: 'password_reset',
    subject: 'Réinitialisez votre mot de passe Nemasus',
    preheader: `Lien personnel, valable ${validity} et utilisable une seule fois.`,
    heading: 'Choisissez un nouveau mot de passe',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        'Vous avez demandé à réinitialiser le mot de passe de votre espace Nemasus. Cliquez sur ' +
          'le bouton ci-dessous pour en choisir un nouveau.',
      ),
      paragraph(
        `Ce lien est valable ${validity} et ne fonctionne qu’une seule fois. Une fois le mot de ` +
          'passe changé, toutes vos autres sessions sont fermées.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      'Vous avez demandé à réinitialiser le mot de passe de votre espace Nemasus.',
      `Ce lien est valable ${validity} et ne fonctionne qu’une seule fois.`,
    ],
    action: { label: 'Choisir un nouveau mot de passe', url: ctx.resetUrl },
    footerNote:
      'Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre mot de passe ' +
      'reste inchangé et personne ne peut l’utiliser sans accès à votre boîte e-mail.',
  });
}

/**
 * Code d'acces personnel, envoye une fois le virement recu. Le lien preremplit
 * le code mais n'ouvre rien a lui seul : la personne confirme sur la page, ce
 * qui empeche un antivirus de messagerie qui « visite » les liens de consommer
 * le code a sa place.
 */
export function accessCodeEmail(
  ctx: BaseContext & {
    code: string;
    companyName: string;
    orderReference: string | null;
    accessUrl: string;
    expiresLabel: string;
  },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'access_code',
    subject: `Votre code d’accès Nemasus — ${ctx.companyName}`,
    preheader: 'Paiement reçu : voici votre code personnel pour accéder à votre espace.',
    heading: 'Votre espace est ouvert',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Nous avons bien reçu votre paiement${
          ctx.orderReference ? ` pour la commande ${ctx.orderReference}` : ''
        }. Merci de votre confiance ! Voici votre code d’accès personnel à l’espace de ` +
          `${ctx.companyName} :`,
      ),
      codeBlock(ctx.code),
      steps([
        'Rendez-vous sur Nemasus, rubrique « Accès client » (le bouton ci-dessous y mène, code prérempli).',
        'Saisissez ce code, puis choisissez votre mot de passe pour vos prochaines connexions.',
        'Retrouvez votre site, l’avancement de votre projet et la discussion avec notre équipe.',
      ]),
      paragraph(
        `Ce code est personnel, ne sert qu’une seule fois et expire le ${ctx.expiresLabel}. ` +
          'Il ne fonctionne qu’avec votre adresse e-mail.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Nous avons bien reçu votre paiement${
        ctx.orderReference ? ` pour la commande ${ctx.orderReference}` : ''
      }. Voici votre code d’accès personnel à l’espace de ${ctx.companyName} :`,
      ctx.code,
      'Rendez-vous sur Nemasus, rubrique « Accès client », saisissez ce code, puis choisissez votre mot de passe.',
      `Code personnel, à usage unique, valable jusqu’au ${ctx.expiresLabel}.`,
    ],
    action: { label: 'Accéder à mon espace', url: ctx.accessUrl },
    footerNote:
      'Ce code est confidentiel : ne le transmettez à personne. L’équipe Nemasus ne vous le ' +
      'demandera jamais, ni par téléphone ni par e-mail.',
  });
}

export function teamInvitationEmail(
  ctx: BaseContext & { inviteUrl: string; organizationName: string; roleLabel: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'team_invitation',
    subject: `Invitation à rejoindre ${ctx.organizationName} sur Nemasus`,
    preheader: 'Vous avez été invité à collaborer sur le site de l’entreprise.',
    heading: `Rejoignez ${ctx.organizationName}`,
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Vous avez été invité à rejoindre l’espace de ${ctx.organizationName} sur Nemasus ` +
          `avec le rôle « ${ctx.roleLabel} ».`,
      ),
      paragraph(
        'Le lien ci-dessous vous permet de créer votre compte avec cette adresse e-mail, ou de ' +
          'vous connecter si vous en avez déjà un.',
      ),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Invitation à rejoindre ${ctx.organizationName} (rôle : ${ctx.roleLabel}).`,
    ],
    action: { label: 'Accepter l’invitation', url: ctx.inviteUrl },
    footerNote: 'Cette invitation est personnelle et expire dans 7 jours.',
  });
}

/* -------------------------------------------------------------------------- */
/*  Commande et paiement par virement                                          */
/* -------------------------------------------------------------------------- */

/** Accuse de reception d'une commande : ce qui va se passer, dans l'ordre. */
export function siteOrderReceivedEmail(
  ctx: BaseContext & { reference: string; companyName: string },
): EmailMessage {
  return shell({
    to: ctx.to,
    template: 'site_order_received',
    subject: `Commande ${ctx.reference} reçue — ${ctx.companyName}`,
    preheader: 'Nous revenons vers vous avec les modalités de paiement par virement.',
    heading: 'Nous avons bien reçu votre commande',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Merci pour votre commande du site de ${ctx.companyName}. Elle est enregistrée sous la ` +
          `référence ${ctx.reference}. Aucun paiement n’a été demandé à ce stade.`,
      ),
      strongLine('Ce qui se passe maintenant'),
      steps([
        'Nous étudions votre demande et vous écrivons si une précision est utile.',
        'Nous vous envoyons par e-mail les modalités de paiement par virement bancaire : montant, coordonnées bancaires et référence à indiquer.',
        'Dès réception de votre virement, vous recevez votre code d’accès personnel.',
        'Avec ce code, vous accédez à votre espace : suivi du projet, échanges avec l’équipe, puis votre site.',
      ]),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Merci pour votre commande du site de ${ctx.companyName} (référence ${ctx.reference}).`,
      '1. Nous étudions votre demande.',
      '2. Nous vous envoyons les modalités de paiement par virement bancaire.',
      '3. Dès réception du virement, vous recevez votre code d’accès personnel.',
      '4. Avec ce code, vous accédez à votre espace et à votre site.',
    ],
    footerNote:
      'Conservez la référence de votre commande : elle sera à rappeler dans le libellé de votre virement.',
  });
}

export interface BankDetails {
  holder: string;
  iban: string;
  bic: string | null;
  bank: string | null;
}

/** Modalites de paiement par virement : montant convenu, coordonnees, reference. */
export function bankTransferInstructionsEmail(
  ctx: BaseContext & {
    reference: string;
    companyName: string;
    amountLabel: string;
    bank: BankDetails;
    message: string | null;
    reminder: boolean;
    /** Version des CGV en vigueur : le virement vaut leur acceptation (CGV, article 5). */
    termsVersion?: string;
  },
): EmailMessage {
  const termsUrl = `${platformUrl().replace(/\/+$/, '')}/cgv`;
  const termsLine =
    'Ces modalités sont valables trente jours. Votre virement vaut acceptation de nos ' +
    `conditions générales de vente${ctx.termsVersion ? ` (version du ${ctx.termsVersion})` : ''}, ` +
    `consultables sur ${termsUrl}. Tant que la réalisation n’a pas commencé, vous pouvez annuler ` +
    'votre commande et être intégralement remboursé.';
  const rows: Array<[string, string]> = [
    ['Montant à régler', ctx.amountLabel],
    ['Bénéficiaire', ctx.bank.holder],
    ['IBAN', ctx.bank.iban],
  ];
  if (ctx.bank.bic) rows.push(['BIC', ctx.bank.bic]);
  if (ctx.bank.bank) rows.push(['Banque', ctx.bank.bank]);
  rows.push(['Libellé du virement', ctx.reference]);

  return shell({
    to: ctx.to,
    template: 'site_order_payment',
    subject: `${ctx.reminder ? 'Rappel — ' : ''}Modalités de paiement de votre commande ${ctx.reference}`,
    preheader: `${ctx.amountLabel} par virement bancaire, référence ${ctx.reference}.`,
    heading: 'Modalités de paiement par virement',
    bodyHtml: [
      paragraph(hello(ctx.firstName)),
      paragraph(
        `Voici les modalités de paiement de la commande ${ctx.reference} pour le site de ` +
          `${ctx.companyName}. Le règlement se fait par virement bancaire.`,
      ),
      ctx.message ? quote(ctx.message.slice(0, 1500)) : '',
      definitionList(rows),
      strongLine(`Indiquez bien la référence ${ctx.reference} dans le libellé du virement.`),
      paragraph(
        'Dès que votre virement nous parvient, nous vous envoyons par e-mail votre code d’accès ' +
          'personnel. Selon les banques, un virement met de quelques heures à deux jours ouvrés ' +
          'pour arriver.',
      ),
      paragraph(termsLine),
    ].join(''),
    bodyText: [
      hello(ctx.firstName),
      `Modalités de paiement de la commande ${ctx.reference} (${ctx.companyName}).`,
      ctx.message ? ctx.message.slice(0, 1500) : '',
      ...rows.map(([label, value]) => `${label} : ${value}`),
      `Indiquez la référence ${ctx.reference} dans le libellé du virement.`,
      'Dès réception, nous vous envoyons votre code d’accès personnel.',
      termsLine,
    ],
    footerNote:
      'Pour votre sécurité : nos coordonnées bancaires ne changent jamais par e-mail. En cas de ' +
      'doute sur ce message, contactez-nous avant d’effectuer le virement.',
  });
}

export function siteDeliveredEmail(
  ctx: BaseContext & {
    siteUrl: string | null;
    appUrl: string;
  },
): EmailMessage {
  const rows: Array<[string, string]> = [];
  if (ctx.siteUrl) rows.push(['Adresse de votre site', ctx.siteUrl]);

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

function quote(text: string): string {
  return `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #E1E4E7;
    color:#4B545C;white-space:pre-line;">${escapeHtml(text)}</blockquote>`;
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
