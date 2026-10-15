import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Export pre-instantiated singleton object
export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

// Export factory function
export function createClient() {
  return supabase;
}