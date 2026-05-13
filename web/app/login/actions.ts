'use server';

// Server-side sign-out. We do this in a server action (vs client-side
// supabase.auth.signOut) so the auth cookies are cleared on the response
// and the next request to a protected route doesn't see a stale session.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
