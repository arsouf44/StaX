'use client';

import { useState } from 'react';
import { Field, Input } from '@stax/ui';
import { PASSWORD_MIN_LENGTH, passwordStrength } from '@stax/validation';

/**
 * Champ mot de passe.
 *
 * L indicateur de robustesse est PUREMENT indicatif : la contrainte reelle est
 * appliquee cote serveur par le meme schema Zod. Il sert a guider, pas a
 * autoriser.
 */
export function PasswordField({
  name = 'password',
  label = 'Mot de passe',
  error,
  autoComplete = 'new-password',
  showStrength = true,
  required = true,
}: {
  name?: string;
  label?: string;
  error?: string[] | undefined;
  autoComplete?: string;
  showStrength?: boolean;
  required?: boolean;
}) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const strength = showStrength && value.length > 0 ? passwordStrength(value) : null;

  return (
    <Field
      label={label}
      error={error}
      required={required}
      hint={
        showStrength
          ? `${PASSWORD_MIN_LENGTH} caractères minimum. Une phrase longue vaut mieux qu’un mot compliqué.`
          : undefined
      }
    >
      <div className="relative">
        <Input
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          minLength={showStrength ? PASSWORD_MIN_LENGTH : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="pr-20"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          aria-pressed={visible}
        >
          {visible ? 'Masquer' : 'Afficher'}
        </button>
      </div>

      {strength ? (
        <div className="mt-2">
          <div
            className="flex gap-1"
            role="img"
            aria-label={`Robustesse du mot de passe : ${strength.label}`}
          >
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={
                  index < strength.score
                    ? 'h-1 flex-1 rounded-full bg-[var(--success)]'
                    : 'h-1 flex-1 rounded-full bg-[var(--border)]'
                }
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {strength.label}
            {strength.hints[0] ? ` — ${strength.hints[0]}` : ''}
          </p>
        </div>
      ) : null}
    </Field>
  );
}
