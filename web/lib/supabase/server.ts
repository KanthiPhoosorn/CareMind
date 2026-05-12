import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@caremind/shared';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Server Component — cookie writes are expected to throw here */
          }
        },
      },
    },
  );
}

type DbFunctions = Database['public']['Functions'];

// Typed wrapper for supabase.rpc() that reads arg/return shapes directly from
// Database['public']['Functions'], bypassing the GenericSchema constraint that
// our handwritten Database type can't satisfy without generated index signatures
// on each Row type. The single `as any` cast is intentionally contained here
// so call sites stay fully typed.
export async function callRpc<FnName extends keyof DbFunctions>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fn: FnName,
  args: DbFunctions[FnName]['Args'],
): Promise<{ data: DbFunctions[FnName]['Returns'] | null; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).rpc(fn, args);
}
