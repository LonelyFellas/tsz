import type { WordlistCandidate } from "@tsz/types";
import { useWebText } from "@/i18n/client";
import { webWordlistEditor } from "@/i18n/messages/wordlist/editor";

/** Only distinguish libraries when candidates with the same display name coexist. */
export function CandidateSourceLabel({
  candidate,
  candidates
}: {
  candidate: WordlistCandidate;
  candidates: WordlistCandidate[];
}) {
  const text = useWebText(webWordlistEditor);
  if (
    !candidate.source_library ||
    !candidates.some(
      (other) =>
        other.source_library &&
        other.source_library !== candidate.source_library &&
        other.label.toLowerCase() === candidate.label.toLowerCase()
    )
  )
    return null;
  return (
    <span className="ml-2 text-sm text-foreground-muted">
      {text(
        candidate.source_library === "lexicon_next"
          ? "webWordlistEditor:new_lexicon"
          : "webWordlistEditor:legacy_lexicon"
      )}
    </span>
  );
}
