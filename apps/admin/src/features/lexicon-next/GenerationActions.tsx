import { useContext, type ReactNode } from "react";
import { Bot, Sparkles } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import type { NextAgentSection } from "@tsz/types";

import { GenerationSense, GenerationContext } from "./generationContext";

export function GenerationSenseScope({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <GenerationSense.Provider value={{ id, label }}>
        {children}
      </GenerationSense.Provider>
    </section>
  );
}

export function EntryAssistantButton() {
  const actions = useContext(GenerationContext);
  const { t } = useLexiconEditorTranslation();
  if (!actions) return null;
  return (
    <Button
      size="small"
      icon={<Bot aria-hidden="true" />}
      onClick={actions.openAssistant}
    >
      {t("entry_ai_assistant")}
    </Button>
  );
}

export function SectionAI({
  section,
  pos,
  locale,
  sentenceId,
  disabled = false,
  label
}: {
  section: NextAgentSection;
  pos?: string;
  locale?: string;
  sentenceId?: string;
  disabled?: boolean;
  label?: string;
}) {
  const actions = useContext(GenerationContext);
  const sense = useContext(GenerationSense);
  const { t } = useLexiconEditorTranslation();
  if (!actions || !actions.sections.includes(section)) return null;
  const name = t("entry_ai_generate_section", {
    section: label ?? t(`entry_ai_${section}`)
  });
  const unavailableSentence =
    sentenceId !== undefined && !actions.exampleIds.includes(sentenceId);
  const reason = !actions.available
    ? t("entry_ai_unavailable")
    : unavailableSentence
      ? t("entry_ai_translation_ineligible")
      : name;
  return (
    <Button
      type="text"
      size="small"
      className="lexicon-next-ai-button"
      aria-label={name}
      title={reason}
      icon={<Sparkles size={16} aria-hidden="true" />}
      disabled={
        disabled ||
        actions.disabled ||
        !actions.available ||
        unavailableSentence
      }
      onClick={(e) => {
        e.stopPropagation();
        actions.generateSection({
          section,
          pos,
          locale,
          label,
          senseId: sense?.id,
          senseLabel: sense?.label,
          sentenceId
        });
      }}
    />
  );
}
