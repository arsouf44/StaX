'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Panel,
  Select,
  StatusPill,
  Textarea,
  type StatusTone,
  useToast,
} from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import {
  assessBreachRiskAction,
  closeBreachAction,
  declareBreachAction,
  recordBreachNotificationAction,
} from './actions';

/**
 * Registre des violations de donnees.
 *
 * L'outil sert un moment precis : on vient de constater quelque chose, on ne
 * sait pas encore l'ampleur, et le compte a rebours a deja commence. Il
 * demande donc peu pour ouvrir l'entree, et laisse completer ensuite — parce
 * qu'attendre d'avoir tout compris pour ecrire la premiere ligne est
 * exactement ce qui fait rater les 72 heures.
 */

export interface BreachView {
  id: string;
  reference: string;
  nature: string;
  description: string;
  discoveredLabel: string;
  deadlineLabel: string;
  /** Heures restantes, calculees cote serveur. Negatif = echeance depassee. */
  hoursLeft: number;
  riskLevel: 'pending' | 'none' | 'low' | 'high';
  subjectCategories: string[];
  dataCategories: string[];
  approximateSubjects: number | null;
  cnilNotifiedLabel: string | null;
  subjectsNotifiedLabel: string | null;
  closedLabel: string | null;
}

const NATURE_LABELS: Record<string, string> = {
  confidentiality: 'Confidentialité (accès ou divulgation non autorisés)',
  integrity: 'Intégrité (altération non autorisée)',
  availability: 'Disponibilité (perte ou indisponibilité)',
  combined: 'Combinée',
};

const RISK_LABELS: Record<BreachView['riskLevel'], { label: string; tone: StatusTone }> = {
  pending: { label: 'Risque non évalué', tone: 'warning' },
  none: { label: 'Aucun risque — non notifiable', tone: 'neutral' },
  low: { label: 'Risque — notification CNIL', tone: 'warning' },
  high: { label: 'Risque élevé — personnes à informer', tone: 'danger' },
};

function countdown(hoursLeft: number, notified: boolean): { label: string; tone: StatusTone } {
  if (notified) return { label: 'CNIL notifiée', tone: 'success' };
  if (hoursLeft < 0)
    return { label: `Échéance dépassée de ${Math.abs(hoursLeft)} h`, tone: 'danger' };
  if (hoursLeft <= 24) return { label: `${hoursLeft} h restantes`, tone: 'danger' };
  return { label: `${hoursLeft} h restantes`, tone: 'warning' };
}

