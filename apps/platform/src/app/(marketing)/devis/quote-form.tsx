'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  FormErrorSummary,
  Input,
  Select,
  Textarea,
} from '@stax/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { IDLE_STATE as LEAD_IDLE } from '~/lib/form-state';
import { sendQuoteRequestAction, type LeadState } from '../contact/actions';

const FEATURES = [
  { value: 'ecommerce', label: 'Vente en ligne' },
  { value: 'booking', label: 'Réservation ou prise de rendez-vous' },
  { value: 'payments', label: 'Encaissement de paiements' },
  { value: 'customer_accounts', label: 'Comptes clients' },
  { value: 'multi_language', label: 'Plusieurs langues' },
  { value: 'advanced_animations', label: 'Animations avancées' },
  { value: 'custom_design', label: 'Design entièrement sur mesure' },
  { value: 'integrations', label: 'Connexion à un logiciel existant' },
  { value: 'blog', label: 'Actualités ou blog' },
  { value: 'crm', label: 'Suivi de prospects' },
  { value: 'api', label: 'Interface programmable (API)' },
  { value: 'mobile_app', label: 'Application mobile' },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel="Envoi en cours">
      Envoyer ma demande
    </Button>
  );
}

export function QuoteForm({
  sectors,
  turnstileSiteKey,
}: {
  sectors: Array<{ id: string; label: string }>;
  turnstileSiteKey: string | null;
}) {
  const [state, action] = useActionState<LeadState, FormData>(sendQuoteRequestAction, LEAD_IDLE);

  if (state.status === 'success') {
    return (
      <Alert tone="success" live="status" title="Demande enregistrée">
        {state.message}
        {state.reference ? (
          <span className="mt-2 block">
            Référence de votre demande : <strong className="font-mono">{state.reference}</strong>
          </span>
        ) : null}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      <div aria-hidden="true" className="sr-only">
        <label htmlFor="q-website">Ne remplissez pas ce champ</label>
        <input id="q-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="space-y-5">
        <legend className="text-sm font-medium">Vous</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Votre nom" error={state.errors?.contactName} required>
            <Input name="contactName" autoComplete="name" required />
          </Field>
          <Field label="Votre entreprise" error={state.errors?.companyName}>
            <Input name="companyName" autoComplete="organization" />
          </Field>
          <Field label="Adresse e-mail" error={state.errors?.contactEmail} required>
            <Input name="contactEmail" type="email" autoComplete="email" required />
          </Field>
          <Field label="Téléphone" error={state.errors?.contactPhone}>
            <Input name="contactPhone" type="tel" autoComplete="tel" />
          </Field>
        </div>
        <Field label="Votre secteur" error={state.errors?.sectorSlug}>
          <Select name="sectorSlug" defaultValue="">
            <option value="">Je préfère l’expliquer plus bas</option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.label}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-sm font-medium">Votre projet</legend>

        <Field
          label="Que doit permettre ce site ?"
          error={state.errors?.objective}
          hint="Décrivez l’objectif concret. Par exemple : « prendre des commandes de traiteur en ligne avec paiement d’acompte »."
          required
        >
          <Textarea name="objective" rows={5} required minLength={20} />
        </Field>

        <Field
          label="Combien de pages, approximativement ?"
          error={state.errors?.pageCountRange}
          required
        >
          <Select name="pageCountRange" defaultValue="unknown" required>
            <option value="1-5">De 1 à 5 pages</option>
            <option value="6-15">De 6 à 15 pages</option>
            <option value="16-30">De 16 à 30 pages</option>
            <option value="30+">Plus de 30 pages</option>
            <option value="unknown">Je ne sais pas encore</option>
          </Select>
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">Fonctionnalités envisagées</legend>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Cochez ce qui vous semble utile. Rien n’est définitif.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <Checkbox
                key={feature.value}
                name="features"
                value={feature.value}
                label={feature.label}
              />
            ))}
          </div>
        </fieldset>

        <Field
          label="Logiciels à connecter"
          error={state.errors?.integrations}
          hint="Caisse, logiciel de réservation, comptabilité, ERP… Indiquez leurs noms si vous les connaissez."
        >
          <Textarea name="integrations" rows={3} />
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-sm font-medium">Votre situation</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Vos contenus (textes, photos)" error={state.errors?.hasContent} required>
            <Select name="hasContent" defaultValue="partial" required>
              <option value="ready">Ils sont prêts</option>
              <option value="partial">J’en ai une partie</option>
              <option value="none">Je pars de zéro</option>
            </Select>
          </Field>
          <Field label="Nom de domaine" error={state.errors?.hasDomain} required>
            <Select name="hasDomain" defaultValue="no" required>
              <option value="yes">J’en possède déjà un</option>
              <option value="no">Non, pas encore</option>
              <option value="unsure">Je ne sais pas</option>
            </Select>
          </Field>
          <Field label="Échéance souhaitée" error={state.errors?.deadline} required>
            <Select name="deadline" defaultValue="3months" required>
              <option value="asap">Le plus vite possible</option>
              <option value="1month">Sous un mois</option>
              <option value="3months">Sous trois mois</option>
              <option value="6months">Sous six mois</option>
              <option value="flexible">Pas de contrainte</option>
            </Select>
          </Field>
          <Field
            label="Budget envisagé"
            error={state.errors?.budgetRange}
            hint="Une fourchette suffit. Cela nous évite de vous proposer quelque chose de hors sujet."
            required
          >
            <Select name="budgetRange" defaultValue="undecided" required>
              <option value="under_1k">Moins de 1 000 €</option>
              <option value="1k_3k">De 1 000 à 3 000 €</option>
              <option value="3k_10k">De 3 000 à 10 000 €</option>
              <option value="10k_plus">Plus de 10 000 €</option>
              <option value="undecided">Je ne sais pas encore</option>
            </Select>
          </Field>
        </div>

        <Field label="Autre chose à ajouter ?" error={state.errors?.comments}>
          <Textarea name="comments" rows={4} />
        </Field>
      </fieldset>

      <Checkbox
        name="acceptPrivacy"
        required
        error={state.errors?.acceptPrivacy}
        label={
          <>
            J’accepte que mes informations soient utilisées pour établir ce devis, conformément à la{' '}
            <Link href="/confidentialite" target="_blank" className="underline underline-offset-4">
              politique de confidentialité
            </Link>
            .
          </>
        }
      />

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />
    </form>
  );
}
