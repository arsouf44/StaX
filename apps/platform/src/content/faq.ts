import { refundPolicyConfig } from '@stax/config';
/**
 * Questions frequentes.
 *
 * Une seule source, reutilisee par la page d accueil, la page /faq et les
 * donnees structurees FAQPage. Les reponses sont concretes et ne promettent
 * rien que le produit ne fasse reellement : nous creons le site, le client le
 * gere ensuite ; la maintenance est mensuelle et commence a la livraison.
 */

export interface FaqItem {
  question: string;
  answer: string;
  category: 'general' | 'tarifs' | 'technique' | 'contenu' | 'juridique';
}

const refund = refundPolicyConfig();

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    category: 'general',
    question: 'Est-ce que je construis mon site moi-même ?',
    answer:
      'Non. Nous créons votre site, vous le gérez ensuite. Notre équipe le conçoit et le développe pour votre entreprise, dans un projet qui lui est propre : pas de modèle à personnaliser, pas de générateur automatique. Vous suivez l’avancement depuis votre espace ; l’éditeur s’ouvre une fois votre site livré, déjà en ligne.',
  },
  {
    category: 'general',
    question: 'Combien de temps faut-il pour avoir mon site en ligne ?',
    answer:
      'Le délai dépend de l’offre : il est indiqué pour chacune sur la page Tarifs et rappelé dans votre commande. Il court à partir de la réception de tous vos éléments (textes, photos, logo), pas de la commande : c’est souvent ce qui fait la différence. Pendant la conception, nous vous soumettons les étapes importantes, et vos demandes de correction sont incluses.',
  },
  {
    category: 'general',
    question: 'Dois-je savoir utiliser un ordinateur ?',
    answer:
      'Savoir écrire un e-mail suffit. Pendant la construction, votre espace vous montre l’avancement et ce que nous attendons de vous. Après la livraison, vous cliquez sur un texte ou une image de votre site, modifiez les champs proposés, puis publiez. Aucune notion de code, de serveur ou de base de données n’est nécessaire.',
  },
  {
    category: 'general',
    question: 'Que se passe-t-il si je n’ai ni logo ni photos ?',
    answer:
      'Ce n’est pas bloquant. Nous construisons une identité typographique soignée et vous guidons sur les visuels à produire, en vous indiquant précisément ce qui est utile. Beaucoup de métiers s’en sortent très bien avec quelques photos prises au téléphone, dans de bonnes conditions de lumière.',
  },
  {
    category: 'contenu',
    question: 'Puis-je modifier mon site moi-même après la livraison ?',
    answer:
      'Oui, c’est le principe. Textes, photos, horaires, tarifs, prestations, actualités : vous modifiez les contenus que votre site prévoit, voyez l’aperçu de votre vrai site, enregistrez un brouillon, puis publiez. La publication est réellement déployée sur votre site, et vous pouvez restaurer une version antérieure.',
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
      'Écrivez-nous depuis votre espace : le support est inclus dans la maintenance mensuelle. Le design, la structure et le code de votre site restent entre nos mains, pour que rien ne se casse par inadvertance. Une nouvelle page, une nouvelle fonctionnalité ou une refonte font l’objet d’un devis avant toute intervention.',
  },
  {
    category: 'tarifs',
    question: 'Quelle différence entre les offres ?',
    answer:
      'La quantité et la nature du travail : nombre de pages, richesse du design, fonctionnalités (réservations, boutique, multilingue…) et accompagnement. Il n’existe pas d’offre « modèle » et d’offre « personnalisée » : dès l’Essentiel, votre site est conçu pour votre entreprise. L’offre Exceptionnel ajoute une direction artistique poussée, travaillée écran par écran. La page Tarifs détaille ce que comprend chaque offre.',
  },
  {
    category: 'tarifs',
    question: 'Pourquoi un paiement initial ET une maintenance mensuelle ?',
    answer:
      'Le paiement initial couvre la conception, le développement et la mise en ligne de votre site : c’est un travail réalisé pour votre entreprise. La maintenance mensuelle, qui ne commence qu’à la livraison, couvre l’hébergement, le certificat HTTPS, l’infrastructure de publication, la conservation des versions, la surveillance, les mises à jour nécessaires, le support et l’accès à l’éditeur. Un site web n’est pas un objet qu’on livre et qu’on oublie : il doit rester à jour et disponible.',
  },
  {
    category: 'tarifs',
    question: 'Quand la maintenance commence-t-elle ?',
    answer:
      'Le jour de la livraison de votre site, et pas avant : rien n’est prélevé au titre de la maintenance pendant sa conception et son développement. Elle est ensuite prélevée chaque mois, à la même date, sur la carte utilisée pour votre commande.',
  },
  {
    category: 'tarifs',
    question: 'Prenez-vous une commission sur mes ventes ?',
    answer:
      'Non. Les paiements encaissés sur votre site passent par votre propre compte Stripe, ouvert à votre nom. StaX n’est pas dans ce circuit financier et ne prélève aucune commission. Seuls les frais bancaires de Stripe s’appliquent, facturés directement par Stripe.',
  },
  {
    category: 'tarifs',
    question: 'Puis-je arrêter la maintenance ?',
    answer:
      'Oui, à tout moment, en ligne depuis votre espace, sans justification ni durée minimale. La résiliation prend effet à la fin du mois en cours : aucun prélèvement n’intervient ensuite. Votre site reste en ligne jusqu’à cette date, puis pendant une période de continuité. Vos données ne sont pas supprimées : vous pouvez les exporter ou réactiver la maintenance.',
  },
  {
    category: 'tarifs',
    question: 'Que devient mon site si j’arrête la maintenance ?',
    answer:
      'À la fin de la période payée, votre site reste accessible pendant une période de continuité. Il peut ensuite être suspendu — ni supprimé ni effacé. Vous pouvez exporter vos contenus, vos messages et vos contacts, demander une copie du code source de votre site, ou réactiver la maintenance plus tard.',
  },
  {
    category: 'technique',
    question: 'Que se passe-t-il quand je clique sur « Publier » ?',
    answer:
      'Vos modifications sont vérifiées, enregistrées dans le code de votre site, puis déployées par Cloudflare. StaX n’affiche « Publié » qu’une fois ce déploiement confirmé. Si quelque chose échoue, la version précédente reste en ligne et l’erreur vous est clairement indiquée. Chaque publication devient une version datée, que vous pouvez restaurer.',
  },
  {
    category: 'technique',
    question: 'À qui appartient mon nom de domaine ?',
    answer:
      'À vous. Si vous le possédez déjà, nous le connectons sans le transférer. Si nous l’achetons pour vous, il est enregistré pour votre compte et nous vous transmettons les informations nécessaires pour en reprendre la main quand vous le souhaitez. Dans les deux cas, il pointe vers le déploiement de votre propre site.',
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
      'Nous mettons en place tout ce qui relève de la technique : structure des pages, balises, données structurées adaptées à votre métier, plan du site, vitesse d’affichage, version mobile. Nous ne promettons pas une position précise sur Google — personne ne peut honnêtement le garantir. Le référencement dépend aussi de votre concurrence locale et de la fraîcheur de vos contenus.',
  },
  {
    category: 'juridique',
    question: 'Et si le site ne me convient pas ?',
    answer: `Vous disposez de ${refund.windowDays} jours après la livraison de votre site pour demander un remboursement. Si un nom de domaine a réellement été acheté pour vous, son coût est déduit puisqu’il est déjà engagé ; sinon rien n’est retenu. Cette garantie commerciale s’ajoute à vos droits légaux et ne les remplace pas.`,
  },
  {
    category: 'juridique',
    question: 'Qui est propriétaire du contenu de mon site ?',
    answer:
      'Vous. Vos textes, vos photos et vos données vous appartiennent. Vous pouvez les exporter à tout moment depuis votre espace, dans un format réutilisable, et obtenir en fin de contrat une copie du code source de votre site.',
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
  'Puis-je modifier mon site moi-même après la livraison ?',
  'Quand la maintenance commence-t-elle ?',
  'Pourquoi un paiement initial ET une maintenance mensuelle ?',
  'Prenez-vous une commission sur mes ventes ?',
  'Et si le site ne me convient pas ?',
];

export const HOMEPAGE_FAQ: readonly FaqItem[] = HOMEPAGE_QUESTIONS.map((question) => {
  const item = FAQ_ITEMS.find((candidate) => candidate.question === question);
  if (!item) throw new Error(`Question de la page d’accueil introuvable : ${question}`);
  return item;
});

export const FAQ_CATEGORIES: Record<FaqItem['category'], string> = {
  general: 'Questions générales',
  tarifs: 'Tarifs et abonnement',
  contenu: 'Contenu et modifications',
  technique: 'Technique et hébergement',
  juridique: 'Garanties et droits',
};
