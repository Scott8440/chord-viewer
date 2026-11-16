// Reference mode: the music theory pages (src/reference/), for reading. Nothing plays and played notes do nothing here.
import { REFERENCE_PAGES } from "../reference/pages";
import type { ReferenceView } from "../views/referenceView";
import type { Mode } from "./performance";

export function startReference({ views }: { views: { reference: ReferenceView } }): Mode {
  views.reference.show(REFERENCE_PAGES);
  return {
    stop() {
      views.reference.clear();
    },
  };
}
