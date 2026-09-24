/**
 * Le parcours d'un projet StaX, tel qu'il se deroule reellement.
 *
 * Une seule source pour la page d'accueil et « Comment ça marche » : deux
 * versions du meme parcours finiraient par se contredire. Chaque etape
 * correspond a une phase reelle du dossier (voir `PROJECT_TIMELINE` dans
 * `@stax/payments`) et a ce que l'equipe fait vraiment : aucun modele, aucun
 * generateur, un projet independant par site.
 */

export interface ProcessStep {
  title: string;
  description: string;
  detail?: string;
}

export const PROCESS_STEPS: readonly ProcessStep[] = [
  {
    title: 'Votre projet',
    description:
      'Vous choisissez l’offre et nous expliquez votre activité : un questionnaire adapté à votre métier, puis vos textes, vos photos, votre logo et votre domaine, que vous déposez dans votre espace à votre rythme.',
    detail: 'Seule la création est payée à la commande',
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
      'Notre équipe crée réellement votre site, dans un projet indépendant qui n’appartient qu’à lui : son propre code, son propre dépôt. Pas de modèle à personnaliser, pas de génération automatique.',
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
      'Votre site est déjà en ligne lorsque nous vous ouvrons l’éditeur StaX. La maintenance mensuelle commence à ce moment-là, et pas avant.',
    detail: 'Début de la maintenance',
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
 * commander. Personne ne construit son site soi-meme chez StaX.
 */
export const PRINCIPLE_POINTS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: 'Vous choisissez votre offre',
    description:
      'Selon le nombre de pages, la richesse du design et les fonctionnalités dont vous avez besoin. Vous payez la création ; la maintenance attend la livraison.',
  },
  {
    title: 'Vous nous présentez votre entreprise',
    description:
      'Un questionnaire adapté à votre métier, vos textes, vos photos, votre logo, votre domaine. Vous le complétez depuis votre espace, à votre rythme.',
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
      'Votre site est en ligne quand nous vous le livrons. C’est à ce moment que l’éditeur s’ouvre et que la maintenance mensuelle commence.',
  },
  {
    title: 'Vous modifiez son contenu depuis StaX',
    description:
      'Textes, images, horaires, informations : tout ce que votre site prévoit de modifiable. Le design et la structure restent protégés ; un changement plus profond, nous nous en chargeons, sur devis si nécessaire.',
  },
  {
    title: 'Vous publiez, et c’est réellement en ligne',
    description:
      'Quand vous cliquez sur « Publier », vos modifications sont enregistrées dans le code de votre site puis déployées. StaX n’affiche « Publié » qu’une fois le déploiement confirmé.',
  },
];
