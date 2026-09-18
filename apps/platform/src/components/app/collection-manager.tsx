'use client';

import { useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
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
import { FieldControl, SubmitButton, type ClientField } from './form-fields';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import {
  deleteCollectionItemAction,
  moveCollectionItemAction,
  saveCollectionItemAction,
  toggleCollectionVisibilityAction,
} from '~/app/app/collection-actions';

/**
 * Gestionnaire de collection.
 *
 * Une seule interface pour la carte d'un restaurant, les prestations d'un
 * artisan, les biens d'une agence ou les avis d'un salon. Elle ne connait rien
 * du metier : elle affiche les champs que le serveur lui decrit.
 *
 * Aucun libelle technique n'apparait ici. Le client lit « Prix », « Visible »,
 * « Section » — jamais `price_cents`, `is_visible` ni `category_id`.
 */

export interface CollectionRow {
  id: string;
  /** Valeurs deja mises en forme pour l'affichage du tableau. */
  display: Record<string, string>;
  /** Valeurs brutes destinees au formulaire d'edition. */
  form: Record<string, string | boolean | string[]>;
  visible: boolean | null;
}

export interface CollectionManagerProps {
  collection: string;
  title: string;
  description: string;
  icon: string;
  singular: string;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  fields: ClientField[];
  rows: CollectionRow[];
  canWrite: boolean;
  sortable: boolean;
  hasVisibility: boolean;
  /** Message de quota, quand l'offre limite le nombre d'elements. */
  quotaNotice?: string | null;
  /** Bloque l'ajout : quota atteint, ou prerequis manquant. */
  addBlockedReason?: string | null;
}

function IconSubmit({ label, icon }: { label: string; icon: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={pending}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--foreground-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

export function CollectionManager(props: CollectionManagerProps) {
  const [editing, setEditing] = useState<CollectionRow | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CollectionRow | null>(null);
  const [saveState, setSaveState] = useState<ActionState>(IDLE_STATE);
  const [banner, setBanner] = useState<ActionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  // Les actions sont appelees directement plutot que via `useActionState` :
  // la fermeture du formulaire appartient au gestionnaire d'evenement, pas a un
  // effet. Le formulaire ne se ferme donc que si l'enregistrement a REELLEMENT
  // abouti — une erreur reste lisible a l'ecran.
  const saveAction = (formData: FormData) =>
    saveCollectionItemAction(IDLE_STATE, formData).then((result) => {
      setSaveState(result);
      if (result.status === 'success') setEditing(null);
    });

  const deleteAction = (formData: FormData) =>
    deleteCollectionItemAction(IDLE_STATE, formData).then((result) => {
      setBanner(result);
      if (result.status === 'success') setPendingDelete(null);
    });

  const moveAction = (formData: FormData) =>
    moveCollectionItemAction(IDLE_STATE, formData).then(setBanner);

  const visibilityAction = (formData: FormData) =>
    toggleCollectionVisibilityAction(IDLE_STATE, formData).then(setBanner);

  const listFields = useMemo(() => props.fields.filter((field) => field.inList), [props.fields]);

  const values = editing === 'new' || editing === null ? {} : editing.form;
  const blocked = editing === 'new' ? props.addBlockedReason : null;

  return (
    <section aria-labelledby={`collection-${props.collection}`} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`collection-${props.collection}`} className="text-base font-medium">
            {props.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
            {props.description}
          </p>
        </div>
        {props.canWrite ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing('new')}
            disabled={Boolean(props.addBlockedReason)}
          >
            <Icon name="plus" size={16} aria-hidden="true" />
            {props.addLabel}
          </Button>
        ) : null}
      </div>

      {props.quotaNotice ? (
        <Alert tone="info" live="status">
          {props.quotaNotice}
        </Alert>
      ) : null}

      {banner.status === 'error' && banner.message ? (
        <Alert tone="danger" live="alert">
          {banner.message}
        </Alert>
      ) : null}

      {props.rows.length === 0 ? (
        <EmptyState
          icon={<Icon name={props.icon} size={24} />}
          title={props.emptyTitle}
          description={props.emptyDescription}
          action={
            props.canWrite && !props.addBlockedReason ? (
              <Button onClick={() => setEditing('new')}>{props.addLabel}</Button>
            ) : undefined
          }
        />
      ) : (
        <TableWrapper label={props.title}>
          <Table>
            <THead>
              <TR>
                {listFields.map((field) => (
                  <TH key={field.name} scope="col">
                    {field.label}
                  </TH>
                ))}
                {props.hasVisibility ? <TH scope="col">État</TH> : null}
                <TH scope="col">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {props.rows.map((row, index) => (
                <TR key={row.id}>
                  {listFields.map((field) => (
                    <TD key={field.name}>{row.display[field.name] || '—'}</TD>
                  ))}
                  {props.hasVisibility ? (
                    <TD>
                      {props.canWrite ? (
                        <form action={visibilityAction} className="inline">
                          <input type="hidden" name="collection" value={props.collection} />
                          <input type="hidden" name="itemId" value={row.id} />
                          <button
                            type="submit"
                            className="rounded-[var(--radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                          >
                            <StatusPill tone={row.visible ? 'success' : 'neutral'}>
                              {row.visible ? 'Visible' : 'Masqué'}
                            </StatusPill>
                            <span className="sr-only">
                              {row.visible ? 'Masquer cet élément' : 'Afficher cet élément'}
                            </span>
                          </button>
                        </form>
                      ) : (
                        <StatusPill tone={row.visible ? 'success' : 'neutral'}>
                          {row.visible ? 'Visible' : 'Masqué'}
                        </StatusPill>
                      )}
                    </TD>
                  ) : null}
                  <TD>
                    {props.canWrite ? (
                      <div className="flex items-center justify-end gap-0.5">
                        {props.sortable ? (
                          <>
                            <form action={moveAction} className="inline">
                              <input type="hidden" name="collection" value={props.collection} />
                              <input type="hidden" name="itemId" value={row.id} />
                              <input type="hidden" name="direction" value="up" />
                              {index > 0 ? (
                                <IconSubmit label="Monter dans la liste" icon="arrow-up" />
                              ) : null}
                            </form>
                            <form action={moveAction} className="inline">
                              <input type="hidden" name="collection" value={props.collection} />
                              <input type="hidden" name="itemId" value={row.id} />
                              <input type="hidden" name="direction" value="down" />
                              {index < props.rows.length - 1 ? (
                                <IconSubmit label="Descendre dans la liste" icon="arrow-down" />
                              ) : null}
                            </form>
                          </>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                          Modifier
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPendingDelete(row)}>
                          Supprimer
                        </Button>
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? props.addLabel : `Modifier — ${props.singular.toLowerCase()}`}
      >
        {blocked ? (
          <Alert tone="warning" live="status">
            {blocked}
          </Alert>
        ) : (
          <form action={saveAction} className="space-y-5" noValidate>
            <input type="hidden" name="collection" value={props.collection} />
            {editing && editing !== 'new' ? (
              <input type="hidden" name="itemId" value={editing.id} />
            ) : null}

            {saveState.status === 'error' && saveState.message ? (
              <Alert tone="danger" live="alert">
                {saveState.message}
              </Alert>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              {props.fields.map((field) => (
                <div key={field.name} className={field.wide ? 'sm:col-span-2' : undefined}>
                  <FieldControl
                    // Remonter le formulaire a chaque changement d'element evite
                    // qu'une valeur precedente persiste dans un champ non
                    // controle.
                    key={`${editing === 'new' ? 'new' : (editing?.id ?? '')}-${field.name}`}
                    field={field}
                    value={values[field.name]}
                    error={saveState.errors?.[field.name]}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
              <SubmitButton label="Enregistrer" pendingLabel="Enregistrement" />
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const formData = new FormData();
          formData.set('collection', props.collection);
          formData.set('itemId', pendingDelete.id);
          startTransition(() => {
            void deleteAction(formData);
          });
        }}
        tone="danger"
        confirmLabel="Supprimer définitivement"
        title="Supprimer cet élément ?"
        description="Il disparaîtra de votre site immédiatement. Cette suppression est définitive : si vous voulez seulement le retirer temporairement, masquez-le plutôt."
      />
    </section>
  );
}
