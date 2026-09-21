import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { computeOrderPricing, type PricingPlanInput } from '@stax/payments';

/**
 * Parite SQL / TypeScript.
 *
 * Le calcul tarifaire existe a deux endroits : dans PostgreSQL
 * (app.compute_order_pricing, qui fait foi au moment de la commande) et en
 * TypeScript (affichage, simulation, tests). S'ils divergaient ne serait-ce
 * que d'un centime, le client verrait un montant different de celui debite.
 * Ce test compare les deux implementations sur tout le catalogue.
 */

const DATABASE_URL = process.env.STAX_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('parite du calcul tarifaire SQL / TypeScript', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function sqlPricing(planId: string, coupon: string | null) {
    const { rows } = await client.query(
      'select * from app.compute_order_pricing($1::uuid, $2::text)',
      [planId, coupon],
    );
    return rows[0] as {
      setup_cents: number;
      maintenance_cents: number;
      discount_cents: number;
      vat_cents: number;
      total_cents: number;
      vat_rate_bps: number;
      currency: string;
    };
  }

  async function plans(): Promise<Array<PricingPlanInput & { id: string }>> {
    const { rows } = await client.query(
      `select id, slug, setup_price_cents, maintenance_price_cents, billing_interval,
              vat_rate_bps, prices_include_vat, currency, is_quote_only
         from public.plans where is_active and not is_quote_only order by sort_order`,
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      setupPriceCents: r.setup_price_cents,
      maintenancePriceCents: r.maintenance_price_cents,
      billingInterval: r.billing_interval,
      vatRateBps: r.vat_rate_bps,
      pricesIncludeVat: r.prices_include_vat,
      currency: r.currency,
      isQuoteOnly: r.is_quote_only,
    }));
  }

  it('donne exactement le meme centime pour chaque offre du catalogue', async () => {
    const all = await plans();
    expect(all.length).toBeGreaterThanOrEqual(3);

    for (const plan of all) {
      const sql = await sqlPricing(plan.id, null);
      const ts = computeOrderPricing(plan);
      expect({ plan: plan.slug, ...pick(ts) }).toEqual({
        plan: plan.slug,
        setupCents: sql.setup_cents,
        maintenanceCents: sql.maintenance_cents,
        discountCents: sql.discount_cents,
        vatCents: sql.vat_cents,
        totalCents: sql.total_cents,
      });
    }
  });

  it('donne le meme centime avec un code promotionnel', async () => {
    await client.query(
      `insert into public.coupons (code, kind, value, applies_to)
       values ('PARITE15', 'percent', 1500, 'setup')
       on conflict do nothing`,
    );
    const all = await plans();
    for (const plan of all) {
      const sql = await sqlPricing(plan.id, 'PARITE15');
      const ts = computeOrderPricing(plan, {
        code: 'PARITE15',
        kind: 'percent',
        value: 1500,
        appliesTo: 'setup',
      });
      expect(pick(ts)).toEqual({
        setupCents: sql.setup_cents,
        maintenanceCents: sql.maintenance_cents,
        discountCents: sql.discount_cents,
        vatCents: sql.vat_cents,
        totalCents: sql.total_cents,
      });
    }
  });

  it('applique la meme troncature que PostgreSQL sur des montants non ronds', async () => {
    const { rows } = await client.query(
      `insert into public.plans
         (slug, version, name, setup_price_cents, maintenance_price_cents, vat_rate_bps, is_public)
       values ('parite-troncature', 99, 'Parite', 33333, 777, 2000, false)
       returning id, slug, setup_price_cents, maintenance_price_cents, vat_rate_bps,
                 prices_include_vat, currency, is_quote_only`,
    );
    const row = rows[0];
    const plan: PricingPlanInput = {
      slug: row.slug,
      setupPriceCents: row.setup_price_cents,
      maintenancePriceCents: row.maintenance_price_cents,
      vatRateBps: row.vat_rate_bps,
      pricesIncludeVat: row.prices_include_vat,
      currency: row.currency,
      isQuoteOnly: row.is_quote_only,
    };
    const sql = await sqlPricing(row.id, null);
    const ts = computeOrderPricing(plan);
    expect(ts.vatCents).toBe(sql.vat_cents);
    expect(ts.totalCents).toBe(sql.total_cents);
    await client.query('delete from public.plans where id = $1', [row.id]);
  });
});

function pick(p: ReturnType<typeof computeOrderPricing>) {
  return {
    setupCents: p.setupCents,
    maintenanceCents: p.maintenanceCents,
    discountCents: p.discountCents,
    vatCents: p.vatCents,
    totalCents: p.totalCents,
  };
}
