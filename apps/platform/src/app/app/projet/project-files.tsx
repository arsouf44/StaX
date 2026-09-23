'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Panel, Select, useToast } from '@stax/ui';
import { uploadProjectFileAction } from './actions';

export interface ProjectFileView {
  id: string;
  fileName: string;
  kind: string;
  direction: 'inbound' | 'outbound';
  createdAt: string;
  url: string | null;
}

const KIND_LABELS: Record<string, string> = {
  logo: 'Logo',
  photo: 'Photo',
  document: 'Document',
  menu: 'Carte / menu',
  brochure: 'Brochure',
  deliverable: 'Livrable StaX',
  asset: 'Fichier',
};

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

/** Fichiers du projet : ceux que vous nous envoyez, et ceux que nous vous remettons. */
export function ProjectFiles({
  projectId,
  files,
  canUpload,
}: {
  projectId: string;
  files: ProjectFileView[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState('photo');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    const data = new FormData();
    data.set('projectId', projectId);
    data.set('kind', kind);
    data.set('file', file);
    setError(null);
    startTransition(() => {
      void uploadProjectFileAction(data).then((result) => {
        if (result.status === 'error') setError(result.message);
        else {
          toast.success(result.message);
          router.refresh();
        }
      });
    });
  };

  return (
    <Panel level={1} padding="md" data-testid="project-files" id="fichiers">
      <h2 className="text-sm font-medium">Fichiers</h2>
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
        Logo, photos, textes, carte : envoyez-nous ce qui servira à votre site.
      </p>
      {canUpload ? (
        <div className="mt-3 grid gap-2">
          <Field label="Type de fichier">
            <Select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="logo">Logo</option>
              <option value="photo">Photo</option>
              <option value="document">Document (textes, PDF)</option>
              <option value="menu">Carte / menu</option>
              <option value="brochure">Brochure</option>
            </Select>
          </Field>
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label="Choisir un fichier"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = '';
            }}
          />
          <Button variant="secondary" loading={pending} onClick={() => input.current?.click()}>
            Envoyer un fichier
          </Button>
        </div>
      ) : null}
      {error ? (
        <Alert tone="danger" live="alert" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {files.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Aucun fichier pour l’instant.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                {file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate underline underline-offset-2"
                  >
                    {file.fileName}
                  </a>
                ) : (
                  <span className="block truncate">{file.fileName}</span>
                )}
                <span className="text-2xs text-[var(--muted)]">
                  {KIND_LABELS[file.kind] ?? file.kind} ·{' '}
                  {file.direction === 'outbound' ? 'remis par StaX' : 'envoyé par vous'} ·{' '}
                  {DATE.format(new Date(file.createdAt))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
