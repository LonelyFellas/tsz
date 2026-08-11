import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import { normalizeRichTextV2 } from "../core";
import {
  EmphasisMark,
  HighlightMark,
  LiaisonMark,
  PauseNode,
  PhonemeMark
} from "./extensions";
import { editorJsonToRichTextV2, richTextToEditorJson } from "./mapping";

const EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  EmphasisMark,
  PhonemeMark,
  LiaisonMark,
  HighlightMark,
  PauseNode
];

describe("TipTap mapping", () => {
  it("round-trips all annotation kinds and Unicode paragraphs", () => {
    const value: RichTextV2 = {
      version: 2,
      text: "😀hello\nworld",
      annotations: [
        { type: "emphasis", start: 1, end: 6, level: "strong" },
        {
          type: "phoneme",
          start: 1,
          end: 6,
          alphabet: "ipa",
          phoneme: "həˈləʊ"
        },
        { type: "liaison", start: 7, end: 9 },
        { type: "highlight", start: 9, end: 12, color: "orange" },
        { type: "pause", at: 6, duration_ms: 300 }
      ]
    };

    expect(editorJsonToRichTextV2(richTextToEditorJson(value))).toEqual(
      normalizeRichTextV2(value)
    );
  });

  it("tracks annotation offsets when text is inserted before, inside, and after marks", () => {
    const editor = new Editor({
      extensions: EXTENSIONS,
      content: richTextToEditorJson({
        version: 2,
        text: "abcd",
        annotations: [
          { type: "emphasis", start: 1, end: 3, level: "strong" },
          { type: "pause", at: 3, duration_ms: 300 }
        ]
      })
    });

    editor.commands.insertContentAt(1, "X");
    editor.commands.insertContentAt(4, "Y");
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "Z");
    const exported = editorJsonToRichTextV2(editor.getJSON());
    expect(exported.text).toBe("XabYcdZ");
    expect(exported.annotations).toEqual(
      expect.arrayContaining([
        { type: "emphasis", start: 2, end: 5, level: "strong" },
        { type: "pause", at: 5, duration_ms: 300 }
      ])
    );

    const pausePosition = editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "voicePause") return true;
      editor.commands.deleteRange({
        from: position,
        to: position + node.nodeSize
      });
      return false;
    });
    expect(pausePosition).toBeUndefined();
    expect(editorJsonToRichTextV2(editor.getJSON()).annotations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "pause" })])
    );
    editor.destroy();
  });

  it("ignores non-paragraph and unsupported inline JSON nodes", () => {
    expect(
      editorJsonToRichTextV2({
        type: "doc",
        content: [
          { type: "heading", content: [{ type: "text", text: "skip" }] },
          {
            type: "paragraph",
            content: [
              { type: "unknown" },
              { type: "text", text: "ok", marks: [{ type: "unknown" }] }
            ]
          }
        ]
      })
    ).toEqual({ version: 2, text: "ok", annotations: [] });

    expect(editorJsonToRichTextV2({ type: "doc" })).toEqual({
      version: 2,
      text: "",
      annotations: []
    });
    expect(
      editorJsonToRichTextV2({
        type: "doc",
        content: [
          { type: "paragraph" },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "" },
              { type: "voicePause" },
              {
                type: "text",
                text: "x",
                marks: [{ type: "voiceHighlight" }]
              }
            ]
          }
        ]
      })
    ).toEqual({
      version: 2,
      text: "\nx",
      annotations: [
        { type: "pause", at: 1, duration_ms: 300 },
        { type: "highlight", start: 1, end: 2, color: "yellow" }
      ]
    });
    expect(() =>
      editorJsonToRichTextV2({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "phoneme" }] }]
          }
        ]
      })
    ).toThrow("IPA 不能为空");
  });

  it("creates empty paragraphs and unmarked prefixes before later annotations", () => {
    expect(
      richTextToEditorJson({
        version: 2,
        text: "\nabc",
        annotations: [{ type: "emphasis", start: 2, end: 4, level: "strong" }]
      })
    ).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: undefined },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: undefined },
            {
              type: "text",
              text: "bc",
              marks: [{ type: "emphasis", attrs: { level: "strong" } }]
            }
          ]
        }
      ]
    });

    expect(
      richTextToEditorJson({
        version: 2,
        text: "abcd",
        annotations: [{ type: "highlight", start: 0, end: 1, color: "blue" }]
      })
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "a",
              marks: [{ type: "voiceHighlight", attrs: { color: "blue" } }]
            },
            { type: "text", text: "bcd", marks: undefined }
          ]
        }
      ]
    });
  });
});
