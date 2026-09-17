import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sitesDomain } from '@stax/config';
import { suggestSubdomain } from '@stax/security';
import { OrderSteps } from '~/components/order/order-steps';
import { readOrderDraft } from '~/lib/order-draft';
import { DomainForm } from './domain-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Votre adresse',
  robots: { index: false, follow: false },
};

export default async function OrderDomainPage() {
  const draft = await readOrderDraft();
  if (!draft.planSlug) redirect('/commander');
  if (!draft.businessTypeSlug) redirect('/commander/metier');
  if (!draft.organizationName) redirect('/commander/informations');

  return (
    <>
      <OrderSteps current="/commander/adresse" />

      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
        Quelle sera l’adresse de votre site ?
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        Vous pouvez utiliser un nom de domaine que vous possédez déjà, nous demander de l’acheter
        pour vous, ou démarrer avec une adresse temporaire et choisir plus tard.
      </p>

      <DomainForm
        sitesDomain={sitesDomain()}
        suggestion={suggestSubdomain(draft.organizationName)}
        draft={{
          handling: draft.domainHandling ?? null,
          hostname: draft.domainHostname ?? '',
          subdomain: draft.subdomain ?? '',
        }}
      />
    </>
  );
}
