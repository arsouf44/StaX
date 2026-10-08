import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { FEATURE_PAGES } from '../../apps/platform/src/content/features';

/**
 * Ce que le site PROMET contre ce que la base ACCORDE.
 *
 * Il n'y a plus d'offres publiques : chaque site commandé est rattaché à
 * l'offre interne `site-nemasus`, et c'est `plan_features` qui décide de ce
 * qu'un client obtient réellement. Une fonctionnalité présentée sur une page
 * vitrine doit donc être accordée par cette offre, sinon un client la
 * découvrirait absente après son virement.
 *
 * Sans base configurée, il est SAUTÉ — jamais passé en silence.
 */

const DATABASE_URL = process.env.NEMASUS_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

/** Fonctionnalité de catalogue correspondant à chaque page vitrine. */
const FEATURE_KEYS: Record<string, string> = {
  paiements: 'online_payments',
  ecommerce: 'ecommerce',
  reservations: 'bookings',
};

describeIfDb('promesses du site contre droits réellement accordés', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('aucune offre n’est publique : rien à acheter sur catalogue', async () => {
    const { rows } = await client.query<{ slug: string }>(
      `select slug from public.plans where is_active and is_public`,
    );
    expect(rows.map((row) => row.slug)).toEqual([]);
  });

  it('les sites commandés reçoivent l’offre interne site-nemasus', async () => {
    const { rows } = await client.query<{ id: string; is_public: boolean }>(
      `select p.id, p.is_public from public.plans p
        where p.slug = 'site-nemasus' and p.is_active`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_public).toBe(false);

    const { rows: defaults } = await client.query<{ id: string }>(
      `select app.default_site_plan_id() as id`,
    );
    expect(defaults[0]?.id).toBe(rows[0]?.id);
  });

  it('chaque fonctionnalité présentée est accordée aux sites commandés', async () => {
    for (const page of FEATURE_PAGES) {
      const key = FEATURE_KEYS[page.slug];
      if (!key) continue;
      const { rows } = await client.query<{ enabled: boolean }>(
        `select pf.enabled
           from public.plan_features pf
           join public.plans p on p.id = pf.plan_id
          where p.slug = 'site-nemasus' and p.is_active and pf.feature_key = $1`,
        [key],
      );
      expect(
        rows[0]?.enabled,
        `/fonctionnalites/${page.slug} présente « ${key} », que l’offre site-nemasus n’accorde pas.`,
      ).toBe(true);
    }
  });
});
