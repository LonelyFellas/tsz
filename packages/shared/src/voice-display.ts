/** Catalogue names have optional Chinese text; never translate or rewrite provider IDs. */
export function splitVoiceDisplayName(displayName: string): {
  english: string;
  chinese?: string;
} {
  return {
    english:
      displayName
        .replace(/[\u3400-\u9fff]+.*$/, "")
        .replace(/[\s（(·]+$/, "") || displayName,
    chinese: displayName.match(/[\u3400-\u9fff][^()（）]*/)?.[0]
  };
}
