import type { MetadataRoute } from 'next';
import { isIndexable, platformUrl } from '@nemasus/config';

/**
 * Chemins sans rien d'indexable, qui exposeraient des pages personnelles dans
 * les resultats de recherche, ou qui ne sont pas des pages du tout.
 *
 * Ces regles doublent le `noindex` porte par les pages elles-memes : un robot
 * qui respecte robots.txt ne les demande jamais, et celui qui les demande
 * malgre tout trouve l'en-tete qui les exclut.
 */
const PRIVATE_PATHS = [
  '/app/',
  '/admin/',
  '/commander/',
  '/connexion',
  '/acces',
  '/mfa',
  '/mot-de-passe-oublie',
  '/nouveau-mot-de-passe',
  '/invitation',
  '/bienvenue',
  '/compte-desactive',
  '/auth/',
  '/api/',
  // Le pont de mesure d'audience et les schemas du contrat d'edition sont des
  // fichiers techniques : indexes, ils n'apportent rien et polluent le site.
  '/bridge/',
  '/schemas/',
];

/**
 * Robots d'indexation generative.
 *
 * Nemasus se vend a des entreprises qui cherchent « faire faire son site » : la
 * reponse arrive aujourd'hui autant par un assistant que par une page de
 * resultats. Ces robots sont donc explicitement autorises, aux memes
 * conditions que les moteurs classiques — tout le site public, rien de prive.
 *
 * Nommer chaque robot a une consequence qu'il faut connaitre : un groupe
 * `User-agent` dedie remplace entierement le groupe `*` pour ce robot. C'est
 * la raison pour laquelle la liste des chemins prives y est repetee, et non
 * laissee a l'heritage — un oubli ici ouvrirait les espaces clients a
 * l'entrainement des modeles.
 *
 * Deux familles s'y melent volontairement :
 *  - les robots de recherche assistee, qui citent la page en reponse a une
 *    question (OAI-SearchBot, Claude-SearchBot, PerplexityBot, DuckAssistBot) ;
 *  - les robots d'exploration qui alimentent aussi l'entrainement (GPTBot,
 *    ClaudeBot, Google-Extended, Applebot-Extended). Les laisser passer est un
 *    choix assume : c'est ce qui permet a un assistant de decrire Nemasus
 *    correctement plutot que de l'inventer.
 */
const GENERATIVE_AGENTS = [
  // OpenAI
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google (Gemini, resumes IA) et Apple (Siri, Apple Intelligence)
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  // Microsoft Copilot passe par Bingbot ; les autres assistants grand public
  'DuckAssistBot',
  'Amazonbot',
  'Meta-ExternalAgent',
  'MistralAI-User',
  'cohere-ai',
];

/**
 * Directives destinees aux robots.
 *
 * TOUT est interdit a l indexation dans deux cas :
 *  - hors production, parce qu'une preversion indexee par erreur cannibalise
 *    le referencement du site reel et expose des contenus non finalises ;
 *  - quand l'adresse publique est celle d'un deploiement (`.vercel.app`)
 *    faute de domaine configure, parce que le site serait indexe sous une
 *    adresse technique qui n'est pas la sienne et qui changera.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = platformUrl().replace(/\/+$/, '');

  if (!isIndexable()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      ...GENERATIVE_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: PRIVATE_PATHS,
      })),
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
