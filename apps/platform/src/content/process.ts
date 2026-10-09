/**
 * Le parcours d'un projet Nemasus, tel qu'il se déroule réellement.
 *
 * Une seule source pour la page d'accueil, « Comment ça marche » et les
 * données structurées : deux versions du même parcours finiraient par se
 * contredire. Chaque étape correspond à ce que fait réellement la plateforme :
 * commande sans prix public, modalités de paiement par virement envoyées par
 * l'équipe, code d'accès personnel émis à réception du virement, puis un site
 * conçu et développé dans un projet qui lui est propre.
 */

export interface ProcessStep {
  title: string;
  description: string;
  detail?: string;
}

/** Comment on commande, comment on paie, comment on accède : les quatre temps. */
export const ORDER_JOURNEY: readonly ProcessStep[] = [
  {
    title: 'Vous commandez',
    description:
      'En quelques minutes, en ligne : votre activité, vos coordonnées, votre projet et l’adresse souhaitée. Aucun compte à créer, aucun paiement à ce stade, aucun engagement.',
    detail: 'Accusé de réception immédiat par e-mail',
  },
  {
    title: 'Vous réglez par virement',
    description:
      'Nous étudions votre demande et vous envoyons par écrit le montant convenu, le délai de réalisation, nos coordonnées bancaires et la référence à indiquer. Vous ne payez qu’une fois d’accord.',
    detail: 'Virement bancaire, aucune carte demandée',
  },
  {
    title: 'Vous recevez votre code',
    description:
      'Dès que votre virement nous parvient, nous vous envoyons votre code d’accès : un code par personne, à usage unique, lié à votre adresse e-mail.',
    detail: 'Code personnel, vérifié par nos serveurs',
  },
  {
    title: 'Votre espace s’ouvre',
    description:
      'Sur la page « Accès client », votre code crée votre compte et l’ouvre sur votre site. Vous choisissez votre mot de passe, suivez la création de votre site, puis le gérez vous-même.',
    detail: 'Votre espace, et lui seul',
  },
];

export const PROCESS_STEPS: readonly ProcessStep[] = [
  {
    title: 'Votre projet',
    description:
      'Après votre commande et votre virement, votre espace s’ouvre avec votre code d’accès. Vous y déposez vos textes, vos photos et votre logo, à votre rythme, et vous échangez avec l’équipe.',
    detail: 'Code d’accès personnel',
  },
  {
    title: 'Conception',
    description:
      'Nous définissons la structure, les contenus, l’identité visuelle et les fonctionnalités de votre site. Vous suivez l’avancement dans votre espace et validez les choix importants.',
    detail: 'Vos validations depuis votre espace',
  },
  {
    title: 'Développement',
    description:
      'Notre équipe crée réellement votre site, dans un projet indépendant qui n’appartient qu’à lui : son propre code, son propre dépôt. Pas de modèle à personnaliser : sa structure et son design sont conçus pour lui.',
    detail: 'Un projet par site',
  },
  {
    title: 'Mise en ligne',
    description:
      'Le code de votre site est versionné sur GitHub et déployé sur le réseau de Cloudflare. Nous connectons votre domaine en HTTPS, puis nous vérifions l’affichage sur mobile, les formulaires et le référencement.',
    detail: 'GitHub · Cloudflare · domaine · tests',
  },
  {
    title: 'Livraison',
    description:
      'Votre site est déjà en ligne lorsque nous vous ouvrons l’éditeur Nemasus : à partir de ce moment, il est entre vos mains.',
    detail: 'L’éditeur s’ouvre',
  },
  {
    title: 'Vous gardez la main',
    description:
      'Vous modifiez votre contenu, prévisualisez votre vrai site, puis publiez quand vous voulez : vos modifications sont déployées, et chaque version reste restaurable.',
    detail: 'Brouillon · Aperçu · Publier',
  },
];

/**
 * Le principe, en sept points : ce que le visiteur doit avoir compris avant de
 * commander. Personne ne construit son site soi-même chez Nemasus.
 */
export const PRINCIPLE_POINTS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: 'Vous commandez votre site',
    description:
      'Vous décrivez votre activité et votre projet en ligne. Il n’y a pas de grille tarifaire : chaque site est conçu sur mesure, et le montant est convenu avec vous.',
  },
  {
    title: 'Vous réglez par virement',
    description:
      'Nous vous envoyons les modalités de paiement par e-mail. Dès réception du virement, vous recevez votre code d’accès personnel, qui ouvre votre espace.',
  },
  {
    title: 'Nous concevons et développons votre site',
    description:
      'Structure, design, contenus et fonctionnalités : notre équipe réalise votre site dans un projet qui lui est propre. Vous suivez l’avancement et validez les étapes clés.',
  },
  {
    title: 'Nous le mettons réellement en ligne',
    description:
      'Dépôt de code dédié, déploiement sur Cloudflare, votre domaine en HTTPS, puis nos vérifications : affichage mobile, formulaires, référencement.',
  },
  {
    title: 'Nous vous le livrons',
    description:
      'Votre site est en ligne quand nous vous le livrons. C’est à ce moment que l’éditeur s’ouvre dans votre espace.',
  },
  {
    title: 'Vous modifiez son contenu depuis Nemasus',
    description:
      'Textes, images, horaires, informations : tout ce que votre site prévoit de modifiable. Le design et la structure restent protégés ; un changement plus profond, nous nous en chargeons après en avoir convenu avec vous.',
  },
  {
    title: 'Vous publiez, et c’est réellement en ligne',
    description:
      'Quand vous cliquez sur « Publier », vos modifications sont enregistrées dans le code de votre site puis déployées. Nemasus n’affiche « Publié » qu’une fois le déploiement confirmé.',
  },
];
