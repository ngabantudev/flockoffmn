import { Shield, Star, Landmark, Route, Fingerprint, Speech, FileText, FileX, type IconNode } from 'lucide';

/**
 * Every lucide glyph the registry may name, by the exact string it writes.
 *
 * A closed allow-list, not a dynamic import: a registry entry naming an icon
 * that isn't here draws its fallback rather than pulling an arbitrary module
 * into the bundle, and the set stays small enough to be read at a glance —
 * every glyph in here ships to every visitor (§0.7).
 *
 * One map rather than two. `markerIcon` (a point layer's own mark) and
 * `impactSpheres[].icon` (the detail panel's headings) are the same
 * registry-names-a-glyph problem with the same closed-set rule, and they
 * already overlapped on `Landmark`; keeping separate lists meant a glyph added
 * for one surface was mysteriously unavailable to the other.
 *
 * Never emoji — see the impactSpheres type's own comment in layers/types.ts.
 */
export const MARKER_ICONS: Record<string, IconNode> = {
  Shield,
  Star,
  Landmark,
  Route,
  Fingerprint,
  Speech,
  FileText,
  // A contract still in force draws FileText; one that has ended — by any
  // of the statuses in ContractStatus other than "Active" — draws FileX. See
  // the vendor_contract registry entry's markerIcon.byValue.
  FileX,
};
