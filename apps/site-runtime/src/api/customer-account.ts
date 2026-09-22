import { createServiceClient } from '@stax/database';
import { customerLoginEmail, sendEmail } from '@stax/emails';
import { formatMoney } from '@stax/payments/money';
import { html, join, renderDocument, type RawHtml } from '@stax/site-engine';
import { buildPageContext, siteOrigin } from '../context';
import { htmlResponse, jsonResponse, redirectResponse } from '../responses';
import { field, guardPublicWrite, refuse } from './shared';
import {
  clearedCustomerCookie,
  customerSessionCookie,
  loginTokenHash,
  newLoginToken,
  readCustomerSession,
} from './customer-session';
import type { ResolvedSite } from '../resolve';

/**
 * Espace client d'un site.
 *
 * Reserve aux sites dont l'offre comporte le droit `customer_accounts` : la
 * base le verifie, l'interface ne fait que refleter sa reponse.
 *
 * Connexion sans mot de passe : un lien a usage unique, valable une heure. Il
 * n'y a donc aucun secret a stocker cote serveur — seule l'empreinte du lien
 * l'est — et aucun mot de passe reutilise ailleurs ne peut compromettre ce
 * compte.
 *
 * Le formulaire de demande repond TOUJOURS la meme chose. Une reponse qui
 * distinguerait « adresse connue » de « adresse inconnue » transformerait
 * l'espace client en annuaire de la clientele du commercant.
 */

/** Duree de validite d'un lien de connexion. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Reponse unique du formulaire de connexion, quelle que soit l'issue. */
const UNIFORM_ANSWER =
  'Si un compte peut être ouvert pour cette adresse, un lien de connexion vient d’y être ' +
  'envoyé. Il est valable une heure.';

const ORDER_STATUS: Record<string, string> = {
  pending: 'En attente de paiement',
  awaiting_payment: 'En attente de paiement',
  paid: 'Payée',
  preparing: 'En préparation',
  fulfilled: 'Remise',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

const BOOKING_STATUS: Record<string, string> = {
  pending: 'À confirmer',
  confirmed: 'Confirmée',
  seated: 'En cours',
  completed: 'Terminée',
  cancelled: 'Annulée',
  no_show: 'Non honorée',
};

async function hasAccounts(site: ResolvedSite): Promise<boolean> {
  const { data } = await createServiceClient().rpc('site_has_feature', {
    p_site: site.siteId,
    p_feature: 'customer_accounts',
  });
  return data === true;
}

/* -------------------------------------------------------------------------- */
/*  Demande d'un lien de connexion                                            */
/* -------------------------------------------------------------------------- */

export async function handleCustomerLoginRequest(
  request: Request,
  site: ResolvedSite,
): Promise<Response> {
  if (!(await hasAccounts(site))) {
    return refuse('Les comptes client ne sont pas activés sur ce site.', 404, 'module_disabled');
  }

  const guard = await guardPublicWrite(request, site, 'apiWrite');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);

  const email = field(guard.payload, 'email', 200);
  if (!email) {
    // Meme reponse qu'un succes : le formulaire ne sert pas a tester des
    // adresses, pas meme par le biais d'un message d'erreur.
    return jsonResponse({ ok: true, message: UNIFORM_ANSWER });
  }

  const token = newLoginToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const service = createServiceClient();

  const { data, error } = await service.rpc('request_customer_login', {
    p_site: site.siteId,
    p_email: email,
    p_token_hash: await loginTokenHash(token),
    p_expires_at: expiresAt.toISOString(),
    p_ip_hash: guard.ipHash,
  });

  if (error) {
    console.error('[stax:customer] demande impossible', error.code, error.message);
    return jsonResponse({ ok: true, message: UNIFORM_ANSWER });
  }

  const result = (data ?? {}) as { ok?: boolean; sent?: boolean };

  // Compte bloque, plafond d'envoi atteint, adresse inconnue : rien ne part, et
  // la reponse reste identique.
  if (result.ok !== true || result.sent !== true) {
    return jsonResponse({ ok: true, message: UNIFORM_ANSWER });
  }

  const origin = siteOrigin(request);
  const contact = site.settings.email;

  await sendEmail(
    customerLoginEmail({
      to: email,
      businessName: site.settings.businessName,
      siteUrl: origin,
      contactEmail: contact,
      loginUrl: `${origin}/compte?jeton=${encodeURIComponent(token)}`,
      expiresLabel: new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: site.timezone,
      }).format(expiresAt),
    }),
    { db: service, organizationId: site.organizationId, siteId: site.siteId },
  );

  return jsonResponse({ ok: true, message: UNIFORM_ANSWER });
}

