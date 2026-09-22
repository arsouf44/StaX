import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { FEATURE_PAGES } from '../../apps/platform/src/content/features';

/**
 * Ce que le site PROMET contre ce que la base ACCORDE.
 *
 * Les pages vitrines annoncent, pour chaque fonctionnalite, l'offre minimale
 * qui la comporte. La base, elle, tranche : `plan_features` decide ce qu'un
 * client obtient reellement. Quand les deux divergent, quelqu'un achete une
 * offre pour une fonctionnalite qu'elle ne contient pas, et la decouvre apres
 * paiement.
 *
 * Ce test a ete ecrit apres exactement ce defaut : l'encaissement en ligne et
 * la boutique etaient annonces en « Premium » alors que la base les reservait
 * a l'Ultra Premium — et le type declarait encore des offres disparues
 * (« classique », « signature »).
 *
 * Sans base configuree, il est SAUTE — jamais passe en silence.
 */

const DATABASE_URL = process.env.STAX_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

/** Fonctionnalite de catalogue correspondant a chaque page vitrine. */
const FEATURE_KEYS: Record<string, string> = {
  paiements: 'online_payments',
  ecommerce: 'ecommerce',
  reservations: 'bookings',
};

describeIfDb('promesses commerciales contre droits reellement accordes', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  /** Offres publiques, de la moins chere a la plus chere. */
  async function publicPlans(): Promise<Array<{ slug: string; setup: number }>> {
    const { rows } = await client.query<{ slug: string; setup_price_cents: number }>(
      `select slug, setup_price_cents from public.plans
        where is_active and is_public and not is_quote_only
        order by setup_price_cents asc`,
    );
    return rows.map((row) => ({ slug: row.slug, setup: row.setup_price_cents }));
  }

  it('n’annonce que des offres qui existent au catalogue', async () => {
    const plans = new Set((await publicPlans()).map((plan) => plan.slug));

    for (const page of FEATURE_PAGES) {
      if (page.requiredPlan === null) continue;
      expect(
        plans.has(page.requiredPlan),
        `/fonctionnalites/${page.slug} annonce l’offre « ${page.requiredPlan} », absente du catalogue.`,
      ).toBe(true);
    }
  });

  it('annonce l’offre la MOINS chere qui comporte réellement la fonctionnalité', async () => {
    const plans = await publicPlans();

    for (const page of FEATURE_PAGES) {
      const key = FEATURE_KEYS[page.slug];
      if (!key) continue;

      // La premiere offre, du moins cher au plus cher, qui accorde ce droit.
      let cheapest: string | null = null;
      for (const plan of plans) {
        const { rows } = await client.query<{ enabled: boolean }>(
          `select pf.enabled
             from public.plan_features pf
             join public.plans p on p.id = pf.plan_id
            where p.slug = $1 and p.is_active and pf.feature_key = $2`,
          [plan.slug, key],
        );
        if (rows[0]?.enabled === true) {
          cheapest = plan.slug;
          break;
        }
      }

      expect(
        page.requiredPlan,
        `/fonctionnalites/${page.slug} annonce « ${page.requiredPlan ?? 'incluse partout'} », ` +
          `mais la base accorde « ${key} » a partir de « ${cheapest ?? 'aucune offre'} ».`,
      ).toBe(cheapest);
    }
  });

  it('n’annonce « incluse partout » que si toutes les offres la comportent', async () => {
    const plans = await publicPlans();

    for (const page of FEATURE_PAGES) {
      const key = FEATURE_KEYS[page.slug];
      if (!key || page.requiredPlan !== null) continue;

      for (const plan of plans) {
        const { rows } = await client.query<{ enabled: boolean }>(
          `select pf.enabled
             from public.plan_features pf
             join public.plans p on p.id = pf.plan_id
            where p.slug = $1 and p.is_active and pf.feature_key = $2`,
          [plan.slug, key],
        );
        expect(
          rows[0]?.enabled,
          `/fonctionnalites/${page.slug} se dit incluse partout, mais « ${plan.slug} » ne ` +
            `comporte pas « ${key} ».`,
        ).toBe(true);
      }
    }
  });
});
