/**
 * Substitut de `server-only` pour les tests : le paquet reel leve une erreur
 * hors d'un rendu serveur React. Les tests appellent directement des modules
 * serveur (routes de webhooks, publication) ; ils n'ont rien a proteger.
 */
export {};
