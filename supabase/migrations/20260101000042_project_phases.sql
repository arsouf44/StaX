-- =============================================================================
--  StaX — 0042 · Les vraies etapes d'un projet
--
--  Un site StaX est concu et developpe par l'equipe, dans un projet
--  independant (depot GitHub, projet Cloudflare), puis rattache a StaX et
--  livre au client. Le suivi affiche au client doit correspondre a ces etapes
--  reelles, pas a une barre de progression :
--
--    Commande validee → Informations recues → Conception → Developpement
--      → Verifications → Mise en ligne → Livraison
--
--  Les valeurs existantes restent valides (donnees anterieures) ; les
--  nouvelles decrivent le parcours cible. Elles sont ajoutees seules dans ce
--  fichier : PostgreSQL interdit d'utiliser une valeur d'enumeration dans la
--  transaction qui l'a creee.
-- =============================================================================

alter type app.project_status add value if not exists 'design' after 'assets_pending';
alter type app.project_status add value if not exists 'development' after 'design';
alter type app.project_status add value if not exists 'verification' after 'development';
alter type app.project_status add value if not exists 'deploying' after 'verification';
alter type app.project_status add value if not exists 'delivered' after 'deploying';
