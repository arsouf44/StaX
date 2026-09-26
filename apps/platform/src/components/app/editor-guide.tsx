'use client';

import { Button, useLocalStorageValue, writeLocalStorage } from '@stax/ui';

/**
 * Mode d'emploi de l'éditeur, en trois lignes, pour qui l'ouvre la première
 * fois. Masquable ; le choix est retenu sur cet appareil.
 */
export function EditorGuide() {
  const hidden = useLocalStorageValue('stax.editor-guide') === 'hidden';
  if (hidden) return null;
  return (
    <div
      className="mx-4 mt-3 flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--accent)]/25 bg-[var(--accent)]/[0.06] p-3 text-sm"
      data-testid="editor-guide"
    >
      <ol className="grid flex-1 gap-1.5 sm:grid-cols-3">
        <li>
          <strong>1.</strong> Cliquez sur ce que vous voulez changer dans l’aperçu, ou choisissez
          une zone à gauche.
        </li>
        <li>
          <strong>2.</strong> Modifiez le texte ou la photo dans le panneau de droite.
        </li>
        <li>
          <strong>3.</strong> Cliquez sur « Publier » : votre site est mis à jour en quelques
          minutes. Avant cela, rien ne change en ligne.
        </li>
      </ol>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => writeLocalStorage('stax.editor-guide', 'hidden')}
      >
        J’ai compris
      </Button>
    </div>
  );
}
