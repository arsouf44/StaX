-- =============================================================================
--  StaX — 0029 · Statut de commande « interne »
--
--  Une commande passee par un compte interne StaX n'est ni « brouillon » (elle
--  est honoree immediatement), ni « payee » (aucun paiement n'a eu lieu, et
--  l'ecrire serait fabriquer un faux encaissement). Elle a son propre statut.
--
--  Ce fichier ne contient QUE l'ajout de la valeur : PostgreSQL refuse
--  d'utiliser une valeur d'enumeration dans la transaction qui l'a creee, et
--  chaque migration s'applique dans sa propre transaction.
-- =============================================================================

alter type app.order_status add value if not exists 'internal';
