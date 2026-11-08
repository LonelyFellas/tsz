import { ClientResponseError } from "@tsz/api-client";
import { useAdminModuleTranslation } from "@/i18n";
const resources = {
  "zh-Hans": {
    adminRequests: {
      invalid_response: "无法读取服务响应，请刷新并核对操作结果后再重试"
    }
  },
  "zh-Hant": {
    adminRequests: {
      invalid_response: "無法讀取服務回應，請重新整理並核對操作結果後再重試"
    }
  },
  en: {
    adminRequests: {
      invalid_response:
        "Could not read the service response. Refresh and check the result before trying again."
    }
  }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminRequests: { invalid_response: string };
  }
}
export function AdminRequestError({ error }: { error: unknown }) {
  const { t } = useAdminModuleTranslation("adminRequests", resources);
  return (
    <>
      {error instanceof ClientResponseError
        ? t("invalid_response")
        : error instanceof Error
          ? error.message
          : ""}
    </>
  );
}
