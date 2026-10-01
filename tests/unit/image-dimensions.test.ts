import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { imageDimensions, sniffMediaType } from '@nemasus/security';

/**
 * Audit du 2026-10-01 : une photo publiée partait sans largeur ni hauteur
 * (`null`), alors que le site en a besoin pour réserver sa place avant le
 * chargement (pas de saut de mise en page). Elles sont lues dans l'en-tête du
 * fichier, sans le décoder.
 */

function png(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return new Uint8Array(Buffer.concat([header, deflateSync(Buffer.alloc(4))]));
}

function gif(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(16);
  bytes.write('GIF89a', 0, 'ascii');
  bytes.writeUInt16LE(width, 6);
  bytes.writeUInt16LE(height, 8);
  return new Uint8Array(bytes);
}

/** JPEG : SOI, un segment APP1 (EXIF) à sauter, puis SOF2 (progressif). */
function jpeg(width: number, height: number): Uint8Array {
  const app1 = Buffer.alloc(2 + 2 + 20);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(22, 2);
  const sof = Buffer.alloc(2 + 2 + 1 + 2 + 2 + 1);
  sof[0] = 0xff;
  sof[1] = 0xc2;
  sof.writeUInt16BE(8, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.alloc(8)]));
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return new Uint8Array(bytes);
}

describe('dimensions des images envoyées', () => {
  it('PNG, GIF, JPEG (après EXIF) et WebP', () => {
    for (const [bytes, expected] of [
      [png(1600, 900), { width: 1600, height: 900 }],
      [gif(320, 200), { width: 320, height: 200 }],
      [jpeg(4032, 3024), { width: 4032, height: 3024 }],
      [webpVp8x(2048, 1365), { width: 2048, height: 1365 }],
    ] as const) {
      const type = sniffMediaType(bytes.slice(0, 64));
      expect(type).not.toBeNull();
      expect(imageDimensions(bytes, type ?? '')).toEqual(expected);
    }
  });

  it('ne devine rien : en-tête tronqué, format inconnu ou valeurs absurdes', () => {
    expect(imageDimensions(png(1600, 900).slice(0, 18), 'image/png')).toBeNull();
    expect(imageDimensions(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), 'image/jpeg')).toBeNull();
    expect(imageDimensions(png(0, 900), 'image/png')).toBeNull();
    expect(imageDimensions(png(90_000, 900), 'image/png')).toBeNull();
    expect(imageDimensions(png(10, 10), 'application/pdf')).toBeNull();
  });
});
