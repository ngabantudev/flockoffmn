/**
 * Substitute `{placeholders}` in a dictionary string.
 *
 * Dependency-free per CLAUDE.md's shared-lib pattern (see geo.mjs and
 * authority.mjs) — plain Node, no framework, importable from both an Astro
 * component's build-time frontmatter and its client `<script>` alike, which
 * is the whole point: this was three near-identical copies (MapView.astro's
 * `fillStatic` and `fill`, plus a one-off `.replace()` in mapController.ts)
 * before being pulled out here, and a dictionary string's placeholder syntax
 * only gets to change in one place now instead of three.
 */

/** Case-insensitive is not the concern here — `{key}` names are exact. */
export function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}
