import { deliveryPolicyConfig } from '@stax/config';
/**
 * Questions frequentes.
 *
 * Une seule source, reutilisee par la page d accueil, la page /faq et les
 * donnees structurees FAQPage. Les reponses sont concretes et ne promettent
 * rien que le produit ne fasse reellement.
 */

export interface FaqItem {
  question: string;
  answer: string;
  category: 'general' | 'tarifs' | 'technique' | 'contenu' | 'juridique';
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    category: 'general',
    question: 'Combien de temps faut-il pour avoir mon site en ligne ?',
    answer: `Comptez ${deliveryPolicyConfig().label} entre le moment où nous avons tous vos éléments (textes, photos, logo) et la mise en ligne. Le délai court à partir de la réception de ces éléments, pas de la commande : c’est souvent ce qui fait la différence entre une et trois semaines. Vous relisez une version privée avant toute publication, et vos demandes de correction sont incluses.`,
  },
  {
    category: 'general',
    question: 'Dois-je savoir utiliser un ordinateur ?',
    answer:
      'Savoir écrire un e-mail suffit. L’espace client est conçu pour être utilisé sans vocabulaire technique : vous y trouvez « Pages », « Contenu », « Apparence », « Messages », « Publier ». Aucune notion de code, de serveur ou de base de données n’est nécessaire.',
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
      'Oui, c’est même le principe. Textes, photos, horaires, tarifs, plats, prestations, actualités : tout se modifie depuis votre espace. Vous voyez le résultat en aperçu avant de publier, et vous pouvez revenir à une version antérieure si besoin.',
  },
  {
    category: 'contenu',
    question: 'Et si je veux une modification importante que je ne sais pas faire ?',
    answer:
      'La maintenance annuelle inclut notre accompagnement. Vous nous écrivez depuis votre espace, nous intervenons. Pour une refonte de section ou l’ajout d’une fonctionnalité nouvelle, nous vous proposons un devis avant toute intervention.',
  },
  {
    category: 'tarifs',
    question: 'Pourquoi un paiement initial ET un abonnement mensuel ?',
    answer:
      'Le paiement initial couvre la conception et la réalisation de votre site : c’est un travail sur mesure. La maintenance annuelle couvre l’hébergement, le nom de domaine, le certificat HTTPS, les sauvegardes, les mises à jour de sécurité, la surveillance et le support. Un site web n’est pas un objet qu’on livre et qu’on oublie : il doit rester à jour et disponible.',
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
      'Oui, sans engagement de durée. Vous résiliez depuis votre espace, la maintenance prend fin à l’échéance en cours. Votre site reste en ligne jusqu’à cette date, puis pendant une période de continuité. Vos données ne sont pas supprimées à l’échéance : vous pouvez les exporter ou réactiver la maintenance.',
  },
  {
    category: 'tarifs',
    question: 'Que devient mon site si j’arrête la maintenance ?',
    answer:
      'À la fin de la période payée, votre site entre dans une phase de continuité pendant laquelle il reste accessible. Passé ce délai, il est suspendu — mais ni supprimé ni effacé. Vous pouvez exporter vos contenus, vos messages et vos contacts à tout moment, et réactiver votre site plus tard.',
  },
  {
    category: 'technique',
    question: 'À qui appartient mon nom de domaine ?',
    answer:
      'À vous. Si vous le possédez déjà, nous le connectons sans le transférer. Si nous l’achetons pour vous, il est enregistré pour votre compte et nous vous transmettons les informations nécessaires pour en reprendre la main quand vous le souhaitez.',
  },
  {
    category: 'technique',
    question: 'Où sont hébergées mes données ?',
    answer:
      'Les pages de votre site sont servies par le réseau mondial de Cloudflare, pour la rapidité. Vos données — contenus, messages, réservations, contacts — sont stockées dans une base PostgreSQL hébergée par Supabase, dans une région européenne. La liste complète de nos sous-traitants est publiée et tenue à jour.',
  },
  {
    category: 'technique',
    question: 'Mon site apparaîtra-t-il sur Google ?',
    answer:
      'Nous mettons en place tout ce qui relève de la technique : structuré des pages, balises, données structurées adaptées à votre métier, plan de site, vitesse d’affichage, version mobile. Nous ne promettons pas une position précise sur Google — personne ne peut honnêtement le garantir. Le référencement dépend aussi de votre concurrence locale et de la fraîcheur de vos contenus.',
  },
  {
    category: 'juridique',
    question: 'Et si le site ne me convient pas ?',
    answer:
      'Vous disposez de 15 jours après la mise en ligne pour demander un remboursement. Si un nom de domaine a réellement été acheté pour vous, son coût est déduit puisqu’il est déjà engagé ; sinon rien n’est retenu. Cette garantie commerciale s’ajouté à vos droits légaux et ne les remplacé pas.',
  },
  {
    category: 'juridique',
    question: 'Qui est propriétaire du contenu de mon site ?',
    answer:
      'Vous. Vos textes, vos photos et vos données vous appartiennent. Vous pouvez les exporter à tout moment depuis votre espace, dans un format réutilisable.',
  },
];

/**
 * Sélection affichée sur la page d'accueil.
 *
 * Les entrées sont retrouvées par leur question exacte plutôt que par leur
 * position : réordonner FAQ_ITEMS ne casse donc pas cette sélection, et une
 * question renommée échoue bruyamment au démarrage plutôt que d'afficher
 * silencieusement la mauvaise réponse.
 */
const HOMEPAGE_QUESTIONS: readonly string[] = FAQ_ITEMS.filter((item) =>
  [
    'Combien de temps faut-il pour avoir mon site en ligne ?',
    'Pourquoi un paiement initial ET un abonnement mensuel ?',
    'Prenez-vous une commission sur mes ventes ?',
  ].includes(item.question),
).map((item) => item.question);

export const HOMEPAGE_FAQ: readonly FaqItem[] = FAQ_ITEMS.filter(
  (item) =>
    HOMEPAGE_QUESTIONS.includes(item.question) ||
    item.category === 'juridique' ||
    item.question.startsWith('Puis-je modifier'),
).slice(0, 6);

export const FAQ_CATEGORIES: Record<FaqItem['category'], string> = {
  general: 'Questions générales',
  tarifs: 'Tarifs et abonnement',
  contenu: 'Contenu et modifications',
  technique: 'Technique et hébergement',
  juridique: 'Garanties et droits',
};
