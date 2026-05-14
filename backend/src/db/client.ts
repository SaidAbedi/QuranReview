import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env';

// Service-role client — full DB access, used for all server-side operations.
// Never expose this key to the mobile app or client-side code.
// ws is provided explicitly for Node 18 compatibility (no native WebSocket).
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: ws as any,
    },
  },
);
