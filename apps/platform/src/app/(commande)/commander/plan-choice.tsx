'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Icon, cn } from '@stax/ui';
import { IDLE_STATE as STEP_IDLE } from '~/lib/form-state';
import { choosePlanAction, type StepState } from './actions';

export interface PlanOption {
  slug: string;
  name: string;
  tagline: string | null;
  badge: string | null;
  /** Categorie superieure (Exceptionnel) : lue dans le catalogue. */
  signature: boolean;
  /** « 2 à 4 semaines ». */
  deliveryLabel: string;
  setupPrice: string;
  /** Deja formate avec sa periodicite : « 12 € / mois ». */
  maintenancePrice: string;
  features: string[];
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} disabled={disabled} loadingLabel="Chargement">
      Continuer
    </Button>
  );
}

export function PlanChoice({ plans, selected }: { plans: PlanOption[]; selected: string | null }) {
  const [choice, setChoice] = useState<string | null>(selected ?? plans[0]?.slug ?? null);
  const [state, action] = useActionState<StepState, FormData>(choosePlanAction, STEP_IDLE);

  return (
    <form action={action} className="mt-8">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert" className="mb-6">
          {state.message}
        </Alert>
      ) : null}

      <fieldset>
        <legend className="sr-only">Offres disponibles</legend>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const active = choice === plan.slug;
            return (
              <label
                key={plan.slug}
                className={cn(
                  'relative flex cursor-pointer flex-col rounded-[var(--radius-lg)] border p-6 transition-colors',
                  active
                    ? 'border-[var(--accent)] bg-[var(--surface-elevated)]'
                    : plan.signature
                      ? 'border-[var(--glacier)]/40 bg-[linear-gradient(180deg,rgb(157_219_255/0.07),transparent_40%)] hover:border-[var(--glacier)]/70'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                )}
              >
                <input
                  type="radio"
                  name="planSlug"
                  value={plan.slug}
                  checked={active}
                  onChange={() => setChoice(plan.slug)}
                  className="sr-only"
                />

                <div className="flex items-start justify-between gap-3">
                  <div>
                    {plan.signature ? (
                      <p className="mb-1 text-2xs font-medium tracking-[0.18em] text-[var(--accent-text)] uppercase">
                        Catégorie signature
                      </p>
                    ) : null}
                    <h2 className="text-base font-medium">{plan.name}</h2>
                    {plan.tagline ? (
                      <p className="mt-1 text-sm text-[var(--foreground-muted)]">{plan.tagline}</p>
                    ) : null}
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                        : 'border-[var(--border-strong)]',
                    )}
                  >
                    {active ? <Icon name="badge-check" size={12} /> : null}
                  </span>
                </div>

                <p className="mt-5 text-2xl font-medium tracking-[-0.02em]">
                  {plan.setupPrice}{' '}
                  <span className="text-sm font-normal text-[var(--muted)]">HT</span>
                </p>
                <p className="text-sm text-[var(--foreground-muted)]">
                  puis {plan.maintenancePrice} HT de maintenance, dès la livraison
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Réalisation en {plan.deliveryLabel} après réception de vos éléments
                </p>

                <ul className="mt-5 space-y-2 text-sm text-[var(--foreground-muted)]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Icon name="badge-check" size={14} className="mt-0.5 text-[var(--success)]" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan.badge ? (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-2xs font-medium text-[var(--accent-foreground)]">
                    {plan.badge}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <SubmitButton disabled={choice === null} />
        <p className="text-sm text-[var(--muted)]">
          Aucun paiement à cette étape. Vous pourrez revenir en arrière à tout moment.
        </p>
      </div>
    </form>
  );
}
