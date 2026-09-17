import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Adaptation OpenNext -> Cloudflare Workers.
 *
 * Le cache incrementiel reste desactive tant qu un binding R2 n est pas
 * provisionne : mieux vaut un rendu systematique qu un cache a moitie
 * configure, qui produirait des pages obsoletes ou, pire, croisees entre
 * plusieurs clients.
 */
export default defineCloudflareConfig({});
