import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";
import {
  EmphasisMark,
  HighlightMark,
  LiaisonMark,
  PauseNode,
  PhonemeMark
} from "./extensions";

const extensions = [
  Document,
  Paragraph,
  Text,
  EmphasisMark,
  PhonemeMark,
  LiaisonMark,
  HighlightMark,
  PauseNode
];

describe("voice TipTap extensions", () => {
  it("renders every custom mark and pause node to stable HTML", () => {
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "hello",
                marks: [
                  { type: "emphasis", attrs: { level: "strong" } },
                  { type: "phoneme", attrs: { phoneme: "həˈləʊ" } },
                  { type: "liaison" },
                  { type: "voiceHighlight", attrs: { color: "pink" } }
                ]
              },
              { type: "voicePause", attrs: { durationMs: 750 } }
            ]
          }
        ]
      }
    });
    const html = editor.getHTML();
    expect(html).toContain('data-emphasis=""');
    expect(html).toContain('data-level="strong"');
    expect(html).toContain('data-phoneme="həˈləʊ"');
    expect(html).toContain('data-liaison=""');
    expect(html).toContain('data-voice-highlight=""');
    expect(html).toContain('data-color="pink"');
    expect(html).toContain('data-voice-pause=""');
    expect(html).toContain('data-duration-ms="750"');
    editor.destroy();
  });

  it("parses HTML attributes and uses defaults for missing/invalid values", () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-emphasis>one</span><span data-phoneme="tuː">two</span>' +
        "<span data-phoneme>blank</span>" +
        "<span data-liaison>three</span><span data-voice-highlight>four</span>" +
        '<span data-voice-pause data-duration-ms="bad"></span></p>'
    });
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "emphasis", attrs: { level: "strong" } }],
              text: "one"
            },
            {
              type: "text",
              marks: [{ type: "phoneme", attrs: { phoneme: "tuː" } }],
              text: "two"
            },
            {
              type: "text",
              marks: [{ type: "phoneme", attrs: { phoneme: "" } }],
              text: "blank"
            },
            { type: "text", marks: [{ type: "liaison" }], text: "three" },
            {
              type: "text",
              marks: [{ type: "voiceHighlight", attrs: { color: "yellow" } }],
              text: "four"
            },
            { type: "voicePause", attrs: { durationMs: 300 } }
          ]
        }
      ]
    });
    expect(editor.getHTML()).not.toContain('data-phoneme=""');
    editor.destroy();
  });
});