export async function handleCustomerLogout(
  request: Request,
  site: ResolvedSite,
): Promise<Response> {
  const guard = await guardPublicWrite(request, site, 'apiWrite');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);
  return jsonResponse({ ok: true, url: '/' }, 200, { 'set-cookie': clearedCustomerCookie() });
}

/* -------------------------------------------------------------------------- */
/*  Page de l'espace client                                                    */
/* -------------------------------------------------------------------------- */

export async function handleCustomerAccount(
  request: Request,
  site: ResolvedSite,
): Promise<Response> {
  if (!(await hasAccounts(site))) {
    return renderInShell(
      request,
      site,
      html`<section class="sec">
        <div class="wrap w-narrow">
          <h1>Espace client indisponible</h1>
          <p class="lede">Ce site ne propose pas encore d’espace client.</p>
          <p style="margin-top:2rem">
            <a class="btn btn-secondary" href="/">Retour à l’accueil</a>
          </p>
        </div>
      </section>`,
      404,
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('jeton');
  const service = createServiceClient();

  // Le lien de l'e-mail : on le consomme, on pose la session, puis on REDIRIGE
  // vers une URL propre. Laisser le jeton dans la barre d'adresse le ferait
  // survivre dans l'historique et dans les referents.
  if (token) {
    const { data } = await service.rpc('redeem_customer_login', {
      p_site: site.siteId,
      p_token_hash: await loginTokenHash(token),
    });
    const outcome = (data ?? {}) as { ok?: boolean; customerId?: string };

    if (outcome.ok === true && outcome.customerId) {
      return redirectResponse('/compte', 302, {
        'set-cookie': await customerSessionCookie(site.siteId, outcome.customerId),
      });
    }

    return renderInShell(
      request,
      site,
      html`<section class="sec">
        <div class="wrap w-narrow">
          <h1>Ce lien n’est plus valable</h1>
          <p class="lede">
            Un lien de connexion ne sert qu’une fois et expire au bout d’une heure. Demandez-en un
            nouveau : il arrivera dans la minute.
          </p>
          ${loginForm()}
        </div>
      </section>`,
      200,
    );
  }

  const session = await readCustomerSession(request, site.siteId);
  if (!session) {
    return renderInShell(
      request,
      site,
      html`<section class="sec">
        <div class="wrap w-narrow">
          <h1>Votre espace</h1>
          <p class="lede">
            Retrouvez vos commandes et vos réservations. Pas de mot de passe : indiquez votre
            adresse, nous vous envoyons un lien de connexion.
          </p>
          ${loginForm()}
        </div>
      </section>`,
      200,
    );
  }

  const { data } = await service.rpc('customer_account_view', {
    p_site: site.siteId,
    p_customer: session.customerId,
  });

  const view = (data ?? {}) as {
    ok?: boolean;
    email?: string;
    name?: string | null;
    orders?: Array<{
      reference: string;
      status: string;
      totalCents: number;
      currency: string;
      createdAt: string;
    }>;
    bookings?: Array<{
      reference: string;
      status: string;
      startsAt: string;
      partySize: number;
    }>;
  };

  if (view.ok !== true) {
    // Session valide mais compte disparu ou bloque : on efface le cookie
    // plutot que de laisser une session qui ne mene nulle part.
    return renderInShell(
      request,
      site,
      html`<section class="sec">
        <div class="wrap w-narrow">
          <h1>Votre espace</h1>
          <p class="lede">Votre session a expiré. Demandez un nouveau lien de connexion.</p>
          ${loginForm()}
        </div>
      </section>`,
      200,
      clearedCustomerCookie(),
    );
  }

  const orders = view.orders ?? [];
  const bookings = view.bookings ?? [];
  const dateTime = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: site.timezone,
  });
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: site.timezone });

  return renderInShell(
    request,
    site,
    html`
      <section class="sec">
        <div class="wrap w-narrow">
          <p class="eyebrow">${view.email ?? ''}</p>
          <h1>Votre espace</h1>

          <h2 style="margin-top:2.5rem">Vos commandes</h2>
          ${
            orders.length === 0
              ? html`<p class="muted">Vous n’avez pas encore passé de commande.</p>`
              : html`<div class="price-list">
                  ${join(
                    orders.map(
                      (order) =>
                        html`<div class="price-row">
                          <div>
                            <p><strong>${order.reference}</strong></p>
                            <p class="price-meta">
                              ${date.format(new Date(order.createdAt))} ·
                              ${ORDER_STATUS[order.status] ?? order.status}
                            </p>
                          </div>
                          <span class="dots"></span>
                          <span class="price-amt"
                            >${formatMoney(order.totalCents, (order.currency || 'EUR') as 'EUR')}</span
                          >
                        </div>`,
                    ),
                  )}
                </div>`
          }

          <h2 style="margin-top:2.5rem">Vos réservations</h2>
          ${
            bookings.length === 0
              ? html`<p class="muted">Aucune réservation à venir.</p>`
              : html`<div class="price-list">
                  ${join(
                    bookings.map(
                      (booking) =>
                        html`<div class="price-row">
                          <div>
                            <p><strong>${dateTime.format(new Date(booking.startsAt))}</strong></p>
                            <p class="price-meta">
                              ${booking.reference} · ${String(booking.partySize)}
                              personne${booking.partySize > 1 ? 's' : ''} ·
                              ${BOOKING_STATUS[booking.status] ?? booking.status}
                            </p>
                          </div>
                        </div>`,
                    ),
                  )}
                </div>`
          }

          <form data-stax-customer-logout class="form" style="margin-top:3rem">
            <input type="hidden" name="_token" value="__STAX_FORM_TOKEN__" />
            <button type="submit" class="btn btn-secondary">Me déconnecter</button>
          </form>
        </div>
      </section>
    `,
    200,
  );
}

