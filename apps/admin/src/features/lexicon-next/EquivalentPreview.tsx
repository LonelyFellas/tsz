import { Tooltip } from "@tsz/ui/admin/overlays";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NextEquivalent } from "@tsz/types";
import { Alert, Button } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { api } from "@/lib/auth";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { equivalentScore, sortedEquivalents } from "./equivalents";
import "./equivalents.css";

export function EquivalentPreview({
  rows,
  noEquivalents
}: {
  rows: NextEquivalent[];
  noEquivalents?: boolean;
}) {
  const { t, i18n } = useLexiconEditorTranslation();
  const [domain, setDomain] = useState("");
  const enhanced = rows.some((row) => row.metadata);
  const catalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: () => api.lexiconNext.equivalentCatalog(),
    enabled: enhanced,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  if (!rows.length)
    return (
      <p className="lexicon-next-muted">
        {t(noEquivalents ? "eq_no_suitable" : "eq_empty")}
      </p>
    );
  if (!enhanced)
    return (
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.text}</li>
        ))}
      </ul>
    );
  const names = (ids: string[], kind: "registers" | "domains") =>
    ids
      .map((id) => {
        const item = catalog.data?.[kind].find((option) => option.id === id);
        return item
          ? i18n.language.startsWith("en")
            ? item.name_en
            : item.name_zh
          : t("eq_unavailable_tag");
      })
      .join("、") || t("eq_unselected");
  return (
    <div className="lexicon-next-equivalents">
      {catalog.isError && (
        <Alert
          type="error"
          title={t("eq_catalog_error")}
          action={
            <Button
              onClick={() => {
                void catalog.refetch();
              }}
            >
              {t("eq_retry")}
            </Button>
          }
        />
      )}
      <div className="lexicon-next-equivalent-domain">
        <label>
          {t("eq_domain")}
          <Select
            aria-label={t("eq_domain")}
            value={domain}
            onChange={setDomain}
            options={[
              { value: "", label: t("eq_general") },
              ...(catalog.data?.domains ?? []).map((item) => ({
                value: item.id,
                label: i18n.language.startsWith("en")
                  ? item.name_en
                  : item.name_zh
              }))
            ]}
          />
        </label>
      </div>
      <div className="lexicon-next-equivalent-scroll">
        <table className="lexicon-next-equivalent-table">
          <thead>
            <tr>
              <th>{t("eq_word")}</th>
              <th>{t("eq_score")}</th>
              <th>{t("eq_registers")}</th>
              <th>{t("eq_domains")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedEquivalents(rows, domain || undefined).map((row) => {
              const score = equivalentScore(row, domain || undefined);
              return (
                <tr key={row.id}>
                  <td>{row.text}</td>
                  <td>
                    <Tooltip
                      trigger={["hover", "focus"]}
                      title={
                        score.inherited ? t("eq_inherited_hint") : undefined
                      }
                    >
                      <span
                        tabIndex={score.inherited ? 0 : undefined}
                        aria-description={
                          score.inherited ? t("eq_inherited_hint") : undefined
                        }
                      >
                        {score.value || t("eq_unassessed")}
                      </span>
                    </Tooltip>
                  </td>
                  <td>
                    {names(row.metadata?.register_ids ?? [], "registers")}
                  </td>
                  <td>{names(row.metadata?.domain_ids ?? [], "domains")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
