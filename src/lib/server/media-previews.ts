import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type PrivateMediaAsset = {
  bucket: string;
  object_path: string;
  mime_type: string;
};

/**
 * Admin media is deliberately private.  The library receives a short-lived URL
 * instead of an object path so previews work without weakening Storage policies.
 */
export async function attachMediaPreviews<T extends PrivateMediaAsset>(assets: T[]) {
  const storage = createAdminClient().storage;
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.mime_type.startsWith("image/")) return { ...asset, preview_url: null };
      const { data, error } = await storage.from(asset.bucket).createSignedUrl(asset.object_path, 300);
      return {
        ...asset,
        preview_url: error ? null : data.signedUrl,
        preview_expires_in: error ? null : 300,
      };
    }),
  );
}
