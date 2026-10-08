'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox, Field, Input, Select, Textarea, useToast } from '@nemasus/ui';
import {
  cancelOrderAction,
  confirmPaymentAction,
  createOrderAction,
  reissueCodeAction,
  requestPaymentAction,
  resendPaymentAction,
  revokeAccessCodeAction,
  saveNotesAction,
  type OrderActionState,
} from './actions';

const IDLE: OrderActionState = { status: 'idle' };

function Submit({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
      {children}
    </Button>
  );
}

function Outcome({ state }: { state: OrderActionState }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <Alert tone={state.status === 'success' ? 'success' : 'warning'} live="status">
      {state.message}
      {state.code ? (
        <CodeHandOff
          code={state.code}
          accessUrl={state.accessUrl}
          continueHref={state.continueHref}
        />
      ) : null}
    </Alert>
  );
}

/** Code et lien à transmettre soi-même quand l'e-mail n'est pas parti. */
export function CodeHandOff({
  code,
  accessUrl,
  continueHref,
}: {
  code: string;
  accessUrl?: string;
  continueHref?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (value: string, label: string) => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(label));
  };
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <p className="kicker">Code d’accès du client (affiché une seule fois)</p>
        <p className="mt-1 font-mono text-xl tracking-[0.14em]" data-testid="access-code">
          {code}
        </p>
      </div>
      {accessUrl ? (
        <div>
          <p className="kicker">Lien « Accès client »</p>
          <p className="mt-1 text-sm break-all">{accessUrl}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => copy(code, 'Code copié.')}>
          Copier le code
        </Button>
        {accessUrl ? (
          <Button size="sm" variant="secondary" onClick={() => copy(accessUrl, 'Lien copié.')}>
            Copier le lien
          </Button>
        ) : null}
        {copied ? <span className="self-center text-xs text-[var(--muted)]">{copied}</span> : null}
      </div>
      {continueHref ? (
        <p className="text-sm">
          {/* Rechargement complet : la page se met à jour, le code n'y figure plus. */}
          <a href={continueHref} className="underline underline-offset-4">
            J’ai noté le code — mettre la commande à jour
          </a>
        </p>
      ) : null}
    </div>
  );
}

export function PaymentRequestForm({
  orderId,
  defaultAmount,
  defaultMessage,
  bankConfigured,
  again,
}: {
  orderId: string;
  defaultAmount: string;
  defaultMessage: string;
  bankConfigured: boolean;
  again: boolean;
}) {
  const [state, action] = useActionState(requestPaymentAction, IDLE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Outcome state={state} />
      {!bankConfigured ? (
        <Alert tone="warning" live="status" title="Coordonnées bancaires absentes">
          Renseignez BANK_TRANSFER_HOLDER et BANK_TRANSFER_IBAN (et si possible BANK_TRANSFER_BIC)
          dans les variables d’environnement du serveur : sans elles, les modalités ne peuvent pas
          partir.
        </Alert>
      ) : null}
      <input type="hidden" name="orderId" value={orderId} />
      <Field
        label="Montant à régler (TTC, en euros)"
        required
        hint="Le montant convenu avec le client. Il figure dans l’e-mail, avec l’IBAN et la référence."
      >
        <Input
          name="amount"
          inputMode="decimal"
          defaultValue={defaultAmount}
          placeholder="1 200"
          required
          className="max-w-[12rem]"
        />
      </Field>
      <Field
        label="Message au client (facultatif)"
        hint="Repris en tête de l’e-mail : ce que comprend le montant, une échéance, un mot personnel."
      >
        <Textarea name="message" rows={3} maxLength={2000} defaultValue={defaultMessage} />
      </Field>
      <Submit pendingLabel="Envoi des modalités">
        {again ? 'Modifier et renvoyer les modalités' : 'Envoyer les modalités de paiement'}
      </Submit>
    </form>
  );
}

