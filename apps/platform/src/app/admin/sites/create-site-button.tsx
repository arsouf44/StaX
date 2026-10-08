'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Dialog, Field, Input, Select } from '@nemasus/ui';
import { createSiteAction } from './actions';

export interface CreateSiteOption {
  value: string;
  label: string;
}

/**
 * « Créer un site » : un site vide, que l'equipe construit puis confie au
 * client. Le metier est facultatif ; les droits techniques du site sont ceux
 * de la formule interne (aucune grille tarifaire).
 */
export function CreateSiteButton({ businessTypes }: { businessTypes: CreateSiteOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [city, setCity] = useState('');

  const submit = () => {
    setError(null);
    startTransition(() => {
      void createSiteAction({ name, businessType, city }).then((result) => {
        if (result.status === 'error' || !result.siteId) {
          setError(result.message ?? 'Le site n’a pas pu être créé.');
          return;
        }
        setOpen(false);
        router.push(`/admin/sites/${result.siteId}`);
      });
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Créer un site</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!pending}
        size="md"
        title="Créer un site"
        description="Le site part de zéro. Vous le construisez dans l’éditeur, puis vous le confiez à son client : il n’y a accès qu’à partir de ce moment. Vous en gardez la main."
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={submit}>
              Créer le site
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error ? (
            <Alert tone="danger" live="alert">
              {error}
            </Alert>
          ) : null}
          <Field label="Nom du site (ou de l’entreprise)" required>
            <Input
              name="name"
              value={name}
              required
              minLength={2}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="Métier"
            hint="Facultatif. Il oriente les sections proposées dans l’éditeur."
          >
            <Select
              name="businessType"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
            >
              <option value="">À définir</option>
              {businessTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ville">
            <Input
              name="city"
              value={city}
              maxLength={120}
              onChange={(event) => setCity(event.target.value)}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}
