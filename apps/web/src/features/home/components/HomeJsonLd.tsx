import { site } from "@/lib/site";

// 首页结构化数据(JSON-LD):帮助搜索引擎理解品牌与产品,利于富结果。
// 同时声明 Organization、WebSite(站内搜索)与 EducationalApplication。
export function HomeJsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site.url}/#organization`,
        name: site.name,
        url: site.url,
        logo: `${site.url}/icon`,
        description: site.description
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        url: site.url,
        name: site.name,
        description: site.description,
        inLanguage: "zh-CN",
        publisher: { "@id": `${site.url}/#organization` }
      },
      {
        "@type": "EducationalApplication",
        name: site.fullName,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: site.url,
        description: site.description,
        inLanguage: "zh-CN",
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
