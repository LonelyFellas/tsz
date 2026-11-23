import type { EntryNameVariantV3 } from "@tsz/types";
import { useLexiconListTranslation } from "./i18n/list";

export function WordListNames({
  fallbackName,
  variants,
  annotation,
  kindLabel
}: {
  fallbackName: string;
  variants?: EntryNameVariantV3[];
  annotation?: string | null;
  kindLabel: string;
}) {
  const { t } = useLexiconListTranslation();
  const names = variants?.length
    ? variants
    : [{ text: fallbackName, dialects: [] }];
  return (
    <div className="word-list-names">
      <div className="word-list-name-variants">
        {names.map((name) => (
          <div className="word-list-name" key={name.text}>
            <span className="tsz-words word-list-name-text">{name.text}</span>
            {annotation ? (
              <sup className="word-list-name-annotation">{annotation}</sup>
            ) : null}
            {!name.dialects.includes("common") &&
              name.dialects.map((dialect) => (
                <span
                  key={dialect}
                  className={`word-list-dialect-dot word-list-dialect-dot-${dialect}`}
                  role="img"
                  aria-label={
                    dialect === "uk" ? t("spelling_uk") : t("spelling_us")
                  }
                  data-spelling-dialect={dialect}
                />
              ))}
          </div>
        ))}
      </div>
      <span className="word-list-type-compact">{kindLabel}</span>
    </div>
  );
}
