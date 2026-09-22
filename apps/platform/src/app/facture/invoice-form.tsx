'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Alert, Button, Field, Input, Panel, Switch } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { claimInvoiceAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Vérification" block>
      Rattacher ma facture
    </Button>
  );
}

export function InvoiceForm({
  defaultOrganizationName,
  hasOrganization,
  defaultNumber = '',
}: {
  defaultOrganizationName: string;
  hasOrganization: boolean;
  /** Prerempli depuis le lien de l'e-mail. Le serveur revalide de toute facon. */
  defaultNumber?: string;
}) {
  const [state, setState] = useState<ActionState>(IDLE_STATE);

  const submit = (formData: FormData) => claimInvoiceAction(IDLE_STATE, formData).then(setState);

  return (
    <Panel level={2} padding="lg">
      <form action={submit} className="space-y-5" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}

        <Field
          label="Numéro de facture"
          required
          hint="Il figure en haut de la facture reçue par e-mail, sous la forme F-2026-0001."
        >
          <Input
            name="number"
            required
            minLength={4}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="F-2026-0001"
            defaultValue={defaultNumber}
            className="font-mono tracking-wide"
          />
        </Field>

        <Field
          label="Nom de votre entreprise"
          required
          hint={
            hasOrganization
              ? 'Votre espace existe déjà : ce nom ne sera pas modifié.'
              : 'Tel qu’il doit apparaître sur vos documents.'
          }
        >
          <Input
            name="organizationName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={defaultOrganizationName}
            readOnly={hasOrganization}
          />
        </Field>

        <Switch
          name="acceptTerms"
          label="J’accepte les conditions générales de vente"
          description={
            <>
              Vous pouvez les relire à tout moment :{' '}
              <Link href="/cgv" className="underline underline-offset-4" target="_blank">
                conditions générales de vente
              </Link>
              .
            </>
          }
        />

        <SubmitButton />

        <p className="text-xs leading-relaxed text-[var(--muted)]">
          La facture doit avoir été envoyée à l’adresse e-mail de ce compte. Si vous l’avez reçue
          sur une autre adresse, connectez-vous avec celle-ci ou{' '}
          <Link href="/contact" className="underline underline-offset-4">
            écrivez-nous
          </Link>
          .
        </p>
      </form>
    </Panel>
  );
}
