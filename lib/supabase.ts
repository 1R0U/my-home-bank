import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars are missing. Copy .env.example to .env and fill in the values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