export function BreachRegister({ breaches }: { breaches: BreachView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [declareOpen, setDeclareOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(declareBreachAction, IDLE_STATE);

  const [assessing, setAssessing] = useState<BreachView | null>(null);
  const [riskLevel, setRiskLevel] = useState<'none' | 'low' | 'high'>('low');
  const [justification, setJustification] = useState('');

  const [notifying, setNotifying] = useState<{
    breach: BreachView;
    target: 'cnil' | 'subjects';
  } | null>(null);
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);

  const announce = (result: ActionState) => {
    if (result.status === 'error') toast.error(result.message ?? 'Opération refusée.');
    else if (result.message) toast.success(result.message);
  };

  const open = breaches.filter((breach) => breach.closedLabel === null);
  const closed = breaches.filter((breach) => breach.closedLabel !== null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-xl font-medium tracking-[-0.02em]">Registre des violations</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            L’article 33.5 du RGPD impose de documenter <strong>toute</strong> violation, y compris
            celles que nous choisissons de ne pas notifier. Ouvrez une entrée dès le constat : une
            entrée incomplète dans les délais vaut mieux qu’une entrée parfaite trop tard.
          </p>
        </div>
        <Button onClick={() => setDeclareOpen(true)}>Déclarer une violation</Button>
      </div>

      {state.status === 'success' && state.message ? (
        <Alert tone="success" live="status">
          {state.message}
        </Alert>
      ) : null}

      {open.length === 0 ? (
        <Panel level={1} padding="lg">
          <p className="text-sm text-[var(--foreground-muted)]">
            Aucune violation en cours de traitement. Ce n’est pas une preuve qu’il n’y en a pas eu :
            c’est ce que nous avons constaté et consigné.
          </p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {open.map((breach) => {
            const risk = RISK_LABELS[breach.riskLevel];
            const clock = countdown(breach.hoursLeft, breach.cnilNotifiedLabel !== null);
            return (
              <li key={breach.id}>
                <Panel level={1} padding="lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium">{breach.reference}</span>
                        <StatusPill tone={risk.tone}>{risk.label}</StatusPill>
                        <StatusPill tone={clock.tone}>{clock.label}</StatusPill>
                      </p>
                      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                        {NATURE_LABELS[breach.nature] ?? breach.nature}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 max-w-prose text-sm leading-relaxed">{breach.description}</p>

                  <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1.5">
                      <dt className="text-[var(--foreground-muted)]">Découverte</dt>
                      <dd>{breach.discoveredLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1.5">
                      <dt className="text-[var(--foreground-muted)]">Échéance 72 h</dt>
                      <dd>{breach.deadlineLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1.5">
                      <dt className="text-[var(--foreground-muted)]">Personnes concernées</dt>
                      <dd>
                        {breach.approximateSubjects === null
                          ? 'À déterminer'
                          : breach.approximateSubjects.toLocaleString('fr-FR')}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1.5">
                      <dt className="text-[var(--foreground-muted)]">Données</dt>
                      <dd>
                        {breach.dataCategories.length > 0
                          ? breach.dataCategories.join(', ')
                          : 'À déterminer'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setRiskLevel(breach.riskLevel === 'pending' ? 'low' : breach.riskLevel);
                        setJustification('');
                        setDialogError(null);
                        setAssessing(breach);
                      }}
                    >
                      Évaluer le risque
                    </Button>

                    {breach.riskLevel !== 'none' && breach.cnilNotifiedLabel === null ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setReference('');
                          setDelayReason('');
                          setDialogError(null);
                          setNotifying({ breach, target: 'cnil' });
                        }}
                      >
                        Enregistrer la notification CNIL
                      </Button>
                    ) : null}

                    {breach.riskLevel === 'high' && breach.subjectsNotifiedLabel === null ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setMethod('');
                          setDialogError(null);
                          setNotifying({ breach, target: 'subjects' });
                        }}
                      >
                        Enregistrer l’information des personnes
                      </Button>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(() => {
                          void closeBreachAction({ id: breach.id }).then((result) => {
                            announce(result);
                            router.refresh();
                          });
                        });
                      }}
                    >
                      Clôturer
                    </Button>
                  </div>

                  {breach.cnilNotifiedLabel ? (
                    <p className="mt-4 text-xs text-[var(--muted)]">
                      CNIL notifiée le {breach.cnilNotifiedLabel}
                      {breach.subjectsNotifiedLabel
                        ? ` · personnes informées le ${breach.subjectsNotifiedLabel}`
                        : ''}
                    </p>
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">Entrées clôturées</h2>
          <Panel level={1} padding="lg">
            <ul className="divide-y divide-[var(--border)]">
              {closed.map((breach) => (
                <li
                  key={breach.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{breach.reference}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Découverte {breach.discoveredLabel} · {RISK_LABELS[breach.riskLevel].label} ·
                      clôturée {breach.closedLabel}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}

      <Dialog
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        size="lg"
        title="Déclarer une violation"
        description="Ouvrez l’entrée maintenant, complétez-la ensuite. L’échéance court depuis la découverte, pas depuis cette saisie."
      >
        <form action={action} className="space-y-4">
          {state.status === 'error' && state.message ? (
            <Alert tone="danger" live="alert">
              {state.message}
            </Alert>
          ) : null}

          <Field
            label="Date et heure de découverte"
            required
            hint="Le moment où nous en avons eu connaissance. C’est lui qui déclenche les 72 heures."
          >
            <Input type="datetime-local" name="discoveredAt" required />
          </Field>

          <Field label="Date des faits (si connue)">
            <Input type="datetime-local" name="occurredAt" />
          </Field>

          <Field label="Nature" required>
            <Select name="nature" defaultValue="confidentiality">
              <option value="confidentiality">Confidentialité — accès ou divulgation</option>
              <option value="integrity">Intégrité — altération</option>
              <option value="availability">Disponibilité — perte ou indisponibilité</option>
              <option value="combined">Combinée</option>
            </Select>
          </Field>

          <Field
            label="Que s’est-il passé ?"
            required
            hint="Factuel. Ce texte sera relu plus tard, peut-être par une autorité de contrôle."
          >
            <Textarea name="description" rows={4} required minLength={20} maxLength={4000} />
          </Field>

          <Field
            label="Catégories de personnes"
            hint="Séparées par des virgules : clients, salariés, visiteurs…"
          >
            <Input name="subjectCategories" maxLength={300} />
          </Field>

          <Field
            label="Catégories de données"
            hint="Identification, coordonnées, données de paiement, contenus…"
          >
            <Input name="dataCategories" maxLength={300} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personnes concernées (approx.)">
              <Input type="number" name="approximateSubjects" min={0} />
            </Field>
            <Field label="Enregistrements concernés (approx.)">
              <Input type="number" name="approximateRecords" min={0} />
            </Field>
          </div>

          <Field label="Conséquences probables">
            <Textarea name="likelyConsequences" rows={3} maxLength={2000} />
          </Field>

          <Field label="Mesures prises ou envisagées">
            <Textarea name="measuresTaken" rows={3} maxLength={2000} />
          </Field>

          <Button type="submit" block>
            Enregistrer l’entrée
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={assessing !== null}
        onClose={() => setAssessing(null)}
        title={`Évaluer le risque — ${assessing?.reference ?? ''}`}
        description="Le risque s’apprécie pour les droits et libertés des personnes, pas pour l’entreprise."
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setAssessing(null)}>
              Annuler
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (!assessing) return;
                setDialogError(null);
                startTransition(() => {
                  void assessBreachRiskAction({
                    id: assessing.id,
                    riskLevel,
                    justification: justification.trim() === '' ? undefined : justification.trim(),
                  }).then((result) => {
                    if (result.status === 'error') {
                      setDialogError(result.message ?? 'Évaluation refusée.');
                      return;
                    }
                    announce(result);
                    setAssessing(null);
                    router.refresh();
                  });
                });
              }}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {dialogError ? (
            <Alert tone="danger" live="alert">
              {dialogError}
            </Alert>
          ) : null}

          <Field label="Niveau de risque">
            <Select
              value={riskLevel}
              onChange={(event) => setRiskLevel(event.target.value as 'none' | 'low' | 'high')}
            >
              <option value="none">Aucun risque — pas de notification</option>
              <option value="low">Risque — notification à la CNIL</option>
              <option value="high">Risque élevé — personnes à informer aussi</option>
            </Select>
          </Field>

          {riskLevel === 'none' ? (
            <Field
              label="Pourquoi les droits et libertés ne sont-ils pas menacés ?"
              required
              hint="Obligatoire. Ne pas notifier est défendable ; ne pas le justifier ne l’est pas."
            >
              <Textarea
                rows={4}
                value={justification}
                minLength={20}
                maxLength={2000}
                onChange={(event) => setJustification(event.target.value)}
              />
            </Field>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={notifying !== null}
        onClose={() => setNotifying(null)}
        title={
          notifying?.target === 'cnil'
            ? 'Notification à la CNIL'
            : 'Information des personnes concernées'
        }
        description={
          notifying?.target === 'cnil'
            ? 'À enregistrer une fois la notification réellement envoyée. Cette inscription est définitive.'
            : 'À enregistrer une fois les personnes réellement informées. Cette inscription est définitive.'
        }
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setNotifying(null)}>
              Annuler
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (!notifying) return;
                setDialogError(null);
                startTransition(() => {
                  void recordBreachNotificationAction({
                    id: notifying.breach.id,
                    target: notifying.target,
                    reference: reference.trim() === '' ? undefined : reference.trim(),
                    method: method.trim() === '' ? undefined : method.trim(),
                    delayJustification: delayReason.trim() === '' ? undefined : delayReason.trim(),
                  }).then((result) => {
                    if (result.status === 'error') {
                      setDialogError(result.message ?? 'Enregistrement refusé.');
                      return;
                    }
                    announce(result);
                    setNotifying(null);
                    router.refresh();
                  });
                });
              }}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {dialogError ? (
            <Alert tone="danger" live="alert">
              {dialogError}
            </Alert>
          ) : null}

          {notifying?.target === 'cnil' ? (
            <>
              <Field label="Référence du récépissé CNIL">
                <Input
                  value={reference}
                  maxLength={120}
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
              {notifying.breach.hoursLeft < 0 ? (
                <Field
                  label="Motif du retard"
                  required
                  hint="L’article 33.1 impose d’indiquer pourquoi la notification dépasse 72 heures."
                >
                  <Textarea
                    rows={3}
                    value={delayReason}
                    maxLength={2000}
                    onChange={(event) => setDelayReason(event.target.value)}
                  />
                </Field>
              ) : null}
            </>
          ) : (
            <Field
              label="Comment les personnes ont-elles été informées ?"
              hint="E-mail individuel, courrier, communication publique en cas d’effort disproportionné."
            >
              <Input
                value={method}
                maxLength={300}
                onChange={(event) => setMethod(event.target.value)}
              />
            </Field>
          )}
        </div>
      </Dialog>
    </div>
  );
}
