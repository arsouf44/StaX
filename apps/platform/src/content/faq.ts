/**
 * Questions fréquentes.
 *
 * Une seule source, réutilisée par la page d'accueil, la page /faq et les
 * données structurées FAQPage. Les réponses sont concrètes et ne promettent
 * rien que le produit ne fasse réellement : nous créons le site, le client le
 * gère ensuite ; il commande sans prix public, règle par virement selon les
 * modalités que nous lui adressons, puis accède à son espace avec un code
 * personnel. Aucun chiffre, aucun délai, aucune garantie inventés.
 */

export interface FaqItem {
  question: string;
  answer: string;
  category: 'general' | 'commande' | 'acces' | 'contenu' | 'technique' | 'juridique';
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    category: 'general',
    question: 'Qu’est-ce que Nemasus ?',
    answer:
      'Nemasus est un studio français de conception et de développement de sites web professionnels. Notre équipe conçoit, développe et met en ligne le site de votre entreprise, puis vous le confie avec un éditeur simple : vous modifiez ensuite vous-même vos textes, vos photos et vos informations, et vous publiez quand vous le souhaitez.',
  },
  {
    category: 'general',
    question: 'Est-ce que je construis mon site moi-même ?',
    answer:
      'Non. Nous créons votre site, vous le gérez ensuite. Notre équipe le conçoit et le développe pour votre entreprise, dans un projet qui lui est propre : vous n’avez ni modèle à choisir ni générateur à remplir. Vous suivez l’avancement depuis votre espace ; l’éditeur s’ouvre une fois votre site livré, déjà en ligne.',
  },
  {
    category: 'general',
    question: 'À qui s’adresse Nemasus ?',
    answer:
      'Aux professionnels et aux associations : commerces, artisans, restaurants, professions libérales, cabinets, hôtels, indépendants. Chaque site est conçu pour l’activité qu’il présente — un restaurant gère une carte, un artisan des zones d’intervention, un cabinet des prises de rendez-vous.',
  },
  {
    category: 'commande',
    question: 'Comment commander mon site ?',
    answer:
      'Depuis la page « Commander mon site » : vous choisissez votre activité, indiquez vos coordonnées et décrivez votre projet, puis l’adresse web souhaitée. Aucun compte à créer et aucun paiement à ce stade. Vous recevez aussitôt un e-mail de confirmation avec la référence de votre commande.',
  },
  {
    category: 'commande',
    question: 'Combien coûte un site ?',
    answer:
      'Il n’y a pas de grille tarifaire : chaque site est conçu sur mesure, selon ce dont votre activité a besoin. Après votre commande, nous étudions votre projet et vous adressons par e-mail le montant convenu, avec les modalités de paiement. Rien n’est dû tant que vous n’avez pas effectué le virement.',
  },
  {
    category: 'commande',
    question: 'Comment se passe le paiement ?',
    answer:
      'Par virement bancaire. Nous vous envoyons par e-mail le montant, nos coordonnées bancaires (IBAN) et une référence à indiquer dans le libellé du virement. Aucune carte bancaire n’est demandée sur Nemasus. Nos coordonnées bancaires ne changent jamais par e-mail : en cas de doute sur un message, contactez-nous avant de payer.',
  },
  {
    category: 'commande',
    question: 'Combien de temps faut-il pour avoir mon site en ligne ?',
    answer:
      'Le délai dépend de votre projet : nous vous l’indiquons avec les modalités de paiement. Il court à partir de la réception de tous vos éléments (textes, photos, logo) : c’est souvent ce qui fait la différence. Pendant la conception, nous vous soumettons les étapes importantes depuis votre espace.',
  },
  {
    category: 'acces',
    question: 'Qu’est-ce que le code d’accès ?',
    answer:
      'C’est un code personnel de 12 caractères que nous vous envoyons par e-mail dès réception de votre virement. Vous le saisissez sur la page « Accès client » : votre espace s’ouvre, puis vous choisissez votre mot de passe. Le code est vérifié par nos serveurs, ne sert qu’une seule fois, expire après quelques semaines et ne fonctionne qu’avec votre adresse e-mail.',
  },
  {
    category: 'acces',
    question: 'Mon code ne fonctionne pas : que faire ?',
    answer:
      'Vérifiez la saisie (les tirets et les espaces sont facultatifs). Si le message indique que le code a expiré ou a été désactivé, écrivez-nous : nous vous en envoyons un nouveau. Si le code a déjà servi, connectez-vous avec votre adresse e-mail et votre mot de passe — ou utilisez « Mot de passe oublié ».',
  },
  {
    category: 'acces',
    question: 'Comment me connecter ensuite ?',
    answer:
      'Avec votre adresse e-mail et le mot de passe choisi lors de votre premier accès. En cas d’oubli, « Mot de passe oublié » vous envoie un lien personnel, valable une heure et utilisable une seule fois, pour en choisir un nouveau.',
  },
  {
    category: 'acces',
    question: 'Quelqu’un d’autre peut-il voir mon espace ?',
    answer:
      'Non. Chaque espace est isolé : les données de votre entreprise ne sont accessibles qu’aux personnes de votre organisation, et la règle est appliquée par la base de données elle-même. Vous pouvez inviter des collaborateurs, chacun avec son propre compte et son rôle.',
  },
  {
    category: 'contenu',
    question: 'Dois-je savoir utiliser un ordinateur ?',
    answer:
      'Savoir écrire un e-mail suffit. Pendant la construction, votre espace vous montre l’avancement et ce que nous attendons de vous. Après la livraison, vous modifiez les champs proposés par votre site, voyez l’aperçu, puis publiez. Aucune notion de code, de serveur ou de base de données n’est nécessaire.',
  },
  {
    category: 'contenu',
    question: 'Que se passe-t-il si je n’ai ni logo ni photos ?',
    answer:
      'Ce n’est pas bloquant. Nous construisons une identité typographique soignée et vous guidons sur les visuels à produire, en vous indiquant précisément ce qui est utile. Beaucoup d’entreprises s’en sortent très bien avec quelques photos prises au téléphone, dans de bonnes conditions de lumière.',
  },
  {
    category: 'contenu',
    question: 'Puis-je modifier mon site moi-même après la livraison ?',
    answer:
      'Oui, c’est le principe. Textes, photos, horaires, prestations, actualités : vous modifiez les contenus que votre site prévoit, voyez l’aperçu de votre vrai site, enregistrez un brouillon, puis publiez. La publication est réellement déployée, et vous pouvez restaurer une version antérieure.',
  },
  {
    category: 'contenu',
    question: 'Puis-je modifier mon site avant sa livraison ?',
    answer:
      'Non : pendant la construction, votre site est entre les mains de notre équipe. Vous nous transmettez vos informations et vos fichiers, et vous validez les étapes importantes depuis votre espace. L’éditeur s’ouvre le jour de la livraison, sur un site déjà en ligne.',
  },
  {
    category: 'contenu',
    question: 'Et si je veux une modification importante que je ne sais pas faire ?',
    answer:
      'Écrivez-nous depuis votre espace. Le design, la structure et le code de votre site restent entre nos mains, pour que rien ne se casse par inadvertance. Une nouvelle page, une nouvelle fonctionnalité ou une refonte font l’objet d’un accord préalable avec vous avant toute intervention.',
  },
  {
    category: 'technique',
    question: 'Que se passe-t-il quand je clique sur « Publier » ?',
    answer:
      'Vos modifications sont vérifiées, enregistrées dans le code de votre site, puis déployées par Cloudflare. Nemasus n’affiche « Publié » qu’une fois ce déploiement confirmé. Si quelque chose échoue, la version précédente reste en ligne et l’erreur vous est clairement indiquée. Chaque publication devient une version datée, que vous pouvez restaurer.',
  },
  {
    category: 'technique',
    question: 'À qui appartient mon nom de domaine ?',
    answer:
      'À vous. Si vous le possédez déjà, nous le connectons sans le transférer. Si nous l’achetons pour vous, il est enregistré à votre nom et nous vous transmettons les informations nécessaires pour en reprendre la main quand vous le souhaitez.',
  },
  {
    category: 'technique',
    question: 'Où sont hébergées mes données ?',
    answer:
      'Votre site est un projet indépendant : son code est conservé dans un dépôt GitHub qui lui est propre, et il est servi par le réseau mondial de Cloudflare. Vos données — contenus, messages, réservations, contacts — sont stockées dans une base PostgreSQL hébergée par Supabase, dans une région européenne. La liste complète de nos sous-traitants est publiée et tenue à jour.',
  },
  {
    category: 'technique',
    question: 'Mon site apparaîtra-t-il sur Google ?',
    answer:
      'Nous mettons en place tout ce qui relève de la technique : structure des pages, balises, données structurées adaptées à votre activité, plan du site, vitesse d’affichage, version mobile. Nous ne promettons pas une position précise sur Google — personne ne peut honnêtement le garantir. Le référencement dépend aussi de votre concurrence locale et de la fraîcheur de vos contenus.',
  },
  {
    category: 'technique',
    question: 'Prenez-vous une commission sur mes ventes ?',
    answer:
      'Non. Si votre site encaisse des paiements (boutique, acomptes), ils passent par votre propre compte Stripe, ouvert à votre nom. Nemasus n’est pas dans ce circuit financier et ne prélève aucune commission ; seuls les frais de Stripe s’appliquent, facturés directement par Stripe.',
  },
  {
    category: 'juridique',
    question: 'Qui est propriétaire du contenu de mon site ?',
    answer:
      'Vous. Vos textes, vos photos et vos données vous appartiennent. Vous pouvez les exporter à tout moment depuis votre espace, dans un format réutilisable.',
  },
  {
    category: 'juridique',
    question: 'Qui se cache derrière Nemasus ?',
    answer:
      'Nemasus est le nom commercial d’une société française. Son identité complète (raison sociale, siège, numéro d’immatriculation, direction de la publication) figure dans les mentions légales, et nos conditions générales de vente encadrent chaque commande.',
  },
];

