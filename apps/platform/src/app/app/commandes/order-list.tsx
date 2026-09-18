'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, EmptyState, Icon, Panel, StatusPill } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { updateShopOrderStatusAction } from './actions';

export interface ShopOrderView {
  id: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
  totalLabel: string;
  fulfillmentLabel: string;
  shippingLine: string | null;
  createdAtIso: string;
  createdAtLabel: string;
  paidAtLabel: string | null;
  statusLabel: string;
  statusHelp?: string;
  statusTone: StatusTone;
  items: Array<{ id: string; label: string; quantity: number; totalLabel: string }>;
  actions: Array<{ status: string; label: string }>;
}

function TransitionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending} loadingLabel="Mise à jour">
      {label}
    </Button>
  );
}

export function OrderList({ orders }: { orders: ShopOrderView[] }) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateShopOrderStatusAction,
    IDLE_STATE,
  );

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="shopping-bag" size={24} />}
        title="Aucune commande"
        description="Les commandes passées sur votre boutique apparaîtront ici dès le premier paiement confirmé."
      />
    );
  }

  return (
    <div className="space-y-3">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.status === 'success' && state.message ? (
        <Alert tone="success" live="status">
          {state.message}
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Panel level={1} padding="md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-[var(--muted)]">{order.reference}</span>{' '}
                    · {order.totalLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                    {order.customerName} ·{' '}
                    <a
                      href={`mailto:${order.customerEmail}`}
                      className="underline underline-offset-4"
                    >
                      {order.customerEmail}
                    </a>
                    {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    <time dateTime={order.createdAtIso}>{order.createdAtLabel}</time> ·{' '}
                    {order.fulfillmentLabel}
                    {order.paidAtLabel ? ` · Payée le ${order.paidAtLabel}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <StatusPill tone={order.statusTone}>{order.statusLabel}</StatusPill>
                  {order.statusHelp ? (
                    <p className="mt-1 max-w-[16rem] text-xs text-[var(--muted)]">
                      {order.statusHelp}
                    </p>
                  ) : null}
                </div>
              </div>

              {order.items.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-3 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span className="min-w-0 truncate text-[var(--foreground-muted)]">
                        {item.quantity} × {item.label}
                      </span>
                      <span className="shrink-0 tabular-nums">{item.totalLabel}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {order.shippingLine ? (
                <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                  Livraison : {order.shippingLine}
                </p>
              ) : null}

              {order.customerNote ? (
                <p className="mt-3 max-w-prose rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
                  {order.customerNote}
                </p>
              ) : null}

              {order.actions.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                  {order.actions.map((transition) => (
                    <form key={transition.status} action={action}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="status" value={transition.status} />
                      <TransitionButton label={transition.label} />
                    </form>
                  ))}
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
