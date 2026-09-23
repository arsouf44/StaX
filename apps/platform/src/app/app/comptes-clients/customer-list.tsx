'use client';

import { useActionState, useState } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { eraseCustomerAction, toggleCustomerBlockAction } from './actions';

export interface CustomerView {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdLabel: string;
  lastLoginLabel: string | null;
  verified: boolean;
  blocked: boolean;
}

export function CustomerList({
  customers,
  canManage,
}: {
  customers: CustomerView[];
  canManage: boolean;
}) {
  const [blockState, blockAction, blockPending] = useActionState<ActionState, FormData>(
    toggleCustomerBlockAction,
    IDLE_STATE,
  );
  const [eraseState, eraseAction, erasePending] = useActionState<ActionState, FormData>(
    eraseCustomerAction,
    IDLE_STATE,
  );
  const [toErase, setToErase] = useState<CustomerView | null>(null);

  const feedback = [blockState, eraseState].find(
    (state) => state.status !== 'idle' && state.message,
  );

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="user-round-check" size={24} />}
        title="Aucun compte client pour l’instant"
        description="Quand un visiteur crée son espace sur votre site pour suivre ses commandes ou réservations, il apparaît ici."
      />
    );
  }

  return (
    <div className="space-y-4">
      {feedback ? (
        <Alert tone={feedback.status === 'error' ? 'danger' : 'success'} live="status">
          {feedback.message}
        </Alert>
      ) : null}

      <TableWrapper label="Comptes clients de votre site">
        <Table>
          <THead>
            <TR>
              <TH>Client</TH>
              <TH>Téléphone</TH>
              <TH>Inscrit le</TH>
              <TH>Dernière connexion</TH>
              <TH>État</TH>
              {canManage ? <TH className="text-right">Actions</TH> : null}
            </TR>
          </THead>
          <TBody>
            {customers.map((customer) => (
              <TR key={customer.id} data-testid="customer-row">
                <TD>
                  <p className="font-medium">{customer.name ?? '—'}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{customer.email}</p>
                </TD>
                <TD>{customer.phone ?? '—'}</TD>
                <TD>{customer.createdLabel}</TD>
                <TD>{customer.lastLoginLabel ?? 'Jamais'}</TD>
                <TD>
                  <StatusPill
                    tone={customer.blocked ? 'danger' : customer.verified ? 'success' : 'neutral'}
                  >
                    {customer.blocked ? 'Bloqué' : customer.verified ? 'Actif' : 'Non confirmé'}
                  </StatusPill>
                </TD>
                {canManage ? (
                  <TD>
                    <div className="flex justify-end gap-1">
                      <form action={blockAction}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input type="hidden" name="blocked" value={String(!customer.blocked)} />
                        <Button type="submit" variant="ghost" size="sm" disabled={blockPending}>
                          {customer.blocked ? 'Débloquer' : 'Bloquer'}
                        </Button>
                      </form>
                      <Button variant="ghost" size="sm" onClick={() => setToErase(customer)}>
                        Supprimer
                      </Button>
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrapper>

      <ConfirmDialog
        open={toErase !== null}
        onClose={() => setToErase(null)}
        loading={erasePending}
        title="Supprimer définitivement ce compte ?"
        description={`Le compte de ${toErase?.email ?? ''} et ses données personnelles seront effacés. Cette personne ne pourra plus se connecter. Les commandes et réservations passées restent conservées, comme la loi l’impose. C’est la réponse à une demande d’effacement (RGPD).`}
        confirmLabel="Supprimer définitivement"
        tone="danger"
        onConfirm={() => {
          if (!toErase) return;
          const data = new FormData();
          data.set('customerId', toErase.id);
          setToErase(null);
          eraseAction(data);
        }}
      />
    </div>
  );
}
