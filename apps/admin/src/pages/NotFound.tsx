import { useAdminTranslation } from "@/i18n";
import { Button, Result } from "@tsz/ui/admin/display";
import { Link } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";

// 404 页：保留用户请求的错误 URL（不再静默重定向到首页），把坏链暴露出来而非掩盖。
export function NotFoundPage() {
  const { t } = useAdminTranslation();
  return (
    <FullscreenCenter>
      <Result
        status="404"
        title={t("error_not_found")}
        subTitle={t("error_not_found_help")}
        extra={
          <Link to="/">
            <Button type="primary">{t("error_home")}</Button>
          </Link>
        }
      />
    </FullscreenCenter>
  );
}
