// TEMPORAIRE : diagnostic d'acces Supabase depuis le Worker. A SUPPRIMER.
import { NextResponse } from 'next/server';
import { publicEnv } from '@nemasus/config';
import { createAnonClient, listSubprocessors } from '@nemasus/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const out: Record<string, unknown> = {};
  out['processEnvUrl'] = typeof process.env['NEXT_PUBLIC_SUPABASE_URL'];
  out['processEnvKeyLen'] = (process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '').length;
  out['envKeys'] = Object.keys(process.env)
    .filter((k) => /SUPABASE|NEMASUS|STAX|PLATFORM|NEXTJS/.test(k))
    .sort();
  try {
    const env = publicEnv();
    out['publicUrl'] = env.NEXT_PUBLIC_SUPABASE_URL;
    out['publicKeyLen'] = env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length;
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/subprocessors?select=name&limit=1`,
        {
          headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        },
      );
      out['rawFetch'] = res.status;
    } catch (error) {
      out['rawFetchError'] = String(error);
    }
  } catch (error) {
    out['publicEnvError'] = String(error);
  }
  try {
    const rows = await listSubprocessors(createAnonClient());
    out['list'] = rows.length;
  } catch (error) {
    out['listError'] = String(error);
    out['listStack'] = error instanceof Error ? (error.stack ?? '').split('\n').slice(0, 6) : null;
  }
  return NextResponse.json(out);
}