export function ConfirmPaymentForm({
  orderId,
  defaultAmount,
  sites,
}: {
  orderId: string;
  defaultAmount: string;
  /** Sites préparés à l'avance, sans client, que la commande peut reprendre. */
  sites: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState(confirmPaymentAction, IDLE);
  if (state.status === 'success' || state.code) {
    return <Outcome state={state} />;
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <Outcome state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Montant reçu (en euros)" required>
          <Input name="amount" inputMode="decimal" defaultValue={defaultAmount} required />
        </Field>
        <Field
          label="Validité du code"
          hint="Le code ne sert qu’une fois. Passé ce délai, il faut en émettre un nouveau."
        >
          <Select name="validDays" defaultValue="30">
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
            <option value="30">30 jours</option>
            <option value="60">60 jours</option>
            <option value="90">90 jours</option>
          </Select>
        </Field>
      </div>
      {sites.length > 0 ? (
        <Field
          label="Site déjà préparé (facultatif)"
          hint="Laissez vide pour créer un espace neuf. Choisissez un site préparé à l’avance pour ce client (vente par téléphone)."
        >
          <Select name="siteId" defaultValue="">
            <option value="">Créer un nouvel espace pour ce client</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Checkbox
        name="confirmReceived"
        required
        label="Je confirme que le virement est arrivé sur le compte bancaire."
        description="L’espace du client est alors créé et son code d’accès personnel lui est envoyé par e-mail."
      />
      <Submit pendingLabel="Création de l’espace et envoi du code">
        Confirmer le paiement et envoyer le code
      </Submit>
    </form>
  );
}

export function ReissueCodeForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(reissueCodeAction, IDLE);
  return (
    <form action={action} className="space-y-3" noValidate>
      <Outcome state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Validité">
          <Select name="validDays" defaultValue="30">
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
            <option value="30">30 jours</option>
            <option value="60">60 jours</option>
          </Select>
        </Field>
        <Submit pendingLabel="Envoi du nouveau code">Envoyer un nouveau code</Submit>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Les codes encore ouverts de cette commande sont désactivés à l’envoi du nouveau.
      </p>
    </form>
  );
}

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (operation: () => Promise<OrderActionState>) =>
    start(async () => {
      const result = await operation();
      if (result.status === 'error') toast.error(result.message ?? 'Action refusée.');
      else if (result.message) toast.success(result.message);
      router.refresh();
    });
  return { pending, run };
}

export function RevokeCodeButton({ codeId, orderId }: { codeId: string; orderId: string }) {
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => {
        if (window.confirm('Désactiver ce code ? Il ne pourra plus être utilisé.')) {
          run(() => revokeAccessCodeAction({ codeId, orderId }));
        }
      }}
    >
      Désactiver
    </Button>
  );
}

export function ResendPaymentButton({ orderId }: { orderId: string }) {
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => run(() => resendPaymentAction({ orderId }))}
    >
      Renvoyer un rappel
    </Button>
  );
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(cancelOrderAction, IDLE);
  const [open, setOpen] = useState(false);
  if (!open && state.status !== 'error') {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Annuler la commande
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3" noValidate>
      <Outcome state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Motif (facultatif, interne)">
        <Input name="reason" maxLength={500} />
      </Field>
      <div className="flex gap-2">
        <Submit pendingLabel="Annulation">Confirmer l’annulation</Submit>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Garder la commande
        </Button>
      </div>
    </form>
  );
}

export function NotesForm({ orderId, notes }: { orderId: string; notes: string }) {
  const [state, action] = useActionState(saveNotesAction, IDLE);
  return (
    <form action={action} className="space-y-3" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Notes internes" hint="Jamais montrées au client.">
        <Textarea name="notes" rows={4} maxLength={4000} defaultValue={notes} />
      </Field>
      <div className="flex items-center gap-3">
        <Submit pendingLabel="Enregistrement">Enregistrer les notes</Submit>
        {state.status === 'success' ? (
          <span className="text-xs text-[var(--muted)]">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

export function CreateOrderForm({
  businesses,
}: {
  businesses: Array<{ id: string; name: string; sector: string }>;
}) {
  const [state, action] = useActionState(createOrderAction, IDLE);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom de l’entreprise" required>
          <Input name="companyName" required minLength={2} maxLength={160} />
        </Field>
        <Field
          label="Adresse e-mail du client"
          required
          hint="Elle recevra les modalités de paiement, puis le code d’accès. Faites-la épeler."
        >
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Prénom">
          <Input name="firstName" maxLength={80} />
        </Field>
        <Field label="Nom">
          <Input name="lastName" maxLength={80} />
        </Field>
        <Field label="Téléphone">
          <Input name="phone" type="tel" maxLength={40} />
        </Field>
        <Field label="Ville">
          <Input name="city" maxLength={120} />
        </Field>
        <Field label="Métier">
          <Select name="businessType" defaultValue="">
            <option value="">À préciser</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Le projet" hint="Ce qui a été convenu avec le client.">
        <Textarea name="description" rows={4} maxLength={4000} />
      </Field>
      <Field label="Notes internes" hint="Jamais montrées au client.">
        <Textarea name="internalNotes" rows={2} maxLength={4000} />
      </Field>
      <Submit pendingLabel="Enregistrement">Enregistrer la commande</Submit>
    </form>
  );
}
