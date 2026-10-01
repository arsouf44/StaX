import { describe, expect, it } from 'vitest';
import { siteActivityEmails, type SiteActivityItem } from '@nemasus/emails';

/**
 * Le commerçant est prévenu de ce qui arrive par son site (migration 0065).
 * Audit du 2026-10-01 : ces e-mails existaient en modèle, mais rien ne les
 * envoyait. On vérifie ici ce qu'il reçoit : de quoi agir sans se connecter,
 * et « Répondre » qui écrit directement au visiteur.
 */

const base = {
  id: '00000000-0000-0000-0000-000000000001',
  happenedAt: '2026-10-01T08:00:00Z',
  siteId: '00000000-0000-0000-0000-000000000002',
  siteName: 'Boulangerie Martin',
  organizationId: '00000000-0000-0000-0000-000000000003',
  timezone: 'Europe/Paris',
  recipients: ['marie@exemple.test', 'paul@exemple.test'],
} satisfies Omit<SiteActivityItem, 'kind' | 'detail'>;

describe('notifications au commerçant', () => {
  it('un message : extrait, nom du visiteur, réponse directe', () => {
    const emails = siteActivityEmails(
      {
        ...base,
        kind: 'message',
        detail: {
          senderName: 'Jeanne Petit',
          excerpt: 'Faites-vous des pains sans gluten ?',
          formName: 'Contact',
          replyTo: 'Jeanne@Exemple.test',
        },
      },
      'https://app.nemasus.fr/',
    );
    expect(emails.map((email) => email.to)).toEqual(base.recipients);
    const [first] = emails;
    expect(first?.subject).toBe('Nouveau message de Jeanne Petit — Boulangerie Martin');
    expect(first?.replyTo).toBe('jeanne@exemple.test');
    expect(first?.text).toContain('Faites-vous des pains sans gluten ?');
    expect(first?.text).toContain('Répondez directement à cet e-mail');
    expect(first?.html).toContain('https://app.nemasus.fr/app/messages');
  });

  it('un message sans adresse du visiteur ne promet pas de réponse directe', () => {
    const [email] = siteActivityEmails(
      {
        ...base,
        kind: 'message',
        detail: { senderName: 'Un visiteur', excerpt: 'Bonjour', replyTo: 'pas une adresse' },
      },
      'https://app.nemasus.fr',
    );
    expect(email?.replyTo).not.toBe('pas une adresse');
    expect(email?.text).not.toContain('Répondez directement');
  });

  it('une demande de réservation : date à l’heure du site, accord du nombre', () => {
    const [email] = siteActivityEmails(
      {
        ...base,
        kind: 'booking',
        detail: {
          customerName: 'Paul Durand',
          startsAt: '2026-10-03T17:30:00Z',
          partySize: 1,
          needsAnswer: true,
          serviceName: 'Atelier pain',
        },
      },
      'https://app.nemasus.fr',
    );
    expect(email?.subject).toMatch(/^Demande de réservation — samedi 3 octobre 2026 à 19:30$/u);
    expect(email?.text).toContain('1 personne.');
    expect(email?.text).not.toMatch(/personne\(s\)/);
    expect(email?.html).toContain('https://app.nemasus.fr/app/reservations');
  });

  it('une commande payée : montant en euros, lien vers les commandes', () => {
    const [email] = siteActivityEmails(
      {
        ...base,
        kind: 'order',
        detail: {
          customerName: 'Léa',
          reference: 'CMD-42',
          totalCents: 2450,
          replyTo: 'lea@exemple.test',
        },
      },
      'https://app.nemasus.fr',
    );
    expect(email?.subject).toBe('Nouvelle commande payée — CMD-42');
    expect(email?.text).toMatch(/24,50\s€/u);
    expect(email?.replyTo).toBe('lea@exemple.test');
    expect(email?.html).toContain('https://app.nemasus.fr/app/commandes');
  });
});
