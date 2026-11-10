import { ImageResponse } from "next/og";
import { site } from "@/lib/site";
import { createInterfaceI18n } from "@tsz/shared/i18n";
import { webText } from "@/i18n/catalog";
import { webApp } from "@/i18n/messages/app";
import { getPublicResourceLocale } from "@/i18n/server";

// 社交分享卡片(微信/X/各平台)的预览大图,动态生成。
// 同一文件同时被 Next 用于 twitter summary_large_image。
const size = { width: 1200, height: 630 };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const locale = await getPublicResourceLocale((await params).locale);
  const t = webText(createInterfaceI18n(locale, webApp.resources), webApp);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "96px",
        background: "linear-gradient(135deg, #ffffff 0%, #eaf2ff 100%)",
        color: "#111827"
      }}
    >
      <div
        style={{
          fontSize: 40,
          fontWeight: 600,
          color: site.themeColor,
          letterSpacing: 4
        }}
      >
        {t("webApp:memory_based_learning_for_students_and_teachers")}
      </div>
      <div style={{ fontSize: 132, fontWeight: 700, marginTop: 24 }}>
        {site.name}
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 500,
          color: "#6b7280",
          marginTop: 16
        }}
      >
        {t(
          "webApp:english_vocabulary_learning_review_using_the_forgetting_curve"
        )}
      </div>
    </div>,
    { ...size, headers: { "Cache-Control": "no-store" } }
  );
}
