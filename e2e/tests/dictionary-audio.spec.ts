import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

const id = "00000000-0000-4000-8000-000000000071";
const rich = (text: string) => ({ version: 2, text, annotations: [] });
const ids = Object.fromEntries(
  [
    "form",
    "grammar",
    "sense",
    "definition",
    "example",
    "spelling-uk",
    "definition-uk",
    "example-uk",
    "grammar-us"
  ].map((name, index) => [
    name,
    `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`
  ])
);

test("词典按口音播放正式拼写、释义与例句音频", async ({ page }, testInfo) => {
  await mockApi(page, { authenticated: true });
  const signed: string[] = [];
  const pcm = Buffer.alloc(16044);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(16036, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(8000, 24);
  pcm.writeUInt32LE(16000, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(16000, 40);
  await page.route("**/dictionary-fixture.wav", (route) =>
    route.fulfill({ contentType: "audio/wav", body: pcm })
  );
  await page.route("**/api/v1/dictionary/entries/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/audio/")) {
      const asset = path.split("/").at(-1)!;
      signed.push(Object.keys(ids).find((key) => ids[key] === asset) ?? asset);
      return route.fulfill({
        json: {
          url: new URL("/dictionary-fixture.wav", route.request().url()).href,
          expires_at: "2099-01-01T00:00:00Z",
          url_expires_in_seconds: 120
        }
      });
    }
    const fixture = {
      content: {
        entry_id: id,
        publication_id: id,
        label: "harbour",
        kind: "word",
        pos: [
          {
            pos_id: id,
            pos: "noun",
            forms: [
              {
                id,
                form_type: "base",
                label: "原形",
                sense_ids: [],
                variants: [
                  {
                    id: "form",
                    dialect: "common",
                    spelling: "harbour",
                    pronunciations: []
                  }
                ]
              }
            ],
            grammar_structures: [
              {
                id: "grammar",
                variants: [{ dialect: "common", content: rich("a harbour") }]
              }
            ],
            senses: [
              {
                id: "sense",
                sub_pos: "N-COUNT",
                level: "A1",
                definitions: [
                  {
                    id: "definition",
                    definition_mode: "en_definition",
                    level: "A1",
                    grammar_structure_id: "grammar",
                    texts: [
                      {
                        dialect: "common",
                        content: rich("A place for ships.")
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      audio: [
        { target_id: "form", asset_id: "spelling-uk", locale: "en-GB" },
        {
          target_id: "definition",
          asset_id: "definition-uk",
          locale: "en-GB"
        },
        { target_id: "example", asset_id: "example-uk", locale: "en-GB" },
        { target_id: "grammar", asset_id: "grammar-us", locale: "en-US" }
      ],
      examples: [
        {
          id: "example",
          sense_id: "sense",
          texts: [
            {
              dialect: "common",
              content: rich("The ship is in the harbour.")
            }
          ],
          translation: rich("船在港口。")
        }
      ]
    };
    return route.fulfill({
      body: JSON.stringify(fixture, (_, value) =>
        typeof value === "string" && ids[value] ? ids[value] : value
      ),
      contentType: "application/json"
    });
  });
  await page.goto(`/dictionary/${id}`);
  await page.getByRole("button", { name: "播放 harbour 拼写" }).click();
  await page.getByRole("button", { name: "播放英文释义" }).click();
  await page.getByRole("button", { name: "播放例句" }).click();
  await expect
    .poll(() => signed)
    .toEqual(["spelling-uk", "definition-uk", "example-uk"]);
  await expect(page.getByRole("button", { name: "播放语法结构" })).toHaveCount(
    0
  );
  await expect(page.getByText("播放失败，请重试")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("dictionary-generated-audio.png"),
    fullPage: true
  });
});
