/**
 * A layer's fetch-and-`JSON.parse`, run off the main thread.
 *
 * `mapController.ts`'s `fetchFeatures` used to do `await res.json()` directly
 * in the browser's one JS thread — fine for the smaller layers, but
 * `holc_appraisal_detail`'s 7.6 MB / 11,561-polygon file froze the tab for the
 * whole parse on a slow device, exactly the audience CLAUDE.md §0.7 asks this
 * site to stay usable for. Moving the fetch and the parse into a Worker means
 * that megabyte of JSON never blocks a scroll, a tap, or a screen reader on
 * the main thread — only the (cheap) structured-clone of the already-parsed
 * feature array back to the caller does, and that's unavoidable with any
 * worker.
 *
 * One instance is created lazily by `mapController.ts` and reused for every
 * layer's fetch rather than spun up per call (see `ensureDataWorker`) — each
 * request carries its own numeric `id` so replies can be routed back to the
 * right caller even with several fetches in flight (two resolutions of the
 * same layer, or two layers loading at once).
 *
 * Kept deliberately dumb: fetch the URL, parse the JSON, hand back the
 * `features` array (or an error string) exactly once. No caching, no
 * retries, no chunking — `mapController.ts` already owns caching
 * (`this.data`/`this.simplifiedData`) and in-flight dedup
 * (`this.inFlight`/`this.simplifiedInFlight`), and duplicating either of
 * those inside the worker would just be a second place for the two to
 * disagree.
 */

/** One fetch-and-parse request, keyed by a caller-assigned id so a reply can be routed back. */
export interface LayerDataRequest {
  id: number;
  url: string;
}

/** The worker's one reply per request — either the parsed `features` array, or why it failed. */
export type LayerDataResponse =
  | { id: number; ok: true; features: unknown[] }
  | { id: number; ok: false; error: string };

/**
 * `self` resolves to this project's single `dom`-lib `Window` type, not
 * `DedicatedWorkerGlobalScope` — this repo has one tsconfig for every file,
 * and TypeScript's `dom` and `webworker` libs declare incompatible globals,
 * so a file can't load both in the same program. `addEventListener('message',
 * ...)` and `fetch` exist on both types with compatible signatures and need
 * no cast; `postMessage` does not — `Window.postMessage` requires a same-
 * origin `targetOrigin` argument that means nothing inside a worker — so it's
 * cast through `unknown` here, the same idiom `mapController.ts`'s own map
 * `'error'` handler already uses for a MapLibre event shape TS can't see
 * either.
 */
function reply(response: LayerDataResponse): void {
  (self as unknown as { postMessage: (message: LayerDataResponse) => void }).postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<LayerDataRequest>) => {
  const { id, url } = event.data;
  void (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const collection = (await res.json()) as { features?: unknown[] };
      reply({ id, ok: true, features: collection.features ?? [] });
    } catch (err) {
      reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
