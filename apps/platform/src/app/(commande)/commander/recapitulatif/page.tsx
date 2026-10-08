import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveBusiness } from '@nemasus/business';
import { readEnv } from '@nemasus/config';
import { Panel } from '@nemasus/ui';
import { OrderSteps } from '~/components/order/order-steps';
import { readOrderDraft } from '~/lib/order-draft';
import { getSession } from '~/lib/session';
import { TERMS_VERSION } from '~/content/legal';
import { InternalOrderForm, OrderForm } from './order-form';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Récapitulatif de votre commande',
  robots: { index: false, follow: false },
};

const DOMAIN_LABELS: Record<string, string> = {
  customer_owned: 'Vous connectez votre nom de domaine actuel',
  purchase: 'Nous achetons le nom de domaine pour vous, après accord',
  later: 'Choisi plus tard : adresse technique de l’hébergement en attendant',
};

/** Ce qui se passe après l'envoi : la vérité du parcours, dans l'ordre. */
const NEXT_STEPS = [
  'Vous recevez immédiatement un e-mail de confirmation avec la référence de votre commande.',
  'Nous étudions votre projet et vous envoyons par e-mail les modalités de paiement par virement bancaire : montant convenu, coordonnées bancaires, référence à indiquer.',
  'Dès réception de votre virement, nous vous envoyons votre code d’accès personnel.',
  'Vous saisissez ce code sur Nemasus : votre espace s’ouvre. Vous y suivez la conception de votre site, échangez avec l’équipe, puis le gérez vous-même une fois livré.',
];

const INTERNAL_NEXT_STEPS = [
  'La commande est enregistrée sans paiement et l’espace client s’ouvre : il affiche le suivi du projet, comme pour un client.',
  'L’équipe Nemasus conçoit et développe le site hors de Nemasus, dans son propre dépôt GitHub et son propre projet Cloudflare, puis le rattache.',
  'Le site n’est modifiable depuis l’espace client que lorsque l’administration le lui livre.',
];

export default async function OrderSummaryPage() {
  const draft = await readOrderDraft();
  if (!draft.businessTypeSlug) redirect('/commander');
  if (!draft.organizationName || !draft.contactEmail) redirect('/commander/informations');
  if (!draft.domainHandling) redirect('/commander/adresse');

  const session = await getSession();
  const business = resolveBusiness(draft.businessTypeSlug);

  // Affichage seulement : c'est `create_internal_order` qui vérifie, en base,
  // que le compte est bien un compte interne exonéré.
  const internal =
    session.profile?.account_type === 'internal' && session.profile.billing_exempt === true;

  const address =
    draft.domainHandling === 'later'
      ? 'Communiquée à la mise en ligne'
      : (draft.domainHostname ?? '—');
  const contact = [draft.contactFirstName, draft.contactLastName].filter(Boolean).join(' ');

  return (
    <>
      <OrderSteps current="/commander/recapitulatif" />

      <h1 className="title-page">Vérifiez et envoyez votre commande</h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        Aucun paiement n’est demandé maintenant : vous recevrez les modalités de paiement par
        virement à l’adresse {draft.contactEmail}.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <Panel level={2} padding="lg">
            <h2 className="text-sm font-medium">Votre commande</h2>
            <dl className="mt-4 divide-y divide-[var(--border)]">
              <Row label="Activité" value={business.name} href="/commander" />
              <Row
                label="Entreprise"
                value={draft.organizationName}
                href="/commander/informations"
              />
              {contact ? (
                <Row label="Contact" value={contact} href="/commander/informations" />
              ) : null}
              <Row
                label="Adresse e-mail"
                value={draft.contactEmail}
                hint="Les modalités de paiement puis votre code d’accès y seront envoyés."
                href="/commander/informations"
              />
              {draft.contactPhone ? (
                <Row label="Téléphone" value={draft.contactPhone} href="/commander/informations" />
              ) : null}
              {draft.city ? (
                <Row label="Ville" value={draft.city} href="/commander/informations" />
              ) : null}
              <Row
                label="Adresse du site"
                value={address}
                hint={DOMAIN_LABELS[draft.domainHandling] ?? ''}
                href="/commander/adresse"
              />
              {draft.customerNotes ? (
                <Row
                  label="Votre projet"
                  value={draft.customerNotes}
                  href="/commander/informations"
                />
              ) : null}
            </dl>
          </Panel>

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">Ce qui se passe ensuite</h2>
            <ol className="mt-4 space-y-3 text-sm text-[var(--foreground-muted)]">
              {(internal ? INTERNAL_NEXT_STEPS : NEXT_STEPS).map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--border)] text-xs font-medium text-[var(--foreground)]"
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-6">
          <Panel level={3} padding="lg">
            {internal ? (
              <>
                <p className="inline-flex rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                  Compte interne Nemasus
                </p>
                <h2 className="mt-3 text-sm font-medium">Aucun paiement</h2>
                <p className="mt-2 mb-5 text-sm text-[var(--foreground-muted)]">
                  La commande est enregistrée comme interne. Le site sera construit par l’équipe
                  Nemasus, puis confié à ce compte depuis l’administration.
                </p>
                <InternalOrderForm />
              </>
            ) : (
              <>
                <h2 className="text-sm font-medium">Envoyer la commande</h2>
                <p className="mt-2 mb-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  Le paiement se fait ensuite par virement bancaire. Votre espace s’ouvre avec le
                  code personnel envoyé dès réception du virement.
                </p>
                <OrderForm
                  termsVersion={TERMS_VERSION}
                  turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
                />
                <p className="mt-5 text-xs leading-relaxed text-[var(--muted)]">
                  Une question avant d’envoyer ?{' '}
                  <Link href="/contact" className="underline underline-offset-2">
                    Écrivez-nous
                  </Link>
                  .
                </p>
              </>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Étape où modifier la valeur ; absente pour une valeur qui en découle. */
  href?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-xs text-[var(--muted)]">{label}</dt>
        <dd className="mt-0.5 text-sm break-words whitespace-pre-line">{value}</dd>
        {hint ? <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-xs text-[var(--foreground-muted)] underline underline-offset-4 hover:text-[var(--foreground)]"
          aria-label={`Modifier : ${label}`}
        >
          Modifier
        </Link>
      ) : null}
    </div>
  );
}
