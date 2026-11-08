import { useContentTranslation } from "@/features/content/i18n";
import { Button, Result } from "@tsz/ui/admin/display";
import { useNavigate } from "react-router-dom";
import { PartOfSpeechSettings } from "@/features/dictionary/part-of-speech/PartOfSpeechSettings";
import { usePermission } from "@/lib/auth";

export function PartOfSpeechSettingsPage() {
  const { t } = useContentTranslation();
  const isSuperAdmin = usePermission("lexicon_settings.access");
  const navigate = useNavigate();

  if (!isSuperAdmin) {
    return (
      <Result
        status="403"
        title={t("access_denied")}
        subTitle={t("parts_permission_required")}
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            {t("home")}
          </Button>
        }
      />
    );
  }

  return <PartOfSpeechSettings />;
}
