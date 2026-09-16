import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemoryRateLimitStore,
  RATE_LIMITS,
  buildCacheKey,
  csvCell,
  enforceRateLimit,
  escapeHtml,
  generateActivationCode,
  guardOutboundUrl,
  isPrivateHost,
  isSubdomainAvailable,
  normalizeActivationCode,
  normalizeHostname,
  resolveHostname,
  safeFileName,
  safeLinkHref,
  safeRedirectPath,
  sanitizePlainText,
  sanitizeRichText,
  scoreSubmission,
  serializeJsonLd,
  suggestSubdomain,
  tenantStoragePath,
  timingSafeEqual,
  validateUpload,
} from '@stax/security';

const NUL = String.fromCharCode(0);
const CRLF = String.fromCharCode(13, 10);

describe('redirection ouverte', () => {
  it('accepte un chemin interne', () => {
    expect(safeRedirectPath('/app/messages')).toBe('/app/messages');
    expect(safeRedirectPath('/app?tab=1#section')).toBe('/app?tab=1#section');
  });

  it('refuse toute destination externe', () => {
    for (const hostile of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      '///evil.example',
      'http://evil.example/app',
      '',
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(hostile as string | null)).toBe('/');
    }
  });

  it('refuse les caracteres de controle', () => {
    expect(safeRedirectPath('/app' + CRLF + 'Set-Cookie: x=1')).toBe('/');
    expect(safeRedirectPath('/app' + NUL)).toBe('/');
  });
});

describe('liens de contenu', () => {
  it('accepte uniquement des protocoles surs', () => {
    expect(safeLinkHref('https://exemple.fr')).toBe('https://exemple.fr/');
    expect(safeLinkHref('mailto:contact@exemple.fr')).toBe('mailto:contact@exemple.fr');
    expect(safeLinkHref('tel:+33123456789')).toBe('tel:+33123456789');
    expect(safeLinkHref('/contact')).toBe('/contact');
    expect(safeLinkHref('javascript:alert(1)')).toBeNull();
    expect(safeLinkHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeLinkHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeLinkHref('//evil.example')).toBeNull();
  });
});

