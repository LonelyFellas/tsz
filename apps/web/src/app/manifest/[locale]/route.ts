import { createInterfaceI18n } from "@tsz/shared/i18n";
import { webText } from "@/i18n/catalog";
import { webApp } from "@/i18n/messages/app";
import { getPublicResourceLocale } from "@/i18n/server";
import { site } from "@/lib/site";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const locale = await getPublicResourceLocale((await params).locale);
  const t = webText(createInterfaceI18n(locale, webApp.resources), webApp);
  return Response.json(
    {
      name: t("webApp:english_vocabulary_learning"),
      short_name: site.name,
      description: t(
        "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
      ),
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: site.themeColor,
      lang: locale,
      icons: [
        { src: "/icon", sizes: "512x512", type: "image/png" },
        { src: "/apple-icon", sizes: "180x180", type: "image/png" }
      ]
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/manifest+json"
      }
    }
  );
}
