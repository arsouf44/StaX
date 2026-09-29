import { describe, expect, it } from 'vitest';
import { postgrestOrValue } from '@nemasus/database';
import { headerSafe } from '@nemasus/emails';
import {
  RATE_LIMITS,
  cleanMessageText,
  cleanSingleLine,
  csvCell,
  sniffMediaType,
} from '@nemasus/security';
import { SITE_SCRIPT } from '../../packages/site-engine/src/render/script';
import { clientIp } from '~/lib/client-ip';
import { ACCEPTED_MEDIA } from '~/lib/media-store';
import { messageRefusal, messageText, singleLineText } from '~/lib/message-text';
import { safeRedirectTarget } from '~/lib/session';

/**
 * Audit de securite du 2026-09-27 : une preuve par correction.
 * Cote base, voir la section « Durcissement (0056) » de tests/sql/rls.test.sql.
 */

const TAB = String.fromCharCode(9);

function headers(values: Record<string, string>) {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

describe('redirection apres connexion', () => {
  it('garde les chemins internes', () => {
    expect(safeRedirectTarget('/app/discussion')).toBe('/app/discussion');
    expect(safeRedirectTarget('/recuperer?code=AB12&email=a%40b.fr')).toBe(
      '/recuperer?code=AB12&email=a%40b.fr',
    );
  });

  it('refuse une tabulation, que le navigateur supprime avant de lire l’adresse', () => {
    // `/<tab>/evil.example` devient `//evil.example` : un site externe.
    expect(safeRedirectTarget(`/${TAB}/evil.example`)).toBe('/app');
    expect(safeRedirectTarget(`/${TAB}${TAB}/evil.example/app`)).toBe('/app');
  });

  it('refuse toute destination externe ou ambigue', () => {
    for (const hostile of [
      '//evil.example',
      '/\\evil.example',
      '/app\\..\\evil',
      'https://evil.example',
      '/javascript:alert(1)',
      '/app\r\nSet-Cookie: x=1',
      '',
      null,
      undefined,
    ]) {
      expect(safeRedirectTarget(hostile)).toBe('/app');
    }
  });
});

describe('messagerie : texte des messages', () => {
  it('conserve le texte visible tel quel, y compris du code', () => {
    const hostile =
      "<script>alert(document.cookie)</script> Robert'); DROP TABLE projects; -- $(rm -rf /) {{7*7}}";
    expect(cleanMessageText(hostile)).toBe(hostile);
  });

  it('retire marques de direction, largeur nulle, controles et caracteres « tag »', () => {
    const tags = String.fromCodePoint(0xe0041, 0xe0042);
    expect(cleanMessageText(`facture\u202Efdp.exe\u200B\u2066 ok\uFEFF\u0007${tags}`)).toBe(
      'facturefdp.exe ok',
    );
  });

  it('garde les accents, les emojis composes et les tabulations', () => {
    expect(cleanMessageText('Été 👩\u200D💻\tça marche')).toBe('Été 👩\u200D💻\tça marche');
    // Forme composee et decomposee du meme « é » : une seule forme stockee.
    expect(cleanMessageText('e\u0301')).toBe('é');
  });

  it('normalise les fins de ligne et limite les lignes vides', () => {
    expect(cleanMessageText('  a\r\nb\rc\n\n\n\n\n\nd  ')).toBe('a\nb\nc\n\n\nd');
    expect(cleanSingleLine('Objet\nsur\u2028trois lignes')).toBe('Objet sur trois lignes');
  });

  it('un message fait de caracteres invisibles est vide, et refuse', () => {
    const schema = messageText(2, 5000, 'Votre message est vide.');
    const result = schema.safeParse('\u200B\u202E \n\t\u2066');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Votre message est vide.');
  });

  it('la longueur comptee est celle du texte nettoye', () => {
    const schema = messageText(2, 10, 'vide');
    expect(schema.safeParse(`abcdefghij${'\u200B'.repeat(50)}`).success).toBe(true);
    expect(schema.safeParse('abcdefghijk').success).toBe(false);
    expect(singleLineText(5, 200, 'L’objet').safeParse('\u202E  a  ').success).toBe(false);
  });

  it('traduit les refus de la base en phrase', () => {
    expect(messageRefusal({ message: 'rate_limited' }, 'x')).toMatch(/Patientez/);
    expect(messageRefusal({ message: 'message_too_long' }, 'x')).toMatch(/5 000/);
    expect(messageRefusal({ message: 'autre' }, 'Echec.')).toBe('Echec.');
    expect(messageRefusal(null, 'Echec.')).toBe('Echec.');
  });

  it('limite le debit des messages d’un client', () => {
    expect(RATE_LIMITS.conversation.max).toBeLessThanOrEqual(30);
    expect(RATE_LIMITS.conversation.windowSeconds).toBeGreaterThanOrEqual(600);
  });
});

describe('adresse IP du visiteur (limitation de debit)', () => {
  const spoofed = headers({
    'cf-connecting-ip': '6.6.6.6',
    'x-real-ip': '203.0.113.7',
    'x-forwarded-for': '203.0.113.7, 10.0.0.1',
  });

  it('sur Vercel, un cf-connecting-ip fourni par le visiteur est ignore', () => {
    expect(clientIp(spoofed, { platform: 'vercel', trustedHeader: null })).toBe('203.0.113.7');
  });

  it('sur Cloudflare, seul cf-connecting-ip (pose par Cloudflare) fait foi', () => {
    expect(clientIp(spoofed, { platform: 'cloudflare', trustedHeader: null })).toBe('6.6.6.6');
    expect(
      clientIp(headers({ 'x-forwarded-for': '1.2.3.4' }), {
        platform: 'cloudflare',
        trustedHeader: null,
      }),
    ).toBeNull();
  });

  it('un en-tete designe explicitement l’emporte, et une valeur absurde est ignoree', () => {
    expect(clientIp(spoofed, { platform: 'vercel', trustedHeader: 'CF-Connecting-IP' })).toBe(
      '6.6.6.6',
    );
    expect(
      clientIp(headers({ 'x-real-ip': '<script>' }), { platform: 'vercel', trustedHeader: null }),
    ).toBeNull();
  });
});

describe('recherche de l’administration', () => {
  it('une virgule ou une parenthese saisie reste une valeur, jamais une condition', () => {
    expect(postgrestOrValue('%x,id.not.is.null%')).toBe('"%x,id.not.is.null%"');
    expect(postgrestOrValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('televersements : le type retenu est celui que le fichier EST', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  const text = (value: string) => new TextEncoder().encode(value);

  it('reconnait les formats acceptes', () => {
    expect(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffMediaType(text('GIF89a...'))).toBe('image/gif');
    expect(sniffMediaType(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMediaType(text('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffMediaType(text('\0\0\0\u0018ftypavif'))).toBe('image/avif');
    expect(sniffMediaType(text('\0\0\0\u0018ftypisom'))).toBe('video/mp4');
    const ebml = (docType: string) =>
      new Uint8Array([
        0x1a,
        0x45,
        0xdf,
        0xa3,
        0x9f,
        0x42,
        0x86,
        0x81,
        0x01,
        0x42,
        0xf7,
        0x81,
        0x01,
        0x42,
        0x82,
        0x84,
        ...text(docType),
      ]);
    expect(sniffMediaType(ebml('webm'))).toBe('video/webm');
    // Matroska (.mkv) : meme famille, mais pas lu par tous les navigateurs.
    expect(sniffMediaType(ebml('matr'))).toBeNull();
  });

  it('distingue AVIF, MP4 et les photos HEIC d’iPhone (refusées)', () => {
    // Marque principale « mif1 », AVIF annoncé parmi les marques compatibles.
    expect(sniffMediaType(text('\0\0\0\u001cftypmif1\0\0\0\0mif1avifmiaf'))).toBe('image/avif');
    expect(sniffMediaType(text('\0\0\0\u0018ftypheic\0\0\0\0mif1heic'))).toBeNull();
    expect(sniffMediaType(text('\0\0\0\u0014ftypqt  \0\0\0\0qt  '))).toBeNull();
    expect(sniffMediaType(text('\0\0\0\u0018ftypM4A \0\0\0\0M4A mp42'))).toBeNull();
  });

  it('ne reconnait ni SVG, ni HTML, ni script — quel que soit le nom du fichier', () => {
    expect(sniffMediaType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(sniffMediaType(text('<?xml version="1.0"?><svg onload="alert(1)">'))).toBeNull();
    expect(sniffMediaType(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffMediaType(text('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(sniffMediaType(new Uint8Array())).toBeNull();
  });

  it('le SVG ne fait plus partie des formats acceptes', () => {
    expect(ACCEPTED_MEDIA.has('image/svg+xml')).toBe(false);
  });
});

describe('panier des sites publics', () => {
  it('le nom d’un produit n’est jamais insere comme du HTML', () => {
    // Le nom est saisi dans l'espace client : « <img src=x onerror=…> » doit
    // rester un nom. Le panier est construit noeud par noeud (textContent).
    expect(SITE_SCRIPT).not.toMatch(/innerHTML\s*=[^;]*(item|state)\./);
    expect(SITE_SCRIPT).toContain('node.textContent = String(text)');
  });
});

describe('e-mails : en-tetes sur une seule ligne', () => {
  it('un saut de ligne dans un nom saisi n’ajoute pas d’en-tete', () => {
    expect(headerSafe('Le site de ACME\r\nBcc: victime@exemple.fr est prêt')).toBe(
      'Le site de ACME Bcc: victime@exemple.fr est prêt',
    );
    expect(headerSafe('Boulangerie\u202E tnemeiap')).toBe('Boulangerie tnemeiap');
  });
});

describe('exports CSV', () => {
  it('neutralise une formule precedee d’espaces', () => {
    expect(csvCell(' =HYPERLINK("http://evil")')).toBe('"\' =HYPERLINK(""http://evil"")"');
    expect(csvCell('\t@SUM(A1)')).toBe('"\'\t@SUM(A1)"');
    expect(csvCell('Bonjour')).toBe('"Bonjour"');
  });
});
