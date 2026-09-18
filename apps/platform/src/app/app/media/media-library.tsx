'use client';

import { useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Panel,
  QuotaMeter,
  Textarea,
} from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { deleteMediaAction, describeMediaAction, uploadMediaAction } from './actions';

export interface MediaItem {
  id: string;
  fileName: string;
  url: string | null;
  mimeType: string;
  isImage: boolean;
  sizeLabel: string;
  dimensionsLabel: string | null;
  altText: string;
  caption: string;
  addedLabel: string;
}

export interface MediaQuota {
  usedMb: number;
  limitMb: number | null;
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function MediaLibrary({
  items,
  quota,
  canManage,
}: {
  items: MediaItem[];
  quota: MediaQuota;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [uploadState, setUploadState] = useState<ActionState>(IDLE_STATE);
  const [describeState, setDescribeState] = useState<ActionState>(IDLE_STATE);
  const [deleteState, setDeleteState] = useState<ActionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  const upload = (formData: FormData) =>
    uploadMediaAction(IDLE_STATE, formData).then(setUploadState);

  const describe = (formData: FormData) =>
    describeMediaAction(IDLE_STATE, formData).then((result) => {
      setDescribeState(result);
      if (result.status === 'success') setEditing(null);
    });

  const remove = (formData: FormData) =>
    deleteMediaAction(IDLE_STATE, formData).then((result) => {
      setDeleteState(result);
      if (result.status === 'success') setPendingDelete(null);
    });

  const missingAlt = items.filter((item) => item.isImage && item.altText.trim() === '').length;

  return (
    <div className="space-y-8">
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

      {canManage ? (
        <Panel level={2} padding="lg">
          <h2 className="text-sm font-medium">Ajouter un fichier</h2>
          <form action={upload} className="mt-5 space-y-4" noValidate>
            {uploadState.status === 'error' && uploadState.message ? (
              <Alert tone="danger" live="alert">
                {uploadState.message}
              </Alert>
            ) : null}
            {uploadState.status === 'success' && uploadState.message ? (
              <Alert tone="success" live="status">
                {uploadState.message}
              </Alert>
            ) : null}

            <Field
              label="Fichier"
              required
              hint="Images, PDF ou vidéos, jusqu’à 12 Mo. Une photo bien compressée charge plus vite et remonte mieux dans les résultats."
            >
              <Input
                type="file"
                name="file"
                required
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,application/pdf,video/mp4,video/webm"
              />
            </Field>

            <Field
              label="Description de l’image"
              hint="Ce que montre l’image, en une phrase. Lu à voix haute par les lecteurs d’écran, et affiché si l’image ne se charge pas."
            >
              <Input
                name="altText"
                maxLength={200}
                placeholder="Devanture de la boutique, rue de la République"
              />
            </Field>

            <SubmitButton label="Envoyer" pendingLabel="Envoi" />
          </form>
        </Panel>
      ) : null}

      {quota.limitMb !== null ? (
        <QuotaMeter label="Espace utilisé" used={quota.usedMb} limit={quota.limitMb} unit="Mo" />
      ) : null}

      {missingAlt > 0 ? (
        <Alert tone="warning" live="status" title="Des images n’ont pas de description">
          {missingAlt} image{missingAlt > 1 ? 's' : ''} sans description. Une image sans description
          est invisible pour une personne aveugle, et ne dit rien aux moteurs de recherche.
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<Icon name="image" size={24} />}
          title="Aucun fichier"
          description="Vos photos, documents et vidéos apparaîtront ici, prêts à être utilisés dans l’éditeur."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <Panel level={1} padding="none" className="overflow-hidden">
                <div className="flex aspect-[4/3] items-center justify-center bg-[var(--surface-2)]">
                  {item.isImage && item.url ? (
                    // Une image de la bibliotheque du client : ni ses dimensions
                    // exactes ni son format ne sont connus a l'avance, et elle
                    // vient du stockage Supabase, pas du domaine de la
                    // plateforme. Une balise native evite une optimisation qui
                    // echouerait sur les formats exotiques.
                    <img
                      src={item.url}
                      alt={item.altText || ''}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[var(--muted)]" aria-hidden="true">
                      <Icon
                        name={item.mimeType.startsWith('video/') ? 'video' : 'file-text'}
                        size={28}
                      />
                    </span>
                  )}
                </div>

                <div className="space-y-1 p-3">
                  <p className="truncate text-xs font-medium" title={item.fileName}>
                    {item.fileName}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {item.sizeLabel}
                    {item.dimensionsLabel ? ` · ${item.dimensionsLabel}` : ''}
                  </p>
                  {item.isImage && item.altText.trim() === '' ? (
                    <p className="text-xs text-[var(--warning)]">Sans description</p>
                  ) : null}

                  {canManage ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                        Décrire
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(item)}>
                        Supprimer
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        title="Décrire ce fichier"
      >
        <form action={describe} className="space-y-5" noValidate>
          <input type="hidden" name="mediaId" value={editing?.id ?? ''} />

          {describeState.status === 'error' && describeState.message ? (
            <Alert tone="danger" live="alert">
              {describeState.message}
            </Alert>
          ) : null}

          <Field
            label="Description de l’image"
            hint="Décrivez ce que montre l’image, pas le fait que ce soit une image. « Devanture de la boutique » plutôt que « photo de la boutique »."
          >
            <Input
              key={`alt-${editing?.id ?? ''}`}
              name="altText"
              defaultValue={editing?.altText ?? ''}
              maxLength={200}
            />
          </Field>

          <Field label="Légende" hint="Affichée sous l’image quand la mise en page le prévoit.">
            <Textarea
              key={`caption-${editing?.id ?? ''}`}
              name="caption"
              rows={2}
              defaultValue={editing?.caption ?? ''}
              maxLength={300}
            />
          </Field>

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
          payload.set('mediaId', pendingDelete.id);
          startTransition(() => {
            void remove(payload);
          });
        }}
        tone="danger"
        confirmLabel="Supprimer le fichier"
        title="Supprimer ce fichier ?"
        description="S’il est utilisé sur une de vos pages, l’emplacement deviendra vide. Cette suppression est définitive."
      />
    </div>
  );
}
