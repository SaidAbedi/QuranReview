import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Service-role client — full DB access, used for all server-side operations.
// Never expose this key to the mobile app or client-side code.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
