
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL as string | undefined;

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    | string
    | undefined;

export const supabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("YOUR_") &&
    !supabaseKey.includes("YOUR_")
);

// Create the client only when environment variables exist.
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
