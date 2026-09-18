'use client';

import { useState, useTransition } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Icon,
  Panel,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import { FieldControl, SubmitButton, type ClientField } from '~/components/app/form-fields';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { deletePageAction, savePageAction } from '../actions';

export interface PageRow {
  id: string;
  title: string;
  path: string;
  kindLabel: string;
  isHome: boolean;
  isPublished: boolean;
  showInNav: boolean;
  indexable: boolean;
  seoTitle: string;
  seoDescription: string;
  blockCount: number;
}

const FIELDS: ClientField[] = [
  { name: 'title', label: 'Titre de la page', kind: 'text', required: true, maxLength: 80 },
  {
    name: 'path',
    label: 'Adresse',
    kind: 'text',
    required: true,
    maxLength: 200,
    placeholder: '/contact',
    hint: 'En minuscules, sans accent ni espace. Exemple : /nos-realisations',
  },
  {
    name: 'seoTitle',
    label: 'Titre dans les résultats de recherche',
    kind: 'text',
    maxLength: 70,
    wide: true,
  },
  {
    name: 'seoDescription',
    label: 'Description dans les résultats de recherche',
    kind: 'textarea',
    maxLength: 170,
    rows: 2,
    wide: true,
  },
  {
    name: 'showInNav',
    label: 'Afficher dans le menu',
    kind: 'boolean',
  },
  {
    name: 'robotsIndexable',
    label: 'Autoriser l’indexation',
    kind: 'boolean',
    hint: 'Décochez pour une page que les moteurs de recherche ne doivent pas référencer.',
  },
  {
    name: 'isPublished',
    label: 'Page publiée',
    kind: 'boolean',
    hint: 'Une page non publiée reste dans votre espace mais n’est pas accessible en ligne.',
  },
];

const KIND_FIELD: ClientField = {
  name: 'kind',
  label: 'Type de page',
  kind: 'select',
  options: [
    { value: 'standard', label: 'Page libre' },
    { value: 'contact', label: 'Contact' },
    { value: 'services', label: 'Prestations' },
    { value: 'menu', label: 'Carte' },
    { value: 'products', label: 'Boutique' },
    { value: 'booking', label: 'Réservation' },
    { value: 'gallery', label: 'Galerie' },
    { value: 'team', label: 'Équipe' },
    { value: 'blog', label: 'Actualités' },
    { value: 'legal', label: 'Page légale' },
  ],
};

export function PageManager({ pages, canEdit }: { pages: PageRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<PageRow | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PageRow | null>(null);
  const [saveState, setSaveState] = useState<ActionState>(IDLE_STATE);
  const [deleteState, setDeleteState] = useState<ActionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  const saveAction = (formData: FormData) =>
    savePageAction(IDLE_STATE, formData).then((result) => {
      setSaveState(result);
      if (result.status === 'success') setEditing(null);
    });

  const removeAction = (formData: FormData) =>
    deletePageAction(IDLE_STATE, formData).then((result) => {
      setDeleteState(result);
      if (result.status === 'success') setPendingDelete(null);
    });

  const current = editing === 'new' || editing === null ? null : editing;
  const fields = editing === 'new' ? [FIELDS[0] as ClientField, FIELDS[1] as ClientField, KIND_FIELD, ...FIELDS.slice(2)] : FIELDS;

  const values: Record<string, string | boolean> = current
    ? {
        title: current.title,
        path: current.path,
        kind: 'standard',
        seoTitle: current.seoTitle,
        seoDescription: current.seoDescription,
        showInNav: current.showInNav,
        robotsIndexable: current.indexable,
        isPublished: current.isPublished,
      }
    : {
        title: '',
        path: '',
        kind: 'standard',
        seoTitle: '',
        seoDescription: '',
        showInNav: true,
        robotsIndexable: true,
        isPublished: true,
      };

  return (
    <div className="space-y-4">
      {deleteState.status === 'error' && deleteState.message ? (
        <Alert tone="danger" live="alert">
          {deleteState.message}
        </Alert>
      ) : null}
      {deleteState.status === 'success' && deleteState.message ? (
        <Alert tone="success" live="status">
          {deleteState.message}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        {canEdit ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} aria-hidden="true" />
            Créer une page
          </Button>
        ) : null}
      </div>

      <TableWrapper label="Pages du site">
        <Table>
          <THead>
            <TR>
              <TH scope="col">Page</TH>
              <TH scope="col">Adresse</TH>
              <TH scope="col">Contenu</TH>
              <TH scope="col">État</TH>
              <TH scope="col">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {pages.map((page) => (
              <TR key={page.id}>
                <TD>
                  {page.title}
                  <span className="ml-2 text-xs text-[var(--muted)]">{page.kindLabel}</span>
                </TD>
                <TD className="font-mono text-xs">{page.path}</TD>
                <TD className="text-[var(--foreground-muted)]">
                  {page.blockCount === 0
                    ? 'Vide'
                    : `${page.blockCount} bloc${page.blockCount > 1 ? 's' : ''}`}
                </TD>
                <TD>
                  <StatusPill tone={page.isPublished ? 'success' : 'neutral'}>
                    {page.isPublished ? 'Publiée' : 'Brouillon'}
                  </StatusPill>
                </TD>
                <TD>
                  {canEdit ? (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(page)}>
                        Réglages
                      </Button>
                      {!page.isHome ? (
                        <Button variant="ghost" size="sm" onClick={() => setPendingDelete(page)}>
                          Supprimer
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrapper>

      <Panel level={1} padding="md">
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Le contenu des pages se modifie dans l’éditeur. Cet écran gère leur existence, leur
          adresse et leur visibilité.
        </p>
      </Panel>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'Créer une page' : `Réglages — ${current?.title ?? ''}`}
      >
        <form action={saveAction} className="space-y-5" noValidate>
          {current ? <input type="hidden" name="pageId" value={current.id} /> : null}

          {saveState.status === 'error' && saveState.message ? (
            <Alert tone="danger" live="alert">
              {saveState.message}
            </Alert>
          ) : null}

          {current?.isHome ? (
            <Alert tone="info" live="status">
              C’est votre page d’accueil : son adresse reste « / » et elle ne peut pas être
              dépubliée.
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.name} className={field.wide ? 'sm:col-span-2' : undefined}>
                <FieldControl
                  key={`${current?.id ?? 'new'}-${field.name}`}
                  field={
                    current?.isHome && (field.name === 'path' || field.name === 'isPublished')
                      ? { ...field, hint: 'Non modifiable pour la page d’accueil.' }
                      : field
                  }
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
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const payload = new FormData();
          payload.set('pageId', pendingDelete.id);
          startTransition(() => {
            void removeAction(payload);
          });
        }}
        tone="danger"
        confirmLabel="Supprimer la page"
        confirmationText={pendingDelete?.path}
        title="Supprimer cette page ?"
        description="Son contenu sera perdu et son adresse renverra une page introuvable. Si vous voulez seulement la retirer du site, dépubliez-la plutôt. Recopiez son adresse pour confirmer."
      />
    </div>
  );
}
