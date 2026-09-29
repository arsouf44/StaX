'use client';

import { useState } from 'react';
import { Button, Field, Input, RadioCards } from '@nemasus/ui';
import { buildGithubAppManifest, isValidGithubOrganization } from '~/lib/github-app-manifest';

/**
 * Envoie le manifeste à GitHub. C'est un formulaire POST ordinaire vers
 * github.com : GitHub affiche alors sa propre page de confirmation, où le
 * propriétaire valide la création sous son compte.
 */
export function GithubAppForm({
  platformUrl,
  personalUrl,
  organizationUrlTemplate,
}: {
  platformUrl: string;
  personalUrl: string;
  /** Adresse de création pour une organisation, `__ORG__` à remplacer. */
  organizationUrlTemplate: string;
}) {
  const [owner, setOwner] = useState<'personal' | 'organization'>('organization');
  const [organization, setOrganization] = useState('');
  const [name, setName] = useState('Nemasus Sites');

  const organizationValid = isValidGithubOrganization(organization);
  const action =
    owner === 'organization'
      ? organizationUrlTemplate.replace('__ORG__', encodeURIComponent(organization))
      : personalUrl;
  const ready = name.trim().length >= 3 && (owner === 'personal' || organizationValid);

  return (
    <form method="post" action={action} className="space-y-5">
      <RadioCards
        name="owner"
        value={owner}
        onChange={(value) => setOwner(value === 'personal' ? 'personal' : 'organization')}
        options={[
          {
            value: 'organization',
            label: 'Une organisation GitHub',
            description: 'Recommandé : celle qui héberge les dépôts des sites clients.',
          },
          {
            value: 'personal',
            label: 'Mon compte personnel',
            description: 'Si les dépôts des sites sont sous votre compte.',
          },
        ]}
      />
      {owner === 'organization' ? (
        <Field
          label="Nom de l’organisation GitHub"
          hint="Tel qu’il apparaît dans l’adresse : github.com/<organisation>."
          required
        >
          <Input
            value={organization}
            onChange={(event) => setOrganization(event.target.value.trim())}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      ) : null}
      <Field
        label="Nom de l’application"
        hint="Unique sur GitHub. Il apparaît dans l’historique des dépôts des sites."
        required
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={34} />
      </Field>
      <input
        type="hidden"
        name="manifest"
        value={JSON.stringify(buildGithubAppManifest(platformUrl, name.trim()))}
      />
      <Button type="submit" disabled={!ready}>
        Créer l’application sur GitHub
      </Button>
    </form>
  );
}
