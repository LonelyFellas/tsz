import type { Ref } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { useLexiconEditorTranslation } from "../../i18n/editor";

export function V3RegionalAdoptButton({
  side,
  selected,
  onSelect,
  ref
}: {
  side: "uk" | "us";
  selected: boolean;
  onSelect: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const { t } = useLexiconEditorTranslation();
  return (
    <Button
      ref={ref}
      size="small"
      aria-label={t(
        side === "uk" ? "adopt_british_side" : "adopt_american_side"
      )}
      aria-pressed={selected}
      icon={selected ? <CheckIcon /> : undefined}
      onClick={onSelect}
    >
      {t(selected ? "selected_for_merge" : "adopt_this_side")}
    </Button>
  );
}