/**
 * Sélection affichée sur la page d'accueil, dans cet ordre.
 *
 * Les entrées sont retrouvées par leur question exacte plutôt que par leur
 * position : réordonner FAQ_ITEMS ne casse donc pas cette sélection, et une
 * question renommée échoue bruyamment au démarrage plutôt que d'afficher
 * silencieusement la mauvaise réponse.
 */
const HOMEPAGE_QUESTIONS: readonly string[] = [
  'Est-ce que je construis mon site moi-même ?',
  'Combien coûte un site ?',
  'Comment se passe le paiement ?',
  'Qu’est-ce que le code d’accès ?',
  'Puis-je modifier mon site moi-même après la livraison ?',
  'Mon site apparaîtra-t-il sur Google ?',
];

export const HOMEPAGE_FAQ: readonly FaqItem[] = HOMEPAGE_QUESTIONS.map((question) => {
  const item = FAQ_ITEMS.find((candidate) => candidate.question === question);
  if (!item) throw new Error(`Question de la page d’accueil introuvable : ${question}`);
  return item;
});

export const FAQ_CATEGORIES: Record<FaqItem['category'], string> = {
  general: 'Questions générales',
  commande: 'Commande et paiement',
  acces: 'Code d’accès et compte',
  contenu: 'Contenu et modifications',
  technique: 'Technique et hébergement',
  juridique: 'Droits et identité',
};
