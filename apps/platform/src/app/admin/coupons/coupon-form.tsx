'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Dialog, Field, Input, Panel, Select, useToast } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { createCouponAction, deactivateCouponAction } from './actions';

/**
 * Creation et retrait d'un code promotionnel.
 *
 * Un code ne se modifie pas : des commandes peuvent deja s'y referer, et
 * changer la remise apres coup rendrait leur historique incoherent. On le
 * desactive, on en cree un autre.
 */

export interface ActiveCoupon {
  id: string;
  code: string;
  label: string;
  summary: string;
}

export function CouponActions({ active }: { active: ActiveCoupon[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [pending, startTransition] = useTransition();
  const [state, action] = useActionState<ActionState, FormData>(createCouponAction, IDLE_STATE);

  return (
    <div className="space-y-4">
      {state.status === 'success' && state.message ? (
        <Alert tone="success" live="status">
          {state.message}
        </Alert>
      ) : null}

      <Panel level={1} padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-sm font-medium">Codes actifs</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              La remise est recalculée par la base à chaque commande : un code ne fixe jamais un
              montant à lui seul.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            Créer un code
          </Button>
        </div>

        {active.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Aucun code actif.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {active.map((coupon) => (
              <li
                key={coupon.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium">{coupon.code}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {coupon.label} · {coupon.summary}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(() => {
                      void deactivateCouponAction({ id: coupon.id }).then((result) => {
                        if (result.status === 'error') {
                          toast.error(result.message ?? 'Action refusée.');
                        } else if (result.message) {
                          toast.success(result.message);
                        }
                        router.refresh();
                      });
                    });
                  }}
                >
                  Désactiver
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Créer un code promotionnel"
        description="Le code ne sera plus modifiable une fois créé : des commandes pourront s’y référer."
      >
        <form action={action} className="space-y-4">
          {state.status === 'error' && state.message ? (
            <Alert tone="danger" live="alert">
              {state.message}
            </Alert>
          ) : null}

          <Field label="Code" required hint="Lettres, chiffres et tirets. Mis en majuscules.">
            <Input
              name="code"
              required
              minLength={3}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
            />
          </Field>

          <Field
            label="Libellé interne"
            required
            hint="Pourquoi ce code existe, pour s’en souvenir."
          >
            <Input name="label" required minLength={3} maxLength={120} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type de remise">
              <Select
                name="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as 'percent' | 'amount')}
              >
                <option value="percent">Pourcentage</option>
                <option value="amount">Montant fixe</option>
              </Select>
            </Field>
            <Field
              label={kind === 'percent' ? 'Pourcentage' : 'Montant en euros'}
              required
              hint={kind === 'percent' ? 'Entre 1 et 100.' : 'En euros entiers.'}
            >
              <Input
                name="value"
                type="number"
                required
                min={1}
                max={kind === 'percent' ? 100 : undefined}
              />
            </Field>
          </div>

          <Field label="Porte sur">
            <Select name="appliesTo" defaultValue="setup">
              <option value="setup">La création du site</option>
              <option value="maintenance">La maintenance mensuelle</option>
              <option value="both">Les deux</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Utilisations maximum" hint="Laisser vide pour un usage illimité.">
              <Input name="maxRedemptions" type="number" min={1} />
            </Field>
            <Field label="Valable jusqu’au" hint="Laisser vide pour aucune échéance.">
              <Input name="validUntil" type="date" />
            </Field>
          </div>

          <Button type="submit" block>
            Créer le code
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
