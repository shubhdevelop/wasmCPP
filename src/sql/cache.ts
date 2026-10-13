// Content-hashed URLs invalidate cached binaries automatically after an upgrade.
export async function cachedAsset(url: string): Promise<Response> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open("local-wasm-lab:engines-v1");
    const hit = await cache.match(url);
    if (hit) return hit;
  } catch { /* Private browsing/storage denial: use normal HTTP caching. */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Engine download failed (${response.status}). Try again.`);
  try { await cache?.put(url, response.clone()); } catch { /* Quota exceeded. */ }
  return response;
}