/**
 * Formulaire de demande de lien.
 *
 * `__STAX_FORM_TOKEN__` est un MARQUEUR, remplace au rendu par le vrai jeton
 * anti-CSRF : celui-ci n'est connu qu'une fois le contexte de page construit,
 * et le faire circuler jusqu'ici n'apporterait rien.
 */
function loginForm(): RawHtml {
  return html`
    <form data-stax-customer-login class="form" style="margin-top:2rem" novalidate>
      <div class="field">
        <label for="stax-customer-email">Votre adresse e-mail</label>
        <input
          id="stax-customer-email"
          name="email"
          type="email"
          autocomplete="email"
          maxlength="200"
          required
        />
      </div>
      <input type="hidden" name="_token" value="__STAX_FORM_TOKEN__" />
      <div class="form-status" data-stax-status hidden role="status"></div>
      <button type="submit" class="btn btn-primary">Recevoir mon lien</button>
      <p class="muted" style="margin-top:.75rem;font-size:.8125rem">
        Aucun mot de passe : le lien vous connecte directement, une seule fois.
      </p>
    </form>
  `;
}

/** Rend une page produite par le moteur dans l'identite du site du client. */
async function renderInShell(
  request: Request,
  site: ResolvedSite,
  main: RawHtml,
  status: number,
  setCookie?: string,
): Promise<Response> {
  const page = site.snapshot.pagesByPath.get('/') ?? site.snapshot.pages[0];
  if (!page) return jsonResponse({ ok: false, code: 'not_found' }, 404);

  const context = await buildPageContext(
    request,
    site,
    { ...page, path: '/compte', title: 'Votre espace', robotsIndexable: false, blocks: [] },
    { isPreview: site.hostname.isPreview },
  );

  // Le jeton anti-CSRF n'est connu qu'ici : il est injecte apres coup dans le
  // balisage produit plus haut, plutot que de faire circuler le contexte.
  const body = renderDocument({
    page: context.page,
    context: context.context,
    schemaOrgType: context.schemaOrgType,
    logoUrl: context.logoUrl,
    ogImageUrl: context.ogImageUrl,
    mainOverride: main,
  }).replaceAll('__STAX_FORM_TOKEN__', context.context.formToken);

  const response = htmlResponse(body, {
    status,
    nonce: context.context.nonce,
    cache: 'no-store, private',
  });

  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
}
