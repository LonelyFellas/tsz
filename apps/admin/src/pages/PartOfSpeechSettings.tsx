import { Button } from "@mui/material";
import { PageStatus } from "@/components/PageStatus";
import { useNavigate } from "react-router-dom";
import { PartOfSpeechSettings } from "@/features/dictionary/part-of-speech/PartOfSpeechSettings";
import { usePermission } from "@/lib/auth";

export function PartOfSpeechSettingsPage() {
  const isSuperAdmin = usePermission("lexicon_settings.access");
  const navigate = useNavigate();

  if (!isSuperAdmin) {
    return (
      <PageStatus
        title="无权限"
        description="需要词性配置查看权限。"
        action={
          <Button variant="contained" onClick={() => navigate("/")}>
            返回首页
          </Button>
        }
      />
    );
  }

  return <PartOfSpeechSettings />;
}
