import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * Parcours critiques, bout en bout, contre une vraie base.
 *
 *   COMMANDE -> PAIEMENT -> CONSTRUCTION HORS DE STAX -> DEPOT GITHUB ->
 *   PROJET CLOUDFLARE -> VERIFICATIONS -> LIVRAISON -> BROUILLON DU CLIENT ->
 *   PUBLIER -> COMMIT GITHUB -> DEPLOIEMENT CLOUDFLARE -> EN LIGNE
 *
 * Ces parcours ne peuvent pas etre verifies par un test unitaire : ce qui peut
 * casser est justement ce qui se passe ENTRE les etapes — une commande payee
 * qui ne cree pas de projet, un client qui edite avant la livraison, une
 * version annoncee « publiee » alors que le deploiement a echoue, une
 * maintenance prelevee avant que le site existe.
 *
 * Ils s'executent la ou vivent les regles : PostgreSQL. Les appels « serveur »
 * (webhooks GitHub et Cloudflare, tache de fond) passent par la connexion de
 * service ; les appels du client et de l'equipe, sous leur identite, avec la
 * RLS active.
 *
 * Sans base configuree, ils sont SAUTES — jamais passes en silence.
 */

const DATABASE_URL = process.env.STAX_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

type Json = Record<string, unknown>;

