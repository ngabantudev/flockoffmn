import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LAYERS } from './registry';
import type { LayerCollection, LayerDefinition } from './types';

/**
 * Build-time access to the generated layer files.
 *
 * Pages read the real files from /public/data rather than trusting the
 * registry's placeholder provenance, so counts, source dates and known gaps
 * shown on the sources page always reflect the data actually shipped.
 */

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

export interface LoadedLayer {
  definition: LayerDefinition;
  collection: LayerCollection | null;
  /** True when the ingest has not been run for this layer yet. */
  missing: boolean;
}

const cache = new Map<string, LayerCollection | null>();

async function readCollection(dataPath: string): Promise<LayerCollection | null> {
  if (cache.has(dataPath)) return cache.get(dataPath) ?? null;
  try {
    const raw = await readFile(path.join(PUBLIC_DIR, dataPath), 'utf8');
    const parsed = JSON.parse(raw) as LayerCollection;
    cache.set(dataPath, parsed);
    return parsed;
  } catch {
    cache.set(dataPath, null);
    return null;
  }
}

export async function loadLayer(definition: LayerDefinition): Promise<LoadedLayer> {
  const collection = await readCollection(definition.dataPath);
  return { definition, collection, missing: collection === null };
}

export async function loadAllLayers(): Promise<LoadedLayer[]> {
  return Promise.all(LAYERS.map(loadLayer));
}

/**
 * Merge the registry's static provenance with whatever the ingest actually
 * recorded. The file wins: it knows when it ran and what it found.
 */
export function mergedProvenance(loaded: LoadedLayer) {
  const meta = loaded.collection?.metadata;
  return {
    ...loaded.definition.provenance,
    ...(meta ?? {}),
    featureCount: meta?.featureCount ?? 0,
    knownGaps: meta?.knownGaps ?? [],
  };
}

/** Distinct values of an attribute, for building filter controls. */
export function distinctValues(collection: LayerCollection | null, key: string): string[] {
  if (!collection) return [];
  const seen = new Set<string>();
  for (const f of collection.features) {
    const v = (f.properties.attributes as Record<string, unknown>)[key];
    if (v === null || v === undefined || v === '') continue;
    seen.add(String(v));
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
