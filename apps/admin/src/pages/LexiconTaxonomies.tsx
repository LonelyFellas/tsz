import { usePermission } from "@/lib/auth";
import { useContentTranslation } from "@/features/content/i18n";
import { LexiconTaxonomyManagement } from "@/features/dictionary/taxonomies/LexiconTaxonomyManagement";
import { Result } from "@tsz/ui/admin/display";
import type { LexiconTaxonomyKind } from "@tsz/types";

function TaxonomyPage({ kind }: { kind: LexiconTaxonomyKind }) {
  const allowed = usePermission("lexicon_settings.access");
  const { t } = useContentTranslation();
  return allowed ? (
    <LexiconTaxonomyManagement key={kind} kind={kind} />
  ) : (
    <Result
      status="403"
      title={t("access_denied")}
      subTitle={t("taxonomy_permission")}
    />
  );
}
export function RegistersPage() {
  return <TaxonomyPage kind="registers" />;
}
export function DomainsPage() {
  return <TaxonomyPage kind="domains" />;
}
