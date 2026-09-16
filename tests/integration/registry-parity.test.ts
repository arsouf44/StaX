import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { ORG_CAPABILITIES, ORG_ROLES } from '@stax/types';
import { ROLE_CAPABILITIES, listBusinesses, listSectors, MODULES } from '@stax/business';

/**
 * Le registre metier TypeScript et le catalogue PostgreSQL decrivent la meme
 * realite. S'ils divergent, l'interface propose des modules que la base refuse,
 * ou pire, un droit accorde cote client est refuse cote serveur sans message.
 */

const DATABASE_URL = process.env.STAX_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('coherence registre TypeScript / catalogue PostgreSQL', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('declare exactement les memes secteurs', async () => {
    const { rows } = await client.query('select slug from public.business_sectors order by slug');
    const sql = rows.map((r) => r.slug).sort();
    const ts = listSectors().map((s) => s.id).sort();
    expect(ts).toEqual(sql);
  });

  it('declare exactement les memes metiers', async () => {
    const { rows } = await client.query('select slug from public.business_types order by slug');
    const sql = rows.map((r) => r.slug).sort();
    const ts = listBusinesses().map((b) => b.id).sort();
    expect(ts).toEqual(sql);
  });

  it('rattache chaque metier au meme secteur des deux cotes', async () => {
    const { rows } = await client.query('select slug, sector_slug from public.business_types');
    const sql = new Map(rows.map((r) => [r.slug, r.sector_slug]));
    for (const business of listBusinesses()) {
      expect(`${business.id}:${business.sector}`).toBe(`${business.id}:${sql.get(business.id)}`);
    }
  });

  it('declare exactement les memes modules', async () => {
    const { rows } = await client.query('select slug from public.business_modules order by slug');
    const sql = rows.map((r) => r.slug).sort();
    const ts = Object.keys(MODULES).sort();
    expect(ts).toEqual(sql);
  });

  it('exige la meme fonctionnalite d’offre pour chaque module', async () => {
    const { rows } = await client.query(
      'select slug, required_feature from public.business_modules',
    );
    for (const row of rows) {
      const mod = MODULES[row.slug as keyof typeof MODULES];
      expect(`${row.slug}:${mod.requiredFeature ?? null}`).toBe(
        `${row.slug}:${row.required_feature ?? null}`,
      );
    }
  });

  it('n’expose que des cles de fonctionnalite existant en base', async () => {
    const { rows } = await client.query('select key from public.features');
    const known = new Set(rows.map((r) => r.key));
    for (const mod of Object.values(MODULES)) {
      if (mod.requiredFeature) expect(known.has(mod.requiredFeature)).toBe(true);
    }
  });

  it('applique la MEME matrice RBAC que app.org_can()', async () => {
    for (const role of ORG_ROLES) {
      for (const capability of ORG_CAPABILITIES) {
        const { rows } = await client.query(
          `select case $1::app.org_role
             when 'owner'   then $2 in (
               'org.view','org.manage','org.delete','members.manage','content.view','content.edit',
               'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
               'billing.view','billing.manage','analytics.view','domain.manage','media.manage',
               'payments.connect','data.export','support.manage')
             when 'admin'   then $2 in (
               'org.view','org.manage','members.manage','content.view','content.edit',
               'content.publish','inbox.view','inbox.manage','commerce.view','commerce.manage',
               'billing.view','analytics.view','domain.manage','media.manage','data.export',
               'support.manage')
             when 'editor'  then $2 in (
               'org.view','content.view','content.edit','content.publish','inbox.view',
               'inbox.manage','commerce.view','commerce.manage','analytics.view','media.manage',
               'support.manage')
             when 'billing' then $2 in (
               'org.view','billing.view','billing.manage','analytics.view','data.export')
             when 'viewer'  then $2 in (
               'org.view','content.view','inbox.view','commerce.view','analytics.view')
             else false
           end as allowed`,
          [role, capability],
        );
        const sqlAllowed: boolean = rows[0].allowed;
        const tsAllowed = ROLE_CAPABILITIES[role].includes(capability);
        expect(`${role}/${capability}=${tsAllowed}`).toBe(`${role}/${capability}=${sqlAllowed}`);
      }
    }
  });

  it('ne laisse aucun metier sans module', () => {
    for (const business of listBusinesses()) {
      expect(business.modules.length).toBeGreaterThan(0);
      expect(business.recommendedPages.length).toBeGreaterThan(0);
      expect(business.onboarding.length).toBeGreaterThan(0);
    }
  });

  it('ne reference que des modules connus', () => {
    const known = new Set(Object.keys(MODULES));
    for (const business of listBusinesses()) {
      for (const moduleId of business.modules) {
        expect(known.has(moduleId)).toBe(true);
      }
    }
  });
});
