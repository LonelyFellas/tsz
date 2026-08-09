import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import { PartOfSpeechSettings } from "@/features/dictionary/part-of-speech/PartOfSpeechSettings";
import { useIsSuperAdmin } from "@/lib/auth";

export function PartOfSpeechSettingsPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();

  if (!isSuperAdmin) {
    return (
      <Result
        status="403"
        title="无权限"
        subTitle="词性配置仅超级管理员可访问。"
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
