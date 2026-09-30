import { describe, expect, it } from 'vitest';
import { monthOverMonth, siteMonthlyReportEmail } from '@nemasus/emails';
import { figuresFrom, reportMonth } from '~/lib/monthly-report';

/**
 * Bilan mensuel envoyé aux clients : le bon mois, à la bonne heure, sans
 * chiffre inventé (pas de variation sans mois précédent mesuré, pas de
 * disponibilité sans vérification).
 */

describe('mois couvert et heure d’envoi', () => {
  it('couvre le mois écoulé et attend 8 h (heure de Paris) le 1er', () => {
    // 1er octobre 2026, 5 h 30 UTC = 7 h 30 à Paris : trop tôt.
    expect(reportMonth(new Date('2026-10-01T05:30:00Z'))).toEqual({
      month: '2026-09-01',
      ready: false,
    });
    // 6 h 05 UTC = 8 h 05 à Paris.
    expect(reportMonth(new Date('2026-10-01T06:05:00Z')).ready).toBe(true);
    // Le reste du mois, un bilan en retard part toujours.
    expect(reportMonth(new Date('2026-10-17T12:00:00Z'))).toEqual({
      month: '2026-09-01',
      ready: true,
    });
    // Janvier couvre décembre de l'année précédente.
    expect(reportMonth(new Date('2027-01-02T10:00:00Z')).month).toBe('2026-12-01');
  });
});

const PAYLOAD = {
  siteId: 's',
  siteName: 'Boulangerie Martin',
  month: '2026-09-01',
  current: { visitors: 1240, pageviews: 3100, contacts: 18, orders: 0, revenueCents: 0, days: 30 },
  previous: { visitors: 0, contacts: 0, days: 0 },
  health: { checks: 0, uptimeBps: null, avgResponseMs: null },
  quality: { score: 30, maxScore: 34 },
  topPages: [{ path: '/', views: 1800 }],
  topSources: [{ source: 'google.fr', visits: 600 }],
  recipients: [{ email: 'jeanne@boulangerie.example', firstName: 'Jeanne' }],
};

describe('contenu du bilan', () => {
  it('n’invente ni variation ni disponibilité', () => {
    const figures = figuresFrom(PAYLOAD);
    expect(figures.previousVisitors).toBeNull();
    expect(figures.uptimeBps).toBeNull();
    expect(figures.qualityScore).toBe(88);
    const email = siteMonthlyReportEmail({
      to: 'jeanne@boulangerie.example',
      firstName: 'Jeanne',
      figures,
      appUrl: 'https://nemasus.example/app/statistiques',
      preferencesUrl: 'https://nemasus.example/app/compte',
    });
    expect(email.subject).toBe('Boulangerie Martin : votre bilan de septembre 2026');
    expect(email.text).toMatch(/Visiteurs : 1\s240/u);
    expect(email.text).not.toContain('par rapport au mois précédent');
    expect(email.text).not.toContain('Disponibilité');
    expect(email.text).toContain('Bilan qualité : 88 / 100');
    expect(email.html).toContain('https://nemasus.example/app/compte');
  });

  it('compare au mois précédent quand il a été mesuré', () => {
    const figures = figuresFrom({
      ...PAYLOAD,
      previous: { visitors: 1000, contacts: 20, days: 30 },
      health: { checks: 4320, uptimeBps: 9995, avgResponseMs: 212 },
    });
    expect(figures.previousVisitors).toBe(1000);
    expect(monthOverMonth(1240, 1000)).toBe('+24 % par rapport au mois précédent');
    expect(monthOverMonth(18, 20)).toBe('−10 % par rapport au mois précédent');
    expect(monthOverMonth(20, 20)).toBe('stable');
    expect(monthOverMonth(5, null)).toBeNull();
    const email = siteMonthlyReportEmail({
      to: 'jeanne@boulangerie.example',
      figures,
      appUrl: 'https://nemasus.example/app/statistiques',
      preferencesUrl: 'https://nemasus.example/app/compte',
    });
    expect(email.text).toContain('Disponibilité : 99,95 %');
    expect(email.text).toContain('+24 %');
  });

  it('échappe le nom du site dans le HTML', () => {
    const email = siteMonthlyReportEmail({
      to: 'x@example.com',
      figures: figuresFrom({ ...PAYLOAD, siteName: '<script>alert(1)</script>' }),
      appUrl: 'https://nemasus.example/app',
      preferencesUrl: 'https://nemasus.example/app/compte',
    });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});
