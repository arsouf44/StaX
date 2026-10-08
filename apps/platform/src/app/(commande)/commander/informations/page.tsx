import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveBusiness } from '@nemasus/business';
import { OrderSteps } from '~/components/order/order-steps';
import { readOrderDraft } from '~/lib/order-draft';
import { InformationForm } from './information-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vos coordonnées',
  robots: { index: false, follow: false },
};

export default async function OrderInformationPage() {
  const draft = await readOrderDraft();
  if (!draft.businessTypeSlug) redirect('/commander');

  // Les questions posees sont celles du METIER choisi : un coiffeur et un
  // agent immobilier n ont pas les memes informations a fournir.
  const business = resolveBusiness(draft.businessTypeSlug);

  return (
    <>
      <OrderSteps current="/commander/informations" />

      <h1 className="title-page">Parlez-nous de vous</h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        Ces informations nous permettent de préparer votre site et de vous envoyer les modalités de
        paiement. Votre code d’accès personnel sera envoyé à l’adresse e-mail indiquée ici :
        vérifiez-la bien.
      </p>

      <InformationForm
        questions={business.onboarding.map((question) => ({
          id: question.id,
          label: question.label,
          type: question.type,
          required: question.required,
          help: question.help ?? null,
          placeholder: question.placeholder ?? null,
          options: question.options ? [...question.options] : null,
        }))}
        draft={{
          organizationName: draft.organizationName ?? '',
          contactFirstName: draft.contactFirstName ?? '',
          contactLastName: draft.contactLastName ?? '',
          contactEmail: draft.contactEmail ?? '',
          contactPhone: draft.contactPhone ?? '',
          city: draft.city ?? '',
          customerNotes: draft.customerNotes ?? '',
          answers: draft.answers,
        }}
      />
    </>
  );
}
