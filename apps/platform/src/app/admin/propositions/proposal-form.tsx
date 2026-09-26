'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input, Panel, Select, Textarea } from '@stax/ui';
import { createProposalAction, type ProposalActionState } from './actions';

export interface ProposalSiteChoice {
  id: string;
  name: string;
}

export interface ProposalPlanChoice {
  id: string;
  label: string;
}

const IDLE: ProposalActionState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Vérification du site et envoi">
      Envoyer la proposition
    </Button>
  );
}

/** Code et lien à transmettre soi-même quand l'e-mail n'est pas parti. */
export function CodeHandOff({ code, claimUrl }: { code: string; claimUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(true));
  };
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
      <div>
        <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
          Code du prospect (affiché une seule fois)
        </p>
        <p className="mt-1 font-mono text-xl tracking-[0.14em]">{code}</p>
      </div>
      {claimUrl ? (
        <div>
          <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            Lien « Récupérer mon site »
          </p>
          <p className="mt-1 text-sm break-all">{claimUrl}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => copy(code)}>
          Copier le code
        </Button>
        {claimUrl ? (
          <Button size="sm" variant="secondary" onClick={() => copy(claimUrl)}>
            Copier le lien
          </Button>
        ) : null}
        {copied ? <span className="self-center text-xs text-[var(--muted)]">Copié.</span> : null}
      </div>
    </div>
  );
}

/**
 * « Nouvelle proposition » : après un appel concluant, envoyer au prospect le
 * lien de son site et son code. Le prix est celui de l'offre choisie, sans
 * remise ; il est figé à l'envoi.
 */
export function ProposalForm({
  sites,
  plans,
  defaultSiteId,
  startOpen,
}: {
  sites: ProposalSiteChoice[];
  plans: ProposalPlanChoice[];
  defaultSiteId: string | null;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [state, action] = useActionState(createProposalAction, IDLE);

  if (!open) {
    return (
      <div className="space-y-4">
        {state.status === 'success' && state.message ? (
          <Alert tone={state.emailSent ? 'success' : 'warning'} live="status">
            {state.message}
            {state.code ? <CodeHandOff code={state.code} claimUrl={state.claimUrl} /> : null}
          </Alert>
        ) : null}
        <Button onClick={() => setOpen(true)} disabled={sites.length === 0}>
          Nouvelle proposition
        </Button>
        {sites.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Aucun site disponible : créez d’abord le site du prospect (Sites → Créer un site),
            rattachez son dépôt et son projet Cloudflare, puis revenez ici.
          </p>
        ) : null}
      </div>
    );
  }

  if (state.status === 'success') {
    return (
      <Panel level={2} padding="lg">
        <Alert
          tone={state.emailSent ? 'success' : 'warning'}
          live="status"
          title="Proposition créée"
        >
          {state.message}
        </Alert>
        {state.code ? <CodeHandOff code={state.code} claimUrl={state.claimUrl} /> : null}
        <div className="mt-5">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Terminé
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel level={2} padding="lg">
      <h2 className="text-base font-medium">Nouvelle proposition</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
        Le prospect reçoit un e-mail avec le lien de son site et un code personnel valable 14 jours.
        Il crée son compte, voit son site, peut vous écrire, puis paie : le site lui est alors livré
        automatiquement. Le site doit donc être entièrement vérifié avant l’envoi.
      </p>

      <form action={action} className="mt-6 space-y-5" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Site préparé pour ce prospect" required>
            <Select name="siteId" required defaultValue={defaultSiteId ?? sites[0]?.id ?? ''}>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Offre convenue au téléphone"
            required
            hint="Prix du catalogue, sans remise."
          >
            <Select name="planId" required defaultValue={plans[0]?.id ?? ''}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Adresse e-mail du prospect"
            required
            hint="Le code ne fonctionnera qu’avec cette adresse."
          >
            <Input name="email" type="email" required autoComplete="off" />
          </Field>
          <Field label="Nom de l’entreprise" required>
            <Input name="companyName" required minLength={2} maxLength={160} />
          </Field>
          <Field label="Prénom du contact" hint="Pour « Bonjour Marie, » dans l’e-mail.">
            <Input name="contactName" maxLength={120} />
          </Field>
          <Field label="Téléphone">
            <Input name="phone" type="tel" maxLength={40} />
          </Field>
        </div>

        <Field
          label="Petit mot personnel (facultatif)"
          hint="Repris dans l’e-mail et sur la page du prospect. Ex. : « Ravi de notre échange de ce matin. »"
        >
          <Textarea name="message" rows={3} maxLength={2000} />
        </Field>

        <Field label="Notes internes" hint="Jamais montrées au prospect.">
          <Textarea name="internalNotes" rows={2} maxLength={4000} />
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
