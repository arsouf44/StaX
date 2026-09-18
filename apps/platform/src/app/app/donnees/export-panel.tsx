'use client';

import { useState, useTransition } from 'react';
import { Alert, Button, Icon, Panel } from '@stax/ui';
import { exportCollectionAction } from './actions';

type Collection = 'messages' | 'contacts' | 'reservations' | 'commandes';

/** U+FEFF, ecrit par son point de code pour rester visible a la relecture. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const LABELS: Record<Collection, { title: string; description: string; icon: string }> = {
  messages: {
    title: 'Messages reçus',
    description: 'Tout ce que vos visiteurs vous ont écrit, avec la date et l’état de traitement.',
    icon: 'mail',
  },
  contacts: {
    title: 'Contacts',
    description: 'Vos prospects et clients, avec leur origine et leur consentement.',
    icon: 'users',
  },
  reservations: {
    title: 'Réservations',
    description: 'Toutes vos réservations, passées et à venir.',
    icon: 'calendar-check',
  },
  commandes: {
    title: 'Commandes',
    description: 'Vos commandes en ligne et leur état.',
    icon: 'shopping-bag',
  },
};

/**
 * Telechargement d un export.
 *
 * Le fichier est produit COTE SERVEUR puis remis au navigateur : aucune donnee
 * n est prechargee dans la page, et rien n est mis en cache.
 */
export function ExportPanel({ available }: { available: Record<Collection, boolean> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Collection | null>(null);

  const download = (collection: Collection) => {
    setError(null);
    setBusy(collection);
    startTransition(() => {
      void exportCollectionAction(collection)
        .then((result) => {
          if (!result.ok) {
            setError(result.message);
            return;
          }
          // Le CSV est precede d une marque d ordre d octets : sans elle, les
          // tableurs francais affichent les accents de travers.
          const blob = new Blob([BYTE_ORDER_MARK, result.csv], {
            type: 'text/csv;charset=utf-8',
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = result.filename;
          link.click();
          URL.revokeObjectURL(url);
        })
        .finally(() => setBusy(null));
    });
  };

  const entries = (Object.keys(LABELS) as Collection[]).filter((key) => available[key]);

  return (
    <Panel level={2} padding="lg">
      <h2 className="text-sm font-medium">Exporter mes données</h2>
      <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
        Format CSV, lisible par n’importe quel tableur. Aucune demande préalable, aucun frais.
      </p>

      {error ? (
        <Alert tone="danger" className="mt-4" live="alert">
          {error}
        </Alert>
      ) : null}

      <ul className="mt-5 divide-y divide-[var(--border)]">
        {entries.map((key) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="flex min-w-0 items-start gap-3">
              <Icon name={LABELS[key].icon} size={16} className="mt-0.5 text-[var(--muted)]" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{LABELS[key].title}</p>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  {LABELS[key].description}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={pending && busy === key}
              loadingLabel="Préparation"
              onClick={() => download(key)}
            >
              Télécharger
            </Button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
        Les fichiers sont protégés contre l’injection de formule : une valeur commençant par un
        signe interprétable par un tableur est neutralisée avant l’écriture.
      </p>
    </Panel>
  );
}
