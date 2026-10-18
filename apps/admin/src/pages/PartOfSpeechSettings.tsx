import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import { PartOfSpeechSettings } from "@/features/dictionary/part-of-speech/PartOfSpeechSettings";
import { usePermission } from "@/lib/auth";

export function PartOfSpeechSettingsPage() {
  const isSuperAdmin = usePermission("lexicon_settings.access");
  const navigate = useNavigate();

  if (!isSuperAdmin) {
    return (
      <Result
        status="403"
        title="无权限"
        subTitle="需要词性配置查看权限。"
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            返回首页
          </Button>
        }
      />
    );
  }

  return <PartOfSpeechSettings />;
}
