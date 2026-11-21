import { supabase, supabasePublishableKey, supabaseUrl } from './supabase';

/**
 * Uploads a file to a Supabase Storage bucket over XMLHttpRequest so the caller can show real
 * progress (the supabase-js upload gives none). It uses the same endpoint and headers as
 * supabase-js, so the bucket's access policies apply exactly as before.
 */
export async function uploadWithProgress(options: {
  bucket: string;
  path: string;
  body: ArrayBuffer;
  contentType: string;
  onProgress?: (fraction: number) => void;
  timeoutMs?: number;
}): Promise<void> {
  const apiKey = supabasePublishableKey;
  if (!supabase || !supabaseUrl || !apiKey) throw new Error('Storage is not configured');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const target = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${options.bucket}/${options.path.split('/').map(encodeURIComponent).join('/')}`;
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', target);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('apikey', apiKey);
    request.setRequestHeader('Content-Type', options.contentType);
    request.setRequestHeader('Cache-Control', 'max-age=3600');
    request.setRequestHeader('x-upsert', 'false');
    request.timeout = options.timeoutMs ?? 90000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { options.onProgress?.(1); resolve(); return; }
      reject(new Error(`Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error('Network error'));
    request.ontimeout = () => reject(new Error('Upload timed out'));
    request.send(options.body);
  });
}
