import type { NextEntry } from "@tsz/types";
import { expect, it } from "vitest";
import { nextTargetChoices } from "./nextTargetChoices";

it("uses the matching form binding when a region's binding order differs from its spellings", () => {
  const spelling = (id: string, spelling: string) => ({
    id,
    spelling,
    origin: "manual" as const,
    pronunciations: []
  });
  const binding = (id: string, content_slot_id: string) => ({
    id,
    content_slot_id,
    is_regular: false,
    pronunciations: []
  });
  const entry: NextEntry = {
    id: "word",
    kind: "word",
    target_language: "en",
    medium_locale: "zh-Hans",
    owner_id: "owner",
    revision: 3,
    updated_at: "2026-11-28T00:00:00Z",
    draft: {
      schema_version: 1,
      headword: "colour",
      forms: [],
      senses: [
        {
          id: "sense",
          part_of_speech: "noun",
          definitions: [
            {
              id: "gloss",
              locale: "zh-Hans",
              style: "definition",
              text: "颜色"
            }
          ],
          equivalents: []
        }
      ],
      form_editor: {
        forms_format: "shared_v1",
        contents: [
          {
            id: "content",
            dialect_rules: {
              spelling_mode: "distinguish",
              phonetic_mode: "distinguish"
            },
            regional_variants: {
              mode: "uk_us_many",
              uk: [
                spelling("colour-slot", "colour"),
                spelling("color-uk-slot", "color")
              ],
              us: [spelling("color-us-slot", "color")]
            }
          }
        ],
        pos: [
          {
            pos_id: "noun",
            pos: "noun",
            form_groups: [],
            forms: [
              {
                id: "base",
                form_type: "base",
                content_id: "content",
                regional_bindings: {
                  mode: "uk_us_many",
                  uk: [
                    binding("color-uk", "color-uk-slot"),
                    binding("colour-uk", "colour-slot")
                  ],
                  us: [binding("color-us", "color-us-slot")]
                }
              }
            ]
          }
        ]
      }
    }
  };
  expect(nextTargetChoices(entry, "colour", "en-GB", "zh-Hans", true)).toEqual([
    expect.objectContaining({
      target_variant_id: "colour-uk",
      target_dialect: "uk",
      gloss: "颜色"
    })
  ]);
});
