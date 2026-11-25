import { EmptyState } from "@tsz/ui/admin/display";
import type { LucideIcon } from "lucide-react";

export function SenseEmptyState({
  icon: Icon,
  description
}: {
  icon: LucideIcon;
  description: string;
}) {
  return (
    <EmptyState
      description={
        <span className="lexicon-next-sense-empty">
          <Icon size={18} aria-hidden="true" />
          {description}
        </span>
      }
    />
  );
}
