import { describe, expect, it } from 'vitest';
import { hasSessionCookie, isProtectedPath, loginRedirect } from '~/lib/session-cookie';

/**
 * Une page d'administration demandée sans session répond une vraie
 * redirection (307), avant tout rendu — et non « 200 » suivi d'une
 * redirection pendant le streaming.
 */
describe('redirection des pages protégées sans session', () => {
  it('protège l’espace client et l’administration, pas le site public', () => {
    expect(isProtectedPath('/app')).toBe(true);
    expect(isProtectedPath('/app/statistiques')).toBe(true);
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/admin/sante')).toBe(true);
    expect(isProtectedPath('/application')).toBe(false);
    expect(isProtectedPath('/administration-publique')).toBe(false);
    expect(isProtectedPath('/tarifs')).toBe(false);
  });

  it('reconnaît le cookie de session Supabase, même découpé', () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie([{ name: 'nemasus_org' }, { name: 'sb-other' }])).toBe(false);
    expect(hasSessionCookie([{ name: 'sb-tkgavassmicxghrvseue-auth-token' }])).toBe(true);
    expect(hasSessionCookie([{ name: 'sb-127-auth-token.0' }])).toBe(true);
  });

  it('ramène à la page demandée après la connexion', () => {
    const url = loginRedirect('https://nemasus.example/admin/sante', '/admin/sante', '?onglet=1');
    expect(url.pathname).toBe('/connexion');
    expect(url.searchParams.get('suivant')).toBe('/admin/sante?onglet=1');
    expect(url.origin).toBe('https://nemasus.example');
  });
});