describe('SSRF', () => {
  it('identifie les hotes internes', () => {
    for (const host of [
      'localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1',
      '169.254.169.254', 'metadata.google.internal', '::1', 'db.internal', 'printer.local',
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
    expect(isPrivateHost('exemple.fr')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });

  it('refuse les requetes sortantes dangereuses', () => {
    expect(guardOutboundUrl('http://exemple.fr').allowed).toBe(false);
    expect(guardOutboundUrl('https://169.254.169.254/latest/meta-data').allowed).toBe(false);
    expect(guardOutboundUrl('https://user:pass@exemple.fr').allowed).toBe(false);
    expect(guardOutboundUrl('https://exemple.fr:8080').allowed).toBe(false);
    expect(guardOutboundUrl('file:///etc/passwd').allowed).toBe(false);
    expect(guardOutboundUrl('https://exemple.fr/image.png').allowed).toBe(true);
  });
});

describe('traversee de chemin', () => {
  it('neutralise un nom de fichier hostile', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
    expect(safeFileName('photo ete.jpg')).toBe('photo-ete.jpg');
    expect(safeFileName('.htaccess')).toBe('htaccess');
    expect(safeFileName('...')).toBe('fichier');
  });

  it('cloisonne le chemin de stockage par tenant', () => {
    const org = '11111111-1111-4111-8111-111111111111';
    const site = '22222222-2222-4222-8222-222222222222';
    const path = tenantStoragePath(org, site, '../../evil.png', 1000);
    expect(path).toBe(org + '/sites/' + site + '/1000-evil.png');
    expect(path.startsWith(org)).toBe(true);
    expect(() => tenantStoragePath('not-a-uuid', null, 'a.png')).toThrow();
    expect(() => tenantStoragePath(org, '../other', 'a.png')).toThrow();
  });
});

describe('XSS', () => {
  it('echappe le HTML', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('supprime les balises et attributs dangereux du texte enrichi', () => {
    const hostile = [
      '<p onclick="steal()">Bonjour</p>',
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<iframe src="https://evil.example"></iframe>',
      '<a href="javascript:alert(1)">clic</a>',
      '<svg/onload=alert(1)>',
      '<style>body{display:none}</style>',
    ].join('');
    const clean = sanitizeRichText(hostile);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('<svg');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('<p>Bonjour</p>');
  });

  it('conserve le balisage legitime et securise les liens', () => {
    const clean = sanitizeRichText(
      '<p>Un <strong>texte</strong> avec un <a href="https://exemple.fr" title="t">lien</a>.</p>',
    );
    expect(clean).toContain('<strong>texte</strong>');
    expect(clean).toContain('href="https://exemple.fr"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
  });

  it('referme les balises laissees ouvertes', () => {
    expect(sanitizeRichText('<p><strong>coucou')).toBe('<p><strong>coucou</strong></p>');
  });

  it('nettoie le texte simple', () => {
    expect(sanitizePlainText('<b>Bonjour</b>' + NUL + ' tout le monde')).toBe(
      'Bonjour tout le monde',
    );
  });

  it('protege le JSON-LD contre la fermeture de balise script', () => {
    const payload = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(payload).not.toContain('</script>');
    expect(payload).toContain('\\u003c');
  });
});

describe('injection de formule CSV', () => {
  it('neutralise les cellules executables', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('+33612345678')).toBe('"\'+33612345678"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('-2')).toBe('"\'-2"');
    expect(csvCell('Bonjour "toi"')).toBe('"Bonjour ""toi"""');
  });
});

describe('resolution du tenant par hostname', () => {
  const config = {
    platformHost: 'stax.fr',
    sitesDomain: 'sites.stax.fr',
    previewDomain: 'preview.sites.stax.fr',
  };

  it('normalise l en-tete Host', () => {
    expect(normalizeHostname('Exemple.FR:8080')).toBe('exemple.fr');
    expect(normalizeHostname('exemple.fr.')).toBe('exemple.fr');
    expect(normalizeHostname('  ')).toBeNull();
    expect(normalizeHostname(null)).toBeNull();
  });

  it('distingue plateforme, sous-domaine, apercu et domaine client', () => {
    expect(resolveHostname('stax.fr', config).kind).toBe('platform');
    expect(resolveHostname('www.stax.fr', config).kind).toBe('platform');
    expect(resolveHostname('preview.sites.stax.fr', config).kind).toBe('preview');

    const tenant = resolveHostname('restaurant-dupont.sites.stax.fr', config);
    expect(tenant.kind).toBe('platform-subdomain');
    expect(tenant.subdomain).toBe('restaurant-dupont');

    expect(resolveHostname('www.restaurantdupont.fr', config).kind).toBe('custom');
  });

  it('refuse un sous-domaine imbrique ou malforme', () => {
    expect(resolveHostname('a.b.sites.stax.fr', config).kind).toBe('invalid');
    expect(resolveHostname('-mauvais.sites.stax.fr', config).kind).toBe('invalid');
    expect(resolveHostname('', config).kind).toBe('invalid');
    expect(resolveHostname('pas-de-point', config).kind).toBe('invalid');
  });

  it('protege les sous-domaines reserves', () => {
    expect(isSubdomainAvailable('admin')).toBe(false);
    expect(isSubdomainAvailable('api')).toBe(false);
    expect(isSubdomainAvailable('www')).toBe(false);
    expect(isSubdomainAvailable('restaurant-dupont')).toBe(true);
    expect(isSubdomainAvailable('-invalide')).toBe(false);
  });

  it('propose un sous-domaine a partir du nom commercial', () => {
    expect(suggestSubdomain('Restaurant Chateau d Ete')).toBe('restaurant-chateau-d-ete');
  });
});

describe('cle de cache edge', () => {
  it('isole chaque tenant et chaque version', () => {
    const a = buildCacheKey({ hostname: 'a.sites.stax.fr', path: '/', contentHash: 'abc123ff' });
    const b = buildCacheKey({ hostname: 'b.sites.stax.fr', path: '/', contentHash: 'abc123ff' });
    const c = buildCacheKey({ hostname: 'a.sites.stax.fr', path: '/', contentHash: 'def456aa' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain('a.sites.stax.fr');
  });

  it('refuse une empreinte forgee', () => {
    expect(() =>
      buildCacheKey({ hostname: 'a.sites.stax.fr', path: '/', contentHash: '../../etc' }),
    ).toThrow();
  });
});

describe('comparaison a temps constant', () => {
  it('compare correctement', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('codes d activation', () => {
  it('produit un code lisible et sans caractere ambigu', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateActivationCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('normalise une saisie approximative', () => {
    expect(normalizeActivationCode('a7k4 m92p xr3t')).toBe('A7K4-M92P-XR3T');
    expect(normalizeActivationCode('A7K4M92PXR3T')).toBe('A7K4-M92P-XR3T');
  });

  it('ne produit pas deux fois le meme code', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateActivationCode()));
    expect(codes.size).toBe(500);
  });
});

describe('televersement de fichiers', () => {
  it('accepte une image valide', () => {
    const result = validateUpload({
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 500_000,
      header: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect(result.valid).toBe(true);
  });

  it('refuse un SVG, vecteur d execution de script', () => {
    expect(
      validateUpload({ fileName: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 1000 }).valid,
    ).toBe(false);
  });

  it('refuse un executable ou une page HTML deguises', () => {
    expect(validateUpload({ fileName: 'x.html', mimeType: 'text/html', sizeBytes: 100 }).valid).toBe(
      false,
    );
    expect(
      validateUpload({ fileName: 'x.php', mimeType: 'application/x-httpd-php', sizeBytes: 100 })
        .valid,
    ).toBe(false);
  });

  it('refuse une extension incoherente avec le type declare', () => {
    const result = validateUpload({ fileName: 'virus.exe', mimeType: 'image/png', sizeBytes: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('extension');
  });

  it('refuse un fichier dont la signature ne correspond pas', () => {
    const result = validateUpload({
      fileName: 'faux.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      header: new Uint8Array([0x3c, 0x21, 0x44, 0x4f]),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('contenu');
  });

  it('applique le plafond de taille', () => {
    expect(
      validateUpload({ fileName: 'gros.jpg', mimeType: 'image/jpeg', sizeBytes: 50_000_000 }).valid,
    ).toBe(false);
    expect(
      validateUpload({
        fileName: 'ok.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 900_000,
        maxBytes: 500_000,
      }).valid,
    ).toBe(false);
  });
});

describe('limitation de debit', () => {
  let store: MemoryRateLimitStore;
  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  it('bloque au-dela du seuil de connexion', async () => {
    const max = RATE_LIMITS.login.max;
    for (let i = 0; i < max; i += 1) {
      const d = await enforceRateLimit(store, 'login', 'i:hash');
      expect(d.allowed).toBe(true);
    }
    const blocked = await enforceRateLimit(store, 'login', 'i:hash');
    expect(blocked.allowed).toBe(false);
    expect(blocked.error?.code).toBe('rate_limited');
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('compte separement chaque identite', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max; i += 1) {
      await enforceRateLimit(store, 'login', 'i:a');
    }
    expect((await enforceRateLimit(store, 'login', 'i:a')).allowed).toBe(false);
    expect((await enforceRateLimit(store, 'login', 'i:b')).allowed).toBe(true);
  });
});

describe('detection de pourriel', () => {
  it('rejette un champ piege rempli', () => {
    const v = scoreSubmission({ honeypot: 'http://spam', message: 'Bonjour' });
    expect(v.isSpam).toBe(true);
    expect(v.reasons).toContain('champ piege rempli');
  });

  it('laisse passer un message legitime', () => {
    const v = scoreSubmission({
      honeypot: '',
      elapsedMs: 45_000,
      message:
        'Bonjour, je souhaiterais reserver une table pour six personnes samedi soir vers 20h. Merci.',
      email: 'client@exemple.fr',
    });
    expect(v.isSpam).toBe(false);
    expect(v.score).toBeLessThan(0.3);
  });

  it('marque les signaux combines comme suspects', () => {
    const v = scoreSubmission({
      elapsedMs: 300,
      message:
        'SEO REFERENCEMENT GARANTI PREMIERE PAGE DE GOOGLE http://a.fr http://b.fr http://c.fr http://d.fr',
      email: 'bot@yopmail.com',
    });
    expect(v.isSpam).toBe(true);
  });
});
