import { describe, expect, it } from 'vitest';
import { hashActivationCode } from '@stax/security';
import { siteProposalEmail, teamReplyEmail } from '@stax/emails';
import {
  generateProposalCode,
  hashProposalCode,
  normalizeProposalCode,
  proposalClaimUrl,
  proposalCodeHint,
  proposalMaintenanceLabel,
  proposalPriceLabel,
} from '~/lib/proposals';

/**
 * Propositions de site (vente par téléphone).
 *
 * Le code est la seule chose que le prospect ait à recopier, parfois dictée
 * au téléphone : il doit être lisible, tolérant à la saisie, et ne jamais
 * pouvoir servir de code d'activation (empreintes séparées).
 */

describe('code de proposition', () => {
  it('compte 12 caractères lisibles, en trois groupes', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateProposalCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // Aucun caractère ambigu à l'oral ou à l'écrit : 0/O, 1/I/L.
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('se saisit avec ou sans tirets, en minuscules, avec des espaces', async () => {
    const code = generateProposalCode();
    const typed = ` ${code.toLowerCase().replace(/-/g, ' ')} `;
    expect(normalizeProposalCode(typed)).toBe(code);
    expect(await hashProposalCode(typed)).toBe(await hashProposalCode(code));
  });

  it('a une empreinte distincte de celle d’un code d’activation', async () => {
    const code = generateProposalCode();
    expect(await hashProposalCode(code)).not.toBe(await hashActivationCode(code));
    expect(await hashProposalCode(code)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ne garde que 4 caractères comme indice', () => {
    expect(proposalCodeHint('7K2M-9QXP-4HTA')).toBe('4HTA');
  });

  it('préremplit le lien « Récupérer mon site » sans rien exposer d’autre', () => {
    const url = new URL(proposalClaimUrl('7K2M-9QXP-4HTA', 'marie@boulangerie.fr'));
    expect(url.pathname).toBe('/recuperer');
    expect(url.searchParams.get('code')).toBe('7K2M-9QXP-4HTA');
    expect(url.searchParams.get('email')).toBe('marie@boulangerie.fr');
  });
});

describe('prix affichés au prospect', () => {
  const premium = {
    setup_price_cents: 55_000,
    total_cents: 66_000,
    maintenance_price_cents: 1_400,
    billing_interval: 'month',
    currency: 'EUR',
  };

  it('annonce la création en HT et en TTC', () => {
    const label = proposalPriceLabel(premium).replace(/\s/g, ' ');
    expect(label).toContain('550 € HT');
    expect(label).toContain('660 € TTC');
  });

  it('annonce la maintenance au mois, hors taxes', () => {
    expect(proposalMaintenanceLabel(premium)?.replace(/\s/g, ' ')).toBe('14 € / mois HT');
  });

  it('n’annonce aucune maintenance quand il n’y en a pas', () => {
    expect(proposalMaintenanceLabel({ ...premium, maintenance_price_cents: 0 })).toBeNull();
  });
});

describe('e-mails', () => {
  it('la proposition porte le lien, le code et un seul bouton d’action', () => {
    const message = siteProposalEmail({
      to: 'marie@boulangerie.fr',
      firstName: 'Marie',
      companyName: 'Boulangerie <Martin>',
      siteUrl: 'https://boulangerie-martin.pages.dev',
      claimUrl: 'https://stax.example/recuperer?code=7K2M-9QXP-4HTA',
      code: '7K2M-9QXP-4HTA',
      planName: 'Premium',
      priceLabel: '550 € HT (660 € TTC)',
      maintenanceLabel: '14 € / mois HT',
      expiresLabel: '10 octobre 2026',
      message: 'Ravi de notre échange <script>alert(1)</script>',
    });
    expect(message.subject).toContain('Boulangerie <Martin>');
    expect(message.text).toContain('7K2M-9QXP-4HTA');
    expect(message.text).toContain('https://boulangerie-martin.pages.dev');
    expect(message.html).toContain('Récupérer mon site');
    // Tout ce qui vient d'une saisie est échappé.
    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('<Martin>');
  });

  it('la réponse de l’équipe échappe le message', () => {
    const message = teamReplyEmail({
      to: 'marie@boulangerie.fr',
      excerpt: '<img src=x onerror=alert(1)>',
      conversationUrl: 'https://stax.example/app/discussion',
    });
    expect(message.html).not.toContain('<img');
  });
});
