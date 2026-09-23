import { expect, test } from '@playwright/test';
import { createCustomerWithPaidOrder, serviceClient, uniqueSuffix } from './support/stack';

/**
 * Signalement d un contenu illicite (DSA, article 16) : un visiteur, sans
 * compte, signale une page d un site heberge. Le signalement est enregistre,
 * rattache au bon site, et la personne recoit une reference.
 */

test('un visiteur signale un contenu d’un site hébergé', async ({ page }) => {
  const suffix = uniqueSuffix();
  const site = await createCustomerWithPaidOrder({
    businessName: `Fleurs Iris ${suffix}`,
    subdomain: `fleurs-${suffix}`,
  });
  const url = `https://${site.hostname}/`;

  await page.goto('/signaler-un-contenu');
  await page.getByLabel('Adresse exacte du contenu').fill(url);
  await page.getByLabel('Motif').selectOption('defamation');
  await page
    .getByLabel('Pourquoi ce contenu est-il illicite ?')
    .fill('La page d’accueil contient des propos diffamatoires envers mon entreprise.');
  await page.getByLabel('Votre nom').fill('Jean Test');
  await page.getByLabel('Votre adresse e-mail').fill(`signalement-${suffix}@exemple.test`);
  await page.getByLabel(/Je déclare de bonne foi/).check();
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();

  const confirmation = page.getByTestId('report-reference');
  await expect(confirmation).toContainText(/S-\d{4}-[0-9A-F]{6}/);
  const reference = /S-\d{4}-[0-9A-F]{6}/.exec(await confirmation.innerText())?.[0] ?? '';

  const stored = await serviceClient()
    .from('content_reports')
    .select('site_id, category, status, reporter_email')
    .eq('reference', reference)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data?.site_id).toBe(site.siteId);
  expect(stored.data?.category).toBe('defamation');
  expect(stored.data?.status).toBe('received');
});