describeIfDb('parcours critiques', () => {
  let db: Client;

  /** Identifiants du jeu de donnees, partages entre les etapes du parcours. */
  const ids = {
    user: '',
    staff: '',
    stranger: '',
    org: '',
    plan: '',
    order: '',
    site: '',
    publicKey: '',
    manifest: '',
    hosting: '',
    v1: '',
    v2: '',
    /** Identifiants externes uniques : la base les contraint a l'unicite. */
    suffix: '',
    installation: 0,
    githubAccount: 0,
    repository: 0,
    intent: '',
    session: '',
    customer: '',
  };

  const sha = (digit: string) => digit.repeat(40);
  const account = 'ab'.repeat(16);

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();

    // Jeu de donnees isole du reste de la suite : un parcours ne doit pas
    // dependre de ce qu'un autre test a laisse derriere lui.
    ids.suffix = Math.random().toString(36).slice(2, 8);
    const seed = Math.floor(Math.random() * 1_000_000);
    ids.installation = 700_000_000 + seed;
    ids.githubAccount = 800_000_000 + seed;
    ids.repository = 900_000_000 + seed;
    ids.intent = `pi_parcours_${ids.suffix}`;
    ids.session = `cs_parcours_${ids.suffix}`;
    ids.customer = `cus_parcours_${ids.suffix}`;

    const newUser = async (email: string) =>
      (
        await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [
          email,
        ])
      ).rows[0]!.id;

    ids.user = await newUser(`parcours-${ids.suffix}@client.test`);
    ids.staff = await newUser(`equipe-${ids.suffix}@stax.test`);
    ids.stranger = await newUser(`intrus-${ids.suffix}@ailleurs.test`);
    await db.query(`update public.profiles set platform_role = 'platform_admin' where id = $1`, [
      ids.staff,
    ]);

    const org = await db.query<{ id: string }>(
      `insert into public.organizations (name, slug, created_by)
       values ($1, $2, $3) returning id`,
      [`Parcours ${ids.suffix}`, `parcours-${ids.suffix}`, ids.user],
    );
    ids.org = org.rows[0]!.id;

    const plan = await db.query<{ id: string }>(
      `select id from public.plans where slug = 'premium' and is_active and valid_until is null`,
    );
    ids.plan = plan.rows[0]!.id;

    // L'application GitHub StaX est installee sur le compte des depots.
    await db.query(
      `select public.upsert_github_installation($1, $2, $3, 'Organization', 'selected', false)`,
      [ids.installation, `stax-sites-${ids.suffix}`, ids.githubAccount],
    );
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
  async function asUser<T extends Json>(userId: string, sql: string, params: unknown[] = []) {
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

  /** Appel d'une fonction renvoyant du JSON, sous une identite donnee. */
  async function callAs(userId: string, sql: string, params: unknown[] = []): Promise<Json> {
    const { rows } = await asUser<{ result: Json }>(userId, `select ${sql} as result`, params);
    return rows[0]!.result;
  }

  /** Appel du serveur (webhooks, tache de fond) : connexion de service. */
  async function callAsServer(sql: string, params: unknown[] = []): Promise<Json> {
    const { rows } = await db.query<{ result: Json }>(`select ${sql} as result`, params);
    return rows[0]!.result;
  }

  async function draftRevision(): Promise<number> {
    const { rows } = await db.query<{ revision: number }>(
      `select revision from public.site_content_drafts where site_id = $1`,
      [ids.site],
    );
    return rows[0]!.revision;
  }

  async function production(): Promise<string | null> {
    const { rows } = await db.query<{ production_release_id: string | null }>(
      `select production_release_id from public.sites where id = $1`,
      [ids.site],
    );
    return rows[0]!.production_release_id;
  }

  async function releaseStatus(id: string): Promise<string> {
    const { rows } = await db.query<{ status: string }>(
      `select status from public.site_releases where id = $1`,
      [id],
    );
    return rows[0]!.status;
  }

  it('1. commander : les montants et le contenu de l’offre sont figés par la base', async () => {
    const created = await asUser<{ id: string }>(
      ids.user,
      `select app.create_order($1::uuid, $2::uuid, 'restauration', 'restaurant',
                               '{}'::jsonb, null, 'none', null, null, 'v1', null) as id`,
      [ids.org, ids.plan],
    );
    ids.order = created.rows[0]!.id;
    expect(ids.order).toBeTruthy();

    const { rows } = await db.query<{
      status: string;
      total_cents: number;
      setup_price_cents: number;
      maintenance_price_cents: number;
      billing_interval: string;
      paid_at: string | null;
      inclusions: number;
    }>(
      `select status, total_cents, setup_price_cents, maintenance_price_cents, billing_interval,
              paid_at, jsonb_array_length(plan_inclusions) as inclusions
         from public.orders where id = $1`,
      [ids.order],
    );
    const row = rows[0]!;
    // Premium : 550 EUR HT de creation, puis 14 EUR HT PAR MOIS de maintenance.
    expect(row.setup_price_cents).toBe(55_000);
    expect(row.maintenance_price_cents).toBe(1_400);
    expect(row.billing_interval).toBe('month');
    // Seule la creation est encaissee a la commande (TVA comprise).
    expect(row.total_cents).toBe(66_000);
    expect(row.inclusions).toBeGreaterThan(5);

    // Une commande nait en attente. Aucun chemin ne la cree deja payee.
    expect(row.status).not.toBe('paid');
    expect(row.paid_at).toBeNull();
  });

  it('2. le client ne peut pas se déclarer payé ni changer son prix', async () => {
    // La RLS ne leve pas d'exception sur un UPDATE : elle ne presente
    // simplement aucune ligne. Un refus se lit donc au nombre de lignes
    // touchees.
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
  });

  it('3. payer : le projet s’ouvre une seule fois, la maintenance attend la livraison', async () => {
    const pay = () =>
      db.query(`select app.apply_order_paid($1::uuid, $2, $3, $4, 'ch_parcours', 'visa', '4242')`, [
        ids.order,
        ids.intent,
        ids.session,
        ids.customer,
      ]);
    await pay();

    const order = await db.query<{ status: string; maintenance_status: string }>(
      `select status, maintenance_status from public.orders where id = $1`,
      [ids.order],
    );
    expect(order.rows[0]!.status).toBe('paid');
    expect(order.rows[0]!.maintenance_status).toBe('pending_delivery');

    const site = await db.query<{
      id: string;
      architecture: string;
      public_key: string;
      delivered_at: string | null;
    }>(
      `select id, architecture, public_key, delivered_at from public.sites where organization_id = $1`,
      [ids.org],
    );
    expect(site.rows).toHaveLength(1);
    ids.site = site.rows[0]!.id;
    ids.publicKey = site.rows[0]!.public_key;
    // Un projet independant, jamais un site genere a partir d'un modele.
    expect(site.rows[0]!.architecture).toBe('external_repository');
    expect(site.rows[0]!.delivered_at).toBeNull();

    const project = await db.query(`select 1 from public.projects where site_id = $1`, [ids.site]);
    expect(project.rows).toHaveLength(1);

    // Rejeu du meme evenement Stripe : rien ne double.
    await pay();
    const again = await db.query(`select 1 from public.sites where organization_id = $1`, [
      ids.org,
    ]);
    expect(again.rows).toHaveLength(1);
    const payments = await db.query(
      `select 1 from public.payments where stripe_payment_intent_id = $1`,
      [ids.intent],
    );
    expect(payments.rows).toHaveLength(1);

    // Rien n'est preleve au titre de la maintenance avant la livraison : la
    // base refuse l'abonnement.
    const early = await callAsServer(
      `app.upsert_subscription_from_stripe($1, $2, 'active', now(), now() + interval '1 month',
                                           false, $3::uuid, null)`,
      [`sub_parcours_${ids.suffix}`, ids.customer, ids.order],
    );
    expect(early['code']).toBe('site_not_delivered');
  });

  it('4. avant la livraison, le client suit son projet mais ne modifie rien', async () => {
    const denied = async (sql: string) =>
      expect(asUser(ids.user, sql, [ids.site])).rejects.toThrow();

    await denied(`select public.save_site_draft($1::uuid, '{}'::jsonb, null)`);
    await denied(`select public.request_site_release($1::uuid, 'publish', null, null)`);
    await denied(`select public.begin_site_preview($1::uuid)`);
    await denied(`select public.deliver_site($1::uuid)`);
    await expect(
      asUser(
        ids.user,
        `select public.connect_site_repository($1::uuid, $2, $3, $4, $5, 'x', $4 || '/x',
                                               'https://github.com/' || $4 || '/x', 'main', 'main')`,
        [ids.site, ids.installation, ids.repository, `stax-sites-${ids.suffix}`, ids.githubAccount],
      ),
    ).rejects.toThrow();

    // Il voit bien son projet, et une autre societe ne le voit pas.
    const own = await asUser(ids.user, `select 1 from public.projects where site_id = $1`, [
      ids.site,
    ]);
    expect(own.rowCount).toBe(1);
    const foreign = await asUser(ids.stranger, `select 1 from public.projects where site_id = $1`, [
      ids.site,
    ]);
    expect(foreign.rowCount).toBe(0);
  });

  it('5. l’équipe rattache le dépôt et le projet Cloudflare du site, jamais ceux d’un autre', async () => {
    const owner = `stax-sites-${ids.suffix}`;
    const repo = await callAs(
      ids.staff,
      `public.connect_site_repository($1::uuid, $2, $3, $4, $5, $6, $7, $8, 'main', 'main')`,
      [
        ids.site,
        ids.installation,
        ids.repository,
        owner,
        ids.githubAccount,
        `parcours-${ids.suffix}`,
        `${owner}/parcours-${ids.suffix}`,
        `https://github.com/${owner}/parcours-${ids.suffix}`,
      ],
    );
    expect(repo['ok']).toBe(true);

    const hosting = await callAs(
      ids.staff,
      `public.connect_site_hosting($1::uuid, 'cloudflare_pages', $2, $3, $4, 'main', $5)`,
      [
        ids.site,
        account,
        `parcours-${ids.suffix}`,
        `proj-${ids.suffix}`,
        `https://parcours-${ids.suffix}.pages.dev`,
      ],
    );
    expect(hosting['ok']).toBe(true);
    ids.hosting = (
      await db.query<{ id: string }>(`select id from public.site_hosting where site_id = $1`, [
        ids.site,
      ])
    ).rows[0]!.id;

    // Un second site ne peut pas reprendre le depot ni le projet du premier.
    const other = await callAs(
      ids.staff,
      `public.admin_create_site($1, 'coiffeur', $2::uuid, 'Lyon')`,
      [`Autre ${ids.suffix}`, ids.plan],
    );
    const otherSite = other['siteId'] as string;
    const stolenRepo = await callAs(
      ids.staff,
      `public.connect_site_repository($1::uuid, $2, $3, $4, $5, $6, $7, $8, 'main', 'main')`,
      [
        otherSite,
        ids.installation,
        ids.repository,
        owner,
        ids.githubAccount,
        `parcours-${ids.suffix}`,
        `${owner}/parcours-${ids.suffix}`,
        `https://github.com/${owner}/parcours-${ids.suffix}`,
      ],
    );
    expect(stolenRepo['code']).toBe('repository_already_attached');
    const stolenProject = await callAs(
      ids.staff,
      `public.connect_site_hosting($1::uuid, 'cloudflare_pages', $2, $3, $4, 'main', $5)`,
      [
        otherSite,
        account,
        `parcours-${ids.suffix}`,
        `proj-${ids.suffix}`,
        `https://parcours-${ids.suffix}.pages.dev`,
      ],
    );
    expect(stolenProject['code']).toBe('project_already_attached');
  });

  it('6. le contrat d’édition et le contenu initial reposent sur un déploiement vérifié', async () => {
    const manifest = await callAs(
      ids.staff,
      `public.record_site_manifest($1::uuid, $2, 'stax.manifest.json', 1, $3::jsonb, $4, 'valid',
                                   '[]'::jsonb, '[]'::jsonb, $5::jsonb, true)`,
      [
        ids.site,
        sha('1'),
        JSON.stringify({ contract: 1, site: { name: 'Parcours' } }),
        `hash-${ids.suffix}`,
        JSON.stringify({ pages: 3, locales: 1, forms: 1, collections: 0 }),
      ],
    );
    expect(manifest['active']).toBe(true);
    ids.manifest = manifest['manifestId'] as string;

    const content = JSON.stringify({ pages: { home: { hero: { title: 'Bienvenue' } } } });
    const unverified = await callAs(
      ids.staff,
      `public.initialize_site_content($1::uuid, $2::uuid, $3::jsonb, 'hash-v1', $4, $5::jsonb)`,
      [
        ids.site,
        ids.manifest,
        content,
        sha('1'),
        JSON.stringify({ status: 'building', providerDeploymentId: `dep-0-${ids.suffix}` }),
      ],
    );
    expect(unverified['code']).toBe('deployment_not_verified');

    const initial = await callAs(
      ids.staff,
      `public.initialize_site_content($1::uuid, $2::uuid, $3::jsonb, 'hash-v1', $4, $5::jsonb)`,
      [
        ids.site,
        ids.manifest,
        content,
        sha('1'),
        JSON.stringify({
          status: 'success',
          providerDeploymentId: `dep-1-${ids.suffix}`,
          url: `https://d1.parcours-${ids.suffix}.pages.dev`,
        }),
      ],
    );
    ids.v1 = initial['releaseId'] as string;
    expect(ids.v1).toBeTruthy();
    expect(await production()).toBe(ids.v1);

    // L'equipe travaille sur le projet AVANT la livraison ; le client, non.
    const staffEdit = await callAs(ids.staff, `public.save_site_draft($1::uuid, $2::jsonb, $3)`, [
      ids.site,
      JSON.stringify({ pages: { home: { hero: { title: 'Bienvenue chez nous' } } } }),
      await draftRevision(),
    ]);
    expect(staffEdit['ok']).toBe(true);
    await expect(
      asUser(ids.user, `select public.save_site_draft($1::uuid, '{}'::jsonb, $2)`, [
        ids.site,
        await draftRevision(),
      ]),
    ).rejects.toThrow();
  });

  it('7. livrer : refusé sans checklist complète, puis la maintenance démarre', async () => {
    const early = await callAs(ids.staff, `public.deliver_site($1::uuid)`, [ids.site]);
    expect(early['code']).toBe('checklist_incomplete');

    await callAs(ids.staff, `public.attest_delivery_check($1::uuid, 'forms', true, $2)`, [
      ids.site,
      'Formulaire de contact envoyé et reçu dans la messagerie StaX',
    ]);
    await callAs(ids.staff, `public.attest_delivery_check($1::uuid, 'responsive', true, $2)`, [
      ids.site,
      'Vérifié sur téléphone, tablette et ordinateur',
    ]);
    for (const [key, evidence] of [
      ['deployed', { deployment: `dep-1-${ids.suffix}` }],
      ['domain', { hostname: `parcours-${ids.suffix}.test` }],
      ['https', { status: 200 }],
      ['seo', { title: true, sitemap: true }],
    ] as const) {
      await callAsServer(`public.record_delivery_check($1::uuid, $2, true, $3::jsonb)`, [
        ids.site,
        key,
        JSON.stringify(evidence),
      ]);
    }

    const readiness = await callAs(ids.staff, `public.delivery_readiness($1::uuid)`, [ids.site]);
    expect(readiness['ready']).toBe(true);
    const delivered = await callAs(ids.staff, `public.deliver_site($1::uuid)`, [ids.site]);
    expect(delivered['ok']).toBe(true);

    const site = await db.query<{ status: string; delivered_at: string | null }>(
      `select status, delivered_at from public.sites where id = $1`,
      [ids.site],
    );
    expect(site.rows[0]!.status).toBe('live');
    expect(site.rows[0]!.delivered_at).not.toBeNull();

    // La maintenance MENSUELLE peut desormais demarrer, et pas avant.
    const subscription = await callAsServer(
      `app.upsert_subscription_from_stripe($1, $2, 'active', now(), now() + interval '1 month',
                                           false, $3::uuid, null)`,
      [`sub_parcours_${ids.suffix}`, ids.customer, ids.order],
    );
    expect(subscription['ok']).toBe(true);
    const order = await db.query<{ maintenance_status: string; interval: string }>(
      `select o.maintenance_status, s.billing_interval as interval
         from public.orders o join public.subscriptions s on s.order_id = o.id
        where o.id = $1`,
      [ids.order],
    );
    expect(order.rows[0]!.maintenance_status).toBe('started');
    expect(order.rows[0]!.interval).toBe('month');
  });

  it('8. publier : une version n’est « publiée » qu’une fois son déploiement confirmé', async () => {
    const saved = await callAs(ids.user, `public.save_site_draft($1::uuid, $2::jsonb, $3)`, [
      ids.site,
      JSON.stringify({ pages: { home: { hero: { title: 'Titre du client' } } } }),
      await draftRevision(),
    ]);
    expect(saved['ok']).toBe(true);

    const requested = await callAs(
      ids.user,
      `public.request_site_release($1::uuid, 'publish', null, $2, null, 'Nouveau titre')`,
      [ids.site, await draftRevision()],
    );
    expect(requested['ok']).toBe(true);
    ids.v2 = requested['releaseId'] as string;
    expect(await releaseStatus(ids.v2)).toBe('queued');
    expect(await production()).toBe(ids.v1);

    // Le client ne peut pas se declarer publie a la place de GitHub ou Cloudflare.
    await expect(
      asUser(
        ids.user,
        `select public.record_release_commit($1::uuid, $2, $3, 'https://x', 'main')`,
        [ids.v2, sha('1'), sha('2')],
      ),
    ).rejects.toThrow();
    const forged = await asUser(
      ids.user,
      `update public.site_releases set status = 'published' where id = $1`,
      [ids.v2],
    ).catch(() => ({ rowCount: 0 }));
    expect(forged.rowCount).toBe(0);

    // Cycle serveur : prise en charge, commit, build, confirmation.
    expect((await callAsServer(`public.claim_site_release($1::uuid)`, [ids.v2]))['ok']).toBe(true);
    await callAsServer(`public.record_release_commit($1::uuid, $2, $3, $4, 'main')`, [
      ids.v2,
      sha('1'),
      sha('2'),
      `https://github.com/stax/parcours/commit/${sha('2')}`,
    ]);
    expect(await releaseStatus(ids.v2)).toBe('deploying');
    expect(await production()).toBe(ids.v1);

    await callAsServer(
      `public.record_site_deployment($1::uuid, $2, 'production', 'building', $3, 'main')`,
      [ids.hosting, `dep-2-${ids.suffix}`, sha('2')],
    );
    expect(await releaseStatus(ids.v2)).toBe('deploying');

    await callAsServer(
      `public.record_site_deployment($1::uuid, $2, 'production', 'success', $3, 'main', $4)`,
      [ids.hosting, `dep-2-${ids.suffix}`, sha('2'), `https://d2.parcours-${ids.suffix}.pages.dev`],
    );
    expect(await releaseStatus(ids.v2)).toBe('published');
    expect(await production()).toBe(ids.v2);
    expect(await releaseStatus(ids.v1)).toBe('superseded');

    // La version publiee correspond exactement au commit deploye.
    const published = await db.query<{ commit_sha: string; content: Json }>(
      `select commit_sha, content from public.site_releases where id = $1`,
      [ids.v2],
    );
    expect(published.rows[0]!.commit_sha).toBe(sha('2'));
    expect(JSON.stringify(published.rows[0]!.content)).toContain('Titre du client');
  });

  it('9. un échec GitHub ou Cloudflare n’est jamais une publication réussie', async () => {
    const request = async () =>
      (
        await callAs(ids.user, `public.request_site_release($1::uuid, 'publish', null, $2)`, [
          ids.site,
          await draftRevision(),
        ])
      )['releaseId'] as string;

    const githubFailure = await request();
    await callAsServer(`public.claim_site_release($1::uuid)`, [githubFailure]);
    await callAsServer(`public.fail_site_release($1::uuid, 'github', 'github_unavailable', $2)`, [
      githubFailure,
      'GitHub n’a pas accepté le commit.',
    ]);
    expect(await releaseStatus(githubFailure)).toBe('failed');
    expect(await production()).toBe(ids.v2);

    const cloudflareFailure = await request();
    await callAsServer(`public.claim_site_release($1::uuid)`, [cloudflareFailure]);
    await callAsServer(`public.record_release_commit($1::uuid, $2, $3, $4, 'main')`, [
      cloudflareFailure,
      sha('2'),
      sha('4'),
      `https://github.com/stax/parcours/commit/${sha('4')}`,
    ]);
    await callAsServer(
      `public.record_site_deployment($1::uuid, $2, 'production', 'failure', $3, 'main',
                                     null, 'build', 'npm run build exited with 1')`,
      [ids.hosting, `dep-4-${ids.suffix}`, sha('4')],
    );
    const failed = await db.query<{ status: string; error_stage: string }>(
      `select status, error_stage from public.site_releases where id = $1`,
      [cloudflareFailure],
    );
    expect(failed.rows[0]).toEqual({ status: 'failed', error_stage: 'cloudflare' });
    expect(await production()).toBe(ids.v2);

    // Le client est prevenu, clairement.
    const notified = await db.query(
      `select 1 from public.notifications where recipient_id = $1 and type = 'site.release_failed'`,
      [ids.user],
    );
    expect(notified.rows.length).toBeGreaterThan(0);
  });

  it('10. restaurer la v1 la redéploie réellement, comme une nouvelle version', async () => {
    const draftBefore = await db.query<{ content: Json }>(
      `select content from public.site_content_drafts where site_id = $1`,
      [ids.site],
    );

    const rollback = await callAs(
      ids.user,
      `public.request_site_release($1::uuid, 'rollback', $2::uuid)`,
      [ids.site, ids.v1],
    );
    const restored = rollback['releaseId'] as string;
    expect(restored).not.toBe(ids.v1);

    const contents = await db.query<{ same: boolean; kind: string }>(
      `select r.content = v1.content as same, r.kind
         from public.site_releases r, public.site_releases v1
        where r.id = $1 and v1.id = $2`,
      [restored, ids.v1],
    );
    expect(contents.rows[0]).toEqual({ same: true, kind: 'rollback' });
    // Tant que le redeploiement n'est pas confirme, la v2 reste en ligne.
    expect(await production()).toBe(ids.v2);

    await callAsServer(`public.claim_site_release($1::uuid)`, [restored]);
    await callAsServer(`public.record_release_commit($1::uuid, $2, $3, $4, 'main')`, [
      restored,
      sha('4'),
      sha('5'),
      `https://github.com/stax/parcours/commit/${sha('5')}`,
    ]);
    await callAsServer(
      `public.record_site_deployment($1::uuid, $2, 'production', 'success', $3, 'main')`,
      [ids.hosting, `dep-5-${ids.suffix}`, sha('5')],
    );
    expect(await production()).toBe(restored);

    // Le brouillon du client n'a pas bouge.
    const draftAfter = await db.query<{ content: Json }>(
      `select content from public.site_content_drafts where site_id = $1`,
      [ids.site],
    );
    expect(draftAfter.rows[0]!.content).toEqual(draftBefore.rows[0]!.content);
  });

  it('11. une autre société ne lit ni ne modifie rien', async () => {
    const drafts = await asUser(
      ids.stranger,
      `select 1 from public.site_content_drafts where site_id = $1`,
      [ids.site],
    );
    expect(drafts.rowCount).toBe(0);
    const releases = await asUser(
      ids.stranger,
      `select 1 from public.site_releases where site_id = $1`,
      [ids.site],
    );
    expect(releases.rowCount).toBe(0);
    await expect(
      asUser(ids.stranger, `select public.save_site_draft($1::uuid, '{}'::jsonb, null)`, [
        ids.site,
      ]),
    ).rejects.toThrow();

    // Le client lui-meme ne voit pas les details d'infrastructure.
    const infra = await asUser(ids.user, `select 1 from public.site_hosting where site_id = $1`, [
      ids.site,
    ]);
    expect(infra.rowCount).toBe(0);
  });

  it('12. l’API des sites reconnaît le site par sa clé publique, et lui seul', async () => {
    const resolved = await callAsServer(`public.resolve_site_api($1)`, [ids.publicKey]);
    expect(resolved['siteId']).toBe(ids.site);
    expect(resolved['available']).toBe(true);
    expect(resolved['hosts']).toContain(`parcours-${ids.suffix}.pages.dev`);
    expect((resolved['features'] as Json)['bookings']).toBe(true);
    expect((resolved['features'] as Json)['ecommerce']).toBe(false);

    const unknown = await callAsServer(`public.resolve_site_api($1)`, [
      `pk_site_${'0'.repeat(32)}`,
    ]);
    expect(unknown).toBeNull();

    // Reservee au serveur : un navigateur ne l'appelle jamais directement.
    await expect(
      asUser(ids.user, `select public.resolve_site_api($1)`, [ids.publicKey]),
    ).rejects.toThrow();
  });

  it('13. un formulaire du site dépose dans le bon tenant', async () => {
    await db.query(
      `insert into public.forms (site_id, organization_id, slug, name, kind)
       values ($1, $2, 'contact-parcours', 'Contact', 'contact')`,
      [ids.site, ids.org],
    );

    const result = await db.query<{ submit_form: { ok: boolean } }>(
      `select app.submit_form($1::uuid, 'contact-parcours',
                              jsonb_build_object('message', 'Bonjour', 'email', 'v@exemple.test'),
                              0, null, null, null, 'fr') as submit_form`,
      [ids.site],
    );
    expect(result.rows[0]!.submit_form.ok).toBe(true);

    const stored = await db.query<{ organization_id: string }>(
      `select organization_id from public.form_submissions where site_id = $1`,
      [ids.site],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.organization_id).toBe(ids.org);

    // Un site inexistant repond « introuvable », comme un formulaire absent.
    await expect(
      db.query(
        `select app.submit_form($1::uuid, 'contact-parcours', '{"message":"x"}'::jsonb,
                                0, null, null, null, 'fr')`,
        ['00000000-0000-0000-0000-000000000000'],
      ),
    ).rejects.toThrow(/introuvable/i);
  });

  it('14. réserver : la capacité du créneau fait loi', async () => {
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

    const second = await db.query<{ create_booking: { ok: boolean; code?: string } }>(
      `select app.create_booking($1::uuid, $2::uuid, $3::timestamptz, 1,
                                 'Second', 'second@exemple.test', null, null, null)
              as create_booking`,
      [ids.site, serviceId, slot],
    );
    expect(second.rows[0]!.create_booking.ok).toBe(false);
    expect(second.rows[0]!.create_booking.code).toBe('slot_full');
  });

  it('15. activer : un code d’activation ne sert qu’une fois, et qu’à son destinataire', async () => {
    const hash = `hash-parcours-${Math.random().toString(36).slice(2, 10)}`;
    const email = `active-${ids.suffix}@client.test`;

    await db.query(
      `insert into public.activation_codes
         (site_id, organization_id, code_hash, code_hint, granted_role,
          email_constraint, expires_at)
       values ($1, $2, $3, 'ABCD', 'editor', $4, now() + interval '14 days')`,
      [ids.site, ids.org, hash, email],
    );
    const newcomer = (
      await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [
        email,
      ])
    ).rows[0]!.id;

    const first = await db.query<{ ok: boolean; reason: string }>(
      `select * from app.redeem_activation_code($1, $2::uuid, $3)`,
      [hash, newcomer, email],
    );
    expect(first.rows[0]!.ok).toBe(true);

    const replay = await db.query<{ ok: boolean; reason: string }>(
      `select * from app.redeem_activation_code($1, $2::uuid, $3)`,
      [hash, newcomer, email],
    );
    expect(replay.rows[0]).toMatchObject({ ok: false, reason: 'already_used' });

    const otherHash = `hash-parcours-${Math.random().toString(36).slice(2, 10)}`;
    await db.query(
      `insert into public.activation_codes
         (site_id, organization_id, code_hash, code_hint, granted_role,
          email_constraint, expires_at)
       values ($1, $2, $3, 'EFGH', 'editor', $4, now() + interval '14 days')`,
      [ids.site, ids.org, otherHash, email],
    );
    const stolen = await db.query<{ ok: boolean; reason: string }>(
      `select * from app.redeem_activation_code($1, $2::uuid, $3)`,
      [otherHash, ids.stranger, `intrus-${ids.suffix}@ailleurs.test`],
    );
    expect(stolen.rows[0]).toMatchObject({ ok: false, reason: 'email_mismatch' });
  });

  it('16. suspendre coupe l’édition et les publications sans rien supprimer', async () => {
    // Une publication demandee juste avant la suspension...
    const pending = (
      await callAs(ids.user, `public.request_site_release($1::uuid, 'publish', null, $2)`, [
        ids.site,
        await draftRevision(),
      ])
    )['releaseId'] as string;
    const online = await production();

    await db.query(`update public.sites set status = 'suspended' where id = $1`, [ids.site]);

    // ... n'est jamais deployee : elle echoue a sa prise en charge.
    const claim = await callAsServer(`public.claim_site_release($1::uuid)`, [pending]);
    expect(claim['code']).toBe('site_unavailable');
    expect(await releaseStatus(pending)).toBe('failed');
    expect(await production()).toBe(online);

    // Le client ne modifie ni ne publie plus ; les interactions s'arretent.
    await expect(
      asUser(ids.user, `select public.request_site_release($1::uuid, 'publish', null, null)`, [
        ids.site,
      ]),
    ).rejects.toThrow();
    await expect(
      asUser(ids.user, `select public.save_site_draft($1::uuid, '{}'::jsonb, null)`, [ids.site]),
    ).rejects.toThrow();
    const resolved = await callAsServer(`public.resolve_site_api($1)`, [ids.publicKey]);
    expect(resolved['available']).toBe(false);

    // Rien n'a disparu : versions, brouillon et messages sont intacts, et le
    // client relit toujours son historique.
    const history = await asUser(
      ids.user,
      `select 1 from public.site_releases where site_id = $1`,
      [ids.site],
    );
    expect(history.rowCount).toBeGreaterThanOrEqual(6);
    const messages = await db.query(`select 1 from public.form_submissions where site_id = $1`, [
      ids.site,
    ]);
    expect(messages.rows.length).toBeGreaterThan(0);

    await db.query(`update public.sites set status = 'live' where id = $1`, [ids.site]);
    const reopened = await callAs(ids.user, `public.save_site_draft($1::uuid, $2::jsonb, $3)`, [
      ids.site,
      JSON.stringify({ pages: { home: { hero: { title: 'De retour' } } } }),
      await draftRevision(),
    ]);
    expect(reopened['ok']).toBe(true);
  });
});
