'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, useToast } from '@stax/ui';
import { prepareSiteAction } from './actions';

/**
 * Premier point de depart d un site vide : une page vierge (on construit de
 * zero) ou le modele du metier (pages et textes d exemple).
 */
export function PrepareSiteButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<'blank' | 'template' | null>(null);

  const prepare = (mode: 'blank' | 'template') => {
    setChoice(mode);
    startTransition(() => {
      void prepareSiteAction(mode).then((result) => {
        if (result.status === 'error') toast.error(result.message);
        else {
          toast.success(result.message ?? 'Site prêt.');
          router.refresh();
        }
      });
    });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        size="lg"
        loading={pending && choice === 'blank'}
        disabled={pending}
        loadingLabel="Préparation"
        onClick={() => prepare('blank')}
      >
        Partir d’une page vierge
      </Button>
      <Button
        size="lg"
        variant="secondary"
        loading={pending && choice === 'template'}
        disabled={pending}
        loadingLabel="Préparation"
        onClick={() => prepare('template')}
      >
        Partir du modèle du métier
      </Button>
    </div>
  );
}
