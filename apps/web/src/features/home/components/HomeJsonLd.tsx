"use client";
import { useWebText, useWebLocale } from "@/i18n/client";
import { webApp } from "@/i18n/messages/app";
import { site } from "@/lib/site";

// 首页结构化数据(JSON-LD):帮助搜索引擎理解品牌与产品,利于富结果。
// 同时声明 Organization、WebSite(站内搜索)与 EducationalApplication。
export function HomeJsonLd() {
  const uiText = useWebText(webApp);
  const locale = useWebLocale();
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site.url}/#organization`,
        name: site.name,
        url: site.url,
        logo: `${site.url}/icon`,
        description: uiText(
          "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
        )
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        url: site.url,
        name: site.name,
        description: uiText(
          "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
        ),
        inLanguage: locale,
        publisher: { "@id": `${site.url}/#organization` }
      },
      {
        "@type": "EducationalApplication",
        name: uiText("webApp:english_vocabulary_learning"),
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: site.url,
        description: uiText(
          "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
        ),
        inLanguage: locale,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "CNY"
        }
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      // 数据全部来自受控常量,无用户输入,无注入风险。
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
