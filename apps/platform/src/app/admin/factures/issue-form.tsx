'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input, Panel, Select, Textarea } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { issueSalesInvoiceAction } from './actions';

export interface PlanChoice {
  id: string;
  label: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Émission">
      Émettre la facture
    </Button>
  );
}

export function IssueInvoiceForm({ plans }: { plans: PlanChoice[] }) {
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [open, setOpen] = useState(false);

  const submit = (formData: FormData) =>
    issueSalesInvoiceAction(IDLE_STATE, formData).then(setState);

  if (!open) {
    return (
      <div className="mt-6">
        {state.status === 'success' && state.message ? (
          <Alert tone="success" className="mb-4" live="status">
            {state.message}
          </Alert>
        ) : null}
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Émettre une facture
        </Button>
      </div>
    );
  }

  return (
    <Panel level={2} padding="lg" className="mt-6">
      <h2 className="text-sm font-medium">Émettre une facture</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
        Le montant est repris du catalogue, pas saisi à la main. Le numéro est attribué
        automatiquement, sans trou : la numérotation continue des factures est une obligation
        fiscale.
      </p>

      <form action={submit} className="mt-5 space-y-5" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Offre convenue" required>
            <Select name="planId" required defaultValue={plans[0]?.id ?? ''}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Adresse e-mail du client"
            required
            hint="C’est cette adresse, et elle seule, qui pourra rattacher la facture."
          >
            <Input name="customerEmail" type="email" required autoComplete="off" />
          </Field>

          <Field label="Nom de l’entreprise" required>
            <Input name="companyName" required minLength={2} maxLength={120} />
          </Field>

          <Field label="Nom du contact">
            <Input name="customerName" maxLength={120} />
          </Field>

          <Field label="Échéance de paiement (jours)" hint="30 jours par défaut.">
            <Input name="dueInDays" type="number" min={0} max={120} defaultValue={30} />
          </Field>
        </div>

        <Field
          label="Notes internes"
          hint="Jamais montrées au client. Contexte de l’appel, interlocuteur, engagements pris."
        >
          <Textarea name="internalNotes" rows={3} maxLength={2000} />
        </Field>

        <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
          <SubmitButton />
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
        </div>
      </form>
    </Panel>
  );
}
