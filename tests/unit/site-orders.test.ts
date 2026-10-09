import { afterEach, describe, expect, it } from 'vitest';
import { bankTransferDetails, emailSettings, resetEnvCache } from '@nemasus/config';
import {
  accessCodeEmail,
  bankTransferInstructionsEmail,
  passwordResetEmail,
  siteOrderReceivedEmail,
} from '@nemasus/emails';
import { getEmailProvider, resetEmailProvider } from '@nemasus/emails';
import {
  accessCodeHint,
  accessCodeUrl,
  amountInputValue,
  generateAccessCode,
  hashAccessCode,
  normalizeAccessCode,
  parseAmountToCents,
} from '~/lib/site-orders';
import { ACCESS_MESSAGES } from '~/lib/access-code';

/**
 * Commande par virement et code d'accès : ce qui se vérifie sans base.
 * Le parcours complet (base, session, isolation) est couvert par
 * `tests/sql/rls.test.sql` et `tests/e2e/journeys/bank-transfer.spec.ts`.
 */

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
  resetEmailProvider();
});

describe('code d’accès', () => {
  it('compte 12 caractères lisibles, sans 0, O, 1, I ni L', () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it('se saisit avec ou sans tirets, en minuscules, avec des espaces', async () => {
    const code = '7K2M-9QXP-4HTA';
    expect(normalizeAccessCode(' 7k2m 9qxp 4hta ')).toBe(code);
    expect(await hashAccessCode('7k2m9qxp4hta')).toBe(await hashAccessCode(code));
    expect(accessCodeHint(code)).toBe('4HTA');
  });

  it('n’est jamais stocké en clair : l’empreinte est un HMAC de 64 caractères', async () => {
    const hash = await hashAccessCode('7K2M-9QXP-4HTA');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('7K2M');
  });

  it('un lien d’accès préremplit le code sans rien consommer', () => {
    expect(accessCodeUrl('7k2m9qxp4hta')).toMatch(/\/acces\?code=7K2M-9QXP-4HTA$/);
  });

  it('chaque refus a son message, sans révéler d’autre client', () => {
    expect(ACCESS_MESSAGES.invalid).toMatch(/pas reconnu/);
    expect(ACCESS_MESSAGES.expired).toMatch(/expiré/);
    expect(ACCESS_MESSAGES.revoked).toMatch(/désactivé/);
    expect(ACCESS_MESSAGES.already_used).toMatch(/déjà servi/);
    for (const message of Object.values(ACCESS_MESSAGES)) {
      expect(message).not.toMatch(/@/);
    }
  });
});

describe('montants saisis par l’équipe', () => {
  it('sont convertis en centimes entiers', () => {
    expect(parseAmountToCents('1250')).toBe(125_000);
    expect(parseAmountToCents('1 250,50 €')).toBe(125_050);
    expect(parseAmountToCents('1 250,5')).toBe(125_050);
    expect(parseAmountToCents('980.00')).toBe(98_000);
  });

  it('refusent ce qui n’est pas un montant positif', () => {
    for (const value of ['', '0', '-12', 'abc', '12,345', '1e5', '12..5']) {
      expect(parseAmountToCents(value)).toBeNull();
    }
  });

  it('se réaffichent sans séparateur, prêts à être corrigés', () => {
    expect(amountInputValue(125_000)).toBe('1250');
    expect(amountInputValue(125_050)).toBe('1250,50');
    expect(amountInputValue(null)).toBe('');
  });
});

describe('e-mails de la commande', () => {
  const bank = {
    holder: 'LallianSe',
    iban: 'FR76 3000 6000 0112 3456 7890 189',
    bic: 'AGRIFRPP',
    bank: null,
  };

  it('accusé de réception : la suite, sans aucun prix', () => {
    const email = siteOrderReceivedEmail({
      to: 'jeanne@boulangerie.example',
      firstName: 'Jeanne',
      reference: 'CMD-2026-00001',
      companyName: 'Boulangerie Martin',
    });
    expect(email.text).toContain('CMD-2026-00001');
    expect(email.text).toMatch(/modalités de paiement par virement/);
    expect(email.text).toMatch(/code d’accès personnel/);
    expect(email.html).not.toMatch(/€/);
  });

  it('modalités : montant convenu, IBAN, référence à rappeler, avertissement anti-fraude', () => {
    const email = bankTransferInstructionsEmail({
      to: 'jeanne@boulangerie.example',
      firstName: 'Jeanne',
      reference: 'CMD-2026-00001',
      companyName: 'Boulangerie Martin',
      amountLabel: '1 200 €',
      bank,
      message: 'Création du site et mise en ligne.',
      reminder: false,
    });
    expect(email.text).toContain('IBAN : FR76 3000 6000 0112 3456 7890 189');
    expect(email.text).toContain('Libellé du virement : CMD-2026-00001');
    expect(email.text).toContain('1 200 €');
    expect(email.html).toMatch(/ne changent jamais par e-mail/);
    // Le virement forme le contrat : l'e-mail renvoie aux CGV et à leur version.
    const withTerms = bankTransferInstructionsEmail({
      to: 'jeanne@boulangerie.example',
      reference: 'CMD-2026-00001',
      companyName: 'Boulangerie Martin',
      amountLabel: '1 200 €',
      bank,
      message: null,
      reminder: false,
      termsVersion: '2026-10-08',
    });
    expect(withTerms.text).toMatch(/valables trente jours/);
    expect(withTerms.text).toMatch(/vaut acceptation de nos conditions générales de vente/);
    expect(withTerms.text).toContain('version du 2026-10-08');
    expect(withTerms.text).toMatch(/\/cgv/);
    expect(withTerms.text).toMatch(/\/confidentialite/);
    // Le délai de réalisation figure par écrit, avant tout paiement (CGV, article 8).
    expect(withTerms.text).not.toMatch(/Délai de réalisation/);
    const withDelay = bankTransferInstructionsEmail({
      to: 'jeanne@boulangerie.example',
      reference: 'CMD-2026-00001',
      companyName: 'Boulangerie Martin',
      amountLabel: '1 200 €',
      bank,
      message: null,
      reminder: false,
      deliveryLabel: '1 à 3 semaines',
    });
    expect(withDelay.text).toContain(
      'Délai de réalisation : 1 à 3 semaines à compter de la réception de vos éléments',
    );
    expect(withDelay.text).not.toMatch(/sauf indication contraire/);
    const withMessage = bankTransferInstructionsEmail({
      to: 'jeanne@boulangerie.example',
      reference: 'CMD-2026-00001',
      companyName: 'Boulangerie Martin',
      amountLabel: '1 200 €',
      bank,
      message: 'Site de cinq pages, livré en quatre semaines.',
      reminder: false,
      deliveryLabel: '1 à 3 semaines',
    });
    expect(withMessage.text).toMatch(/sauf indication contraire ci-dessus/);
  });

  it('les champs saisis sont échappés dans le HTML', () => {
    const email = bankTransferInstructionsEmail({
      to: 'x@example.test',
      reference: 'CMD-2026-00002',
      companyName: '<script>alert(1)</script>',
      amountLabel: '10 €',
      bank,
      message: '<img src=x onerror=alert(1)>',
      reminder: true,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.subject.startsWith('Rappel')).toBe(true);
  });

  it('code d’accès : code en clair, lien, expiration, usage unique', () => {
    const email = accessCodeEmail({
      to: 'jeanne@boulangerie.example',
      code: '7K2M-9QXP-4HTA',
      companyName: 'Boulangerie Martin',
      orderReference: 'CMD-2026-00001',
      accessUrl: 'https://nemasus.fr/acces?code=7K2M-9QXP-4HTA',
      expiresLabel: '7 novembre 2026',
    });
    expect(email.text).toContain('7K2M-9QXP-4HTA');
    expect(email.text).toMatch(/usage unique/);
    expect(email.text).toContain('7 novembre 2026');
    expect(email.html).toContain('https://nemasus.fr/acces?code=7K2M-9QXP-4HTA');
  });

  it('réinitialisation : lien d’une heure, une seule fois', () => {
    const email = passwordResetEmail({
      to: 'jeanne@boulangerie.example',
      resetUrl: 'https://nemasus.fr/nouveau-mot-de-passe?jeton=abc',
      validForMinutes: 60,
    });
    expect(email.text).toMatch(/valable 1 heure/);
    expect(email.text).toMatch(/une seule fois/);
  });
});

describe('configuration Resend et virement', () => {
  it('RESEND_API_KEY suffit à activer Resend, côté serveur', () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_API_KEY;
    process.env.RESEND_API_KEY = 're_test_cle_factice_0000';
    resetEnvCache();
    resetEmailProvider();
    const settings = emailSettings();
    expect(settings.provider).toBe('resend');
    expect(settings.apiKey).toBe('re_test_cle_factice_0000');
    expect(getEmailProvider().name).toBe('resend');
  });

  it('sans clé, rien ne part (mode console)', () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_API_KEY;
    resetEnvCache();
    resetEmailProvider();
    expect(emailSettings().provider).toBe('console');
    expect(getEmailProvider().name).toBe('console');
  });

  it('les coordonnées bancaires viennent de la configuration, IBAN groupé par quatre', () => {
    delete process.env.BANK_TRANSFER_IBAN;
    resetEnvCache();
    expect(bankTransferDetails()).toBeNull();
    process.env.BANK_TRANSFER_HOLDER = 'LallianSe';
    process.env.BANK_TRANSFER_IBAN = 'fr7630006000011234567890189';
    process.env.BANK_TRANSFER_BIC = 'agrifrpp';
    resetEnvCache();
    expect(bankTransferDetails()).toEqual({
      holder: 'LallianSe',
      iban: 'FR76 3000 6000 0112 3456 7890 189',
      bic: 'AGRIFRPP',
      bank: null,
    });
  });
});

describe('textes juridiques, alignés sur le produit', () => {
  it('CGV : prix déterminé par le projet, validité des modalités, factures', async () => {
    const { buildTerms } = await import('~/content/legal');
    const cgv = JSON.stringify(buildTerms());
    expect(cgv).toContain('éléments de détermination du prix');
    expect(cgv).toContain('valables trente jours');
    expect(cgv).toContain('facture d’acompte');
    expect(cgv).toContain('payable en totalité avant le début de la réalisation');
    expect(cgv).toMatch(/accepte par son paiement/);
  });

  it('CGU et confidentialité : accès par code, commandes, messagerie de l’équipe', async () => {
    const { buildTermsOfUse, buildPrivacyPolicy } = await import('~/content/legal');
    const cgu = JSON.stringify(buildTermsOfUse());
    expect(cgu).toContain('première saisie du code');
    expect(cgu).toContain('pas d’inscription libre');
    const privacy = JSON.stringify(buildPrivacyPolicy());
    expect(privacy).toContain('Données de commande');
    expect(privacy).toContain('Infomaniak');
    expect(privacy).not.toMatch(/lors de leur inscription/);
  });
});
