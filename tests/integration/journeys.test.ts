import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * Parcours critiques, bout en bout, contre une vraie base.
 *
 * Ces parcours ne peuvent pas etre verifies par un test unitaire : ce qui peut
 * casser est justement ce qui se passe ENTRE les etapes — une commande payee
 * qui ne cree pas de site, un snapshot publie qui ne correspond pas au
 * brouillon, un nom d'hote qui sert le contenu du voisin.
 *
 * Ils s'executent a l'endroit ou vivent les regles : PostgreSQL. Les tester
 * depuis un navigateur prouverait que l'interface les appelle ; les tester ici
 * prouve qu'elles tiennent, y compris face a un appel que l'interface
 * n'emettrait jamais.
 *
 * Sans base configuree, ils sont SAUTES — jamais passes en silence.
 */

const DATABASE_URL = process.env.STAX_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('parcours critiques', () => {
  let db: Client;

  /** Identifiants du jeu de donnees, partages entre les etapes du parcours. */
  const ids = {
    user: '',
    org: '',
    plan: '',
    order: '',
    site: '',
    page: '',
    version: '',
    hostname: '',
    /** Identifiants Stripe uniques : la base les contraint a l'unicite. */
    intent: '',
    session: '',
    customer: '',
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();

    // Jeu de donnees isole du reste de la suite : un parcours ne doit pas
    // dependre de ce qu'un autre test a laisse derriere lui.
    const suffix = Math.random().toString(36).slice(2, 8);
    ids.hostname = `parcours-${suffix}.test`;
    ids.intent = `pi_parcours_${suffix}`;
    ids.session = `cs_parcours_${suffix}`;
    ids.customer = `cus_parcours_${suffix}`;

    const user = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`parcours-${suffix}@tenant.test`],
    );
    ids.user = user.rows[0]!.id;

    const org = await db.query<{ id: string }>(
      `insert into public.organizations (name, slug, created_by)
       values ($1, $2, $3) returning id`,
      [`Parcours ${suffix}`, `parcours-${suffix}`, ids.user],
    );
    ids.org = org.rows[0]!.id;

    const plan = await db.query<{ id: string }>(
      `select id from public.plans where slug = 'ultra-premium' and is_active limit 1`,
    );
    ids.plan = plan.rows[0]!.id;
  });

  afterAll(async () => {
    await db?.end();
  });

  /**
   * Execute une requete sous l'identite d'une personne connectee.
   *
   * Le passage en role `authenticated` est INDISPENSABLE : le proprietaire de
   * la base contourne la RLS, et un test qui l'oublie verifie l'inverse de ce
   * qu'il croit — il passerait precisement parce que l'isolation ne
   * s'applique pas.
   */
  async function asUser<T extends Record<string, unknown>>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ) {
    await db.query('begin');
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      await db.query('set local role authenticated');
      const result = await db.query<T>(sql, params);
      await db.query('commit');
      return result;
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  }

  it('1. commander : les montants sont figes par la base, pas par le navigateur', async () => {
    const created = await asUser<{ id: string }>(
      ids.user,
      `select app.create_order($1::uuid, $2::uuid, 'restauration', 'restaurant',
                               '{}'::jsonb, null, 'none', null, null, 'v1', null) as id`,
      [ids.org, ids.plan],
    );
    ids.order = created.rows[0]!.id;
    expect(ids.order).toBeTruthy();

    const order = await db.query<{
      status: string;
      total_cents: number;
      setup_price_cents: number;
      maintenance_price_cents: number;
      paid_at: string | null;
    }>(
      `select status, total_cents, setup_price_cents, maintenance_price_cents, paid_at
         from public.orders where id = $1`,
      [ids.order],
    );

    const row = order.rows[0]!;
    // Le tarif vient du catalogue : 1099 EUR de creation, 82 EUR de maintenance.
    expect(row.setup_price_cents).toBe(109_900);
    expect(row.maintenance_price_cents).toBe(8_200);
    expect(row.total_cents).toBeGreaterThan(0);

    // Une commande nait en attente. Aucun chemin ne la cree deja payee.
    expect(row.status).not.toBe('paid');
    expect(row.paid_at).toBeNull();
  });

  it('2. le client ne peut pas se declarer paye ni changer son prix', async () => {
    // La RLS ne leve pas d'exception sur un UPDATE : elle ne presente
    // simplement aucune ligne. Un refus se lit donc au nombre de lignes
    // touchees — attendre une exception ferait passer le test pour la
    // mauvaise raison.
    const claimPaid = await asUser(
      ids.user,
      `update public.orders set status = 'paid' where id = $1`,
      [ids.order],
    );
    expect(claimPaid.rowCount).toBe(0);

    const claimPrice = await asUser(
      ids.user,
      `update public.orders set total_cents = 1 where id = $1`,
      [ids.order],
    );
    expect(claimPrice.rowCount).toBe(0);

    const { rows } = await db.query<{ status: string; total_cents: number }>(
      `select status, total_cents from public.orders where id = $1`,
      [ids.order],
    );
    expect(rows[0]!.status).not.toBe('paid');
    expect(rows[0]!.total_cents).toBeGreaterThan(1);
  });

  it('3. payer : le webhook cree le site et le projet, une seule fois', async () => {
    await db.query(
      `select app.apply_order_paid($1::uuid, $2, $3, $4, 'ch_parcours', 'visa', '4242')`,
      [ids.order, ids.intent, ids.session, ids.customer],
    );

    const order = await db.query<{ status: string; paid_at: string | null }>(
      `select status, paid_at from public.orders where id = $1`,
      [ids.order],
    );
    expect(order.rows[0]!.status).toBe('paid');
    expect(order.rows[0]!.paid_at).not.toBeNull();

    const site = await db.query<{ id: string; status: string }>(
      `select id, status from public.sites where organization_id = $1`,
      [ids.org],
    );
    expect(site.rows).toHaveLength(1);
    ids.site = site.rows[0]!.id;

    const project = await db.query(`select 1 from public.projects where site_id = $1`, [ids.site]);
    expect(project.rows).toHaveLength(1);

    // Rejeu du meme evenement : rien ne doit doubler.
    await db.query(
      `select app.apply_order_paid($1::uuid, $2, $3, $4, 'ch_parcours', 'visa', '4242')`,
      [ids.order, ids.intent, ids.session, ids.customer],
    );
    const again = await db.query(`select 1 from public.sites where organization_id = $1`, [
      ids.org,
    ]);
    expect(again.rows).toHaveLength(1);

    const payments = await db.query(
      `select 1 from public.payments where stripe_payment_intent_id = $1`,
      [ids.intent],
    );
    expect(payments.rows).toHaveLength(1);
  });

  it('4. editer : le contenu est modifiable par le client, jamais par un autre', async () => {
    const page = await db.query<{ id: string }>(
      `insert into public.site_pages (site_id, path, title, kind, is_published)
       values ($1, '/', 'Accueil', 'home', true) returning id`,
      [ids.site],
    );
    ids.page = page.rows[0]!.id;

    await db.query(
      `insert into public.page_blocks (page_id, site_id, type, version, props, settings, sort_order)
       values ($1, $2, 'hero', 1,
               jsonb_build_object('title', 'Premiere version', 'subtitle', '', 'eyebrow', '',
                                  'media', null, 'actions', '[]'::jsonb, 'layout', 'centered',
                                  'highlights', '[]'::jsonb),
               '{}'::jsonb, 10)`,
      [ids.page, ids.site],
    );

    const edited = await asUser(
      ids.user,
      `update public.page_blocks set props = jsonb_set(props, '{title}', '"Titre edite"')
        where site_id = $1`,
      [ids.site],
    );
    expect(edited.rowCount).toBe(1);

    // Un inconnu ne voit rien et ne modifie rien : la RLS ne renvoie aucune ligne.
    const stranger = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`intrus-${Date.now()}@ailleurs.test`],
    );
    const intrusion = await asUser(
      stranger.rows[0]!.id,
      `update public.page_blocks set props = jsonb_set(props, '{title}', '"Pirate"')
        where site_id = $1`,
      [ids.site],
    );
    expect(intrusion.rowCount).toBe(0);
  });

  it('5. publier : le snapshot fige le brouillon du moment', async () => {
    // Un site ne saute pas de « brouillon » a « en ligne » : il passe par la
    // construction, la relecture du client, puis la validation. Le declencheur
    // `app.guard_site_status` impose ce chemin, et ce test le parcourt comme
    // le ferait une vraie livraison.
    for (const status of ['building', 'review', 'ready']) {
      await db.query(`update public.sites set status = $2 where id = $1`, [ids.site, status]);
    }

    const published = await asUser<{ id: string }>(
      ids.user,
      `select app.publish_site($1::uuid, 'Mise en ligne initiale') as id`,
      [ids.site],
    );
    ids.version = published.rows[0]!.id;

    const version = await db.query<{ snapshot: Record<string, unknown> }>(
      `select snapshot from public.site_versions where id = $1`,
      [ids.version],
    );
    expect(JSON.stringify(version.rows[0]!.snapshot)).toContain('Titre edite');

    const site = await db.query<{ status: string; published_version_id: string }>(
      `select status, published_version_id from public.sites where id = $1`,
      [ids.site],
    );
    expect(site.rows[0]!.status).toBe('live');
    expect(site.rows[0]!.published_version_id).toBe(ids.version);
  });

  it('6. le brouillon evolue sans toucher a ce qui est en ligne', async () => {
    await asUser(
      ids.user,
      `update public.page_blocks set props = jsonb_set(props, '{title}', '"Brouillon suivant"')
        where site_id = $1`,
      [ids.site],
    );

    const online = await db.query<{ snapshot: Record<string, unknown> }>(
      `select v.snapshot from public.sites s
         join public.site_versions v on v.id = s.published_version_id
        where s.id = $1`,
      [ids.site],
    );
    const json = JSON.stringify(online.rows[0]!.snapshot);
    expect(json).toContain('Titre edite');
    expect(json).not.toContain('Brouillon suivant');
  });

  it('7. republier puis revenir en arriere remet le contenu precedent en ligne', async () => {
    const second = await asUser<{ id: string }>(
      ids.user,
      `select app.publish_site($1::uuid, 'Deuxieme version') as id`,
      [ids.site],
    );
    const secondId = second.rows[0]!.id;

    let online = await db.query<{ snapshot: Record<string, unknown> }>(
      `select v.snapshot from public.sites s
         join public.site_versions v on v.id = s.published_version_id where s.id = $1`,
      [ids.site],
    );
    expect(JSON.stringify(online.rows[0]!.snapshot)).toContain('Brouillon suivant');

    const restored = await asUser<{ id: string }>(
      ids.user,
      `select app.rollback_site($1::uuid, $2::uuid) as id`,
      [ids.site, ids.version],
    );

    // Le retour cree une NOUVELLE version : l'historique ne perd jamais d'etat.
    expect(restored.rows[0]!.id).not.toBe(ids.version);
    expect(restored.rows[0]!.id).not.toBe(secondId);

    online = await db.query<{ snapshot: Record<string, unknown> }>(
      `select v.snapshot from public.sites s
         join public.site_versions v on v.id = s.published_version_id where s.id = $1`,
      [ids.site],
    );
    expect(JSON.stringify(online.rows[0]!.snapshot)).toContain('Titre edite');

    // Le brouillon, lui, n'a pas bouge : c'est ce que l'interface annonce.
    const draft = await db.query<{ props: { title: string } }>(
      `select props from public.page_blocks where site_id = $1`,
      [ids.site],
    );
    expect(draft.rows[0]!.props.title).toBe('Brouillon suivant');
  });

  it('8. servir : le nom d’hote resout le bon tenant, et lui seul', async () => {
    await db.query(
      `insert into public.site_domains (site_id, organization_id, hostname, kind, status, is_primary)
       values ($1, $2, $3, 'custom', 'active', true)`,
      [ids.site, ids.org, ids.hostname],
    );

    const resolved = await db.query<{ site_id: string; snapshot: Record<string, unknown> }>(
      `select site_id, snapshot from app.resolve_published_site($1)`,
      [ids.hostname],
    );
    expect(resolved.rows[0]!.site_id).toBe(ids.site);
    expect(JSON.stringify(resolved.rows[0]!.snapshot)).toContain('Titre edite');

    // Un hostname inconnu ne renvoie RIEN — jamais un site par defaut.
    const unknown = await db.query(`select site_id from app.resolve_published_site($1)`, [
      'jamais-vu-nulle-part.test',
    ]);
    expect(unknown.rows).toHaveLength(0);
  });

  it('9. un formulaire public depose dans le bon tenant', async () => {
    await db.query(
      `insert into public.forms (site_id, organization_id, slug, name, kind)
       values ($1, $2, 'contact', 'Contact', 'contact')`,
      [ids.site, ids.org],
    );

    const result = await db.query<{ submit_form: { ok: boolean } }>(
      `select app.submit_form($1::uuid, 'contact',
                              jsonb_build_object('message', 'Bonjour', 'email', 'v@exemple.test'),
                              0, null, null, null, 'fr') as submit_form`,
      [ids.site],
    );
    expect(result.rows[0]!.submit_form.ok).toBe(true);

    const stored = await db.query<{ site_id: string; organization_id: string }>(
      `select site_id, organization_id from public.form_submissions where site_id = $1`,
      [ids.site],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.organization_id).toBe(ids.org);

    // Le slug d'un formulaire d'un autre site ne remonte jamais : la fonction
    // repond « introuvable », exactement comme pour un site inexistant. Une
    // reponse differente permettrait de deviner ce qui existe ailleurs.
    await expect(
      db.query(
        `select app.submit_form($1::uuid, 'contact', '{"message":"x"}'::jsonb,
                                0, null, null, null, 'fr')`,
        ['00000000-0000-0000-0000-000000000000'],
      ),
    ).rejects.toThrow(/introuvable/i);
  });

  it('11. reserver : la capacite du creneau fait loi', async () => {
    const service = await db.query<{ id: string }>(
      `insert into public.booking_services
         (site_id, organization_id, name, duration_minutes, capacity_per_slot,
          lead_time_hours, horizon_days, is_active)
       values ($1, $2, 'Table', 60, 2, 0, 60, true) returning id`,
      [ids.site, ids.org],
    );
    const serviceId = service.rows[0]!.id;
    const slot = new Date(Date.now() + 3 * 86_400_000).toISOString();

    const first = await db.query<{ create_booking: { ok: boolean } }>(
      `select app.create_booking($1::uuid, $2::uuid, $3::timestamptz, 2,
                                 'Premier', 'premier@exemple.test', null, null, null)
              as create_booking`,
      [ids.site, serviceId, slot],
    );
    expect(first.rows[0]!.create_booking.ok).toBe(true);

    // Le creneau est plein : la deuxieme demande est refusee, pas mise en
    // attente silencieuse. Une double reservation coute une table au client.
    const second = await db.query<{ create_booking: { ok: boolean; code?: string } }>(
      `select app.create_booking($1::uuid, $2::uuid, $3::timestamptz, 1,
                                 'Second', 'second@exemple.test', null, null, null)
              as create_booking`,
      [ids.site, serviceId, slot],
    );
    expect(second.rows[0]!.create_booking.ok).toBe(false);
    expect(second.rows[0]!.create_booking.code).toBe('slot_full');
  });

  it('12. activer : un code d’activation ne sert qu’une fois', async () => {
    const hash = `hash-parcours-${Math.random().toString(36).slice(2, 10)}`;
    const email = `active-${Math.random().toString(36).slice(2, 8)}@tenant.test`;

    await db.query(
      `insert into public.activation_codes
         (site_id, organization_id, code_hash, code_hint, granted_role,
          email_constraint, expires_at)
       values ($1, $2, $3, 'ABCD', 'owner', $4, now() + interval '14 days')`,
      [ids.site, ids.org, hash, email],
    );

    const newcomer = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    );
    const newcomerId = newcomer.rows[0]!.id;

    const first = await db.query<{ ok: boolean; reason: string }>(
      `select * from app.redeem_activation_code($1, $2::uuid, $3)`,
      [hash, newcomerId, email],
    );
    expect(first.rows[0]!.ok).toBe(true);

    const membership = await db.query(
      `select 1 from public.organization_members where organization_id = $1 and user_id = $2`,
      [ids.org, newcomerId],
    );
    expect(membership.rows).toHaveLength(1);

    // Rejeu : un code consomme ne rouvre pas l'acces.
    const replay = await db.query<{ ok: boolean; reason: string }>(
      `select * from app.redeem_activation_code($1, $2::uuid, $3)`,
      [hash, newcomerId, email],
    );
    expect(replay.rows[0]!.ok).toBe(false);
    expect(replay.rows[0]!.reason).toBe('already_used');

    // Le code est lie a une adresse : une autre personne ne s'en sert pas.
    const otherHash = `hash-parcours-${Math.random().toString(36).slice(2, 10)}`;
    await db.query(
      `insert into public.activation_codes
         (site_id, organization_id, code_hash, code_hint, granted_role,
          email_constraint, expires_at)
       values ($1, $2, $3, 'EFGH', 'editor', $4, now() + interval '14 days')`,
      [ids.site, ids.org, otherHash, email],
    );
    const intruder = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`intrus-${Math.random().toString(36).slice(2, 8)}@ailleurs.test`],
    );
    const stolen = await db.query<{ ok: boolean; reason: string }>(
      `select * from app.redeem_activation_code($1, $2::uuid, $3)`,
      [otherHash, intruder.rows[0]!.id, 'quelquun-dautre@ailleurs.test'],
    );
    expect(stolen.rows[0]!.ok).toBe(false);
    expect(stolen.rows[0]!.reason).toBe('email_mismatch');
  });

  it('10. suspendre coupe l’acces public sans rien supprimer', async () => {
    await db.query(`update public.sites set status = 'suspended' where id = $1`, [ids.site]);

    const resolved = await db.query<{ site_status: string }>(
      `select site_status from app.resolve_published_site($1)`,
      [ids.hostname],
    );
    // La resolution renvoie l'etat : c'est le Worker qui refuse de servir.
    expect(resolved.rows[0]?.site_status).toBe('suspended');

    // Rien n'a disparu : le contenu et les messages sont intacts.
    const blocks = await db.query(`select 1 from public.page_blocks where site_id = $1`, [
      ids.site,
    ]);
    expect(blocks.rows.length).toBeGreaterThan(0);
    const messages = await db.query(`select 1 from public.form_submissions where site_id = $1`, [
      ids.site,
    ]);
    expect(messages.rows.length).toBeGreaterThan(0);

    await db.query(`update public.sites set status = 'live' where id = $1`, [ids.site]);
  });
});
