import { env } from './config/env';
import { app } from './app';
import { mediaService } from './services/MediaService';

app.listen(env.PORT, () => {
  console.log(`QuranReview backend running on port ${env.PORT} [${env.NODE_ENV}]`);

  // Ensure Supabase Storage buckets exist (idempotent).
  mediaService.ensureBuckets().catch((err) => {
    console.error('Storage bucket setup failed:', (err as Error).message);
  });
});
