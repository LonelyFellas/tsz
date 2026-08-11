import { Mark, Node, mergeAttributes } from "@tiptap/core";

export const EmphasisMark = Mark.create({
  name: "emphasis",
  addAttributes() {
    return {
      level: {
        default: "strong",
        parseHTML: (element) => element.getAttribute("data-level") ?? "strong",
        renderHTML: (attributes) => ({ "data-level": attributes.level })
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-emphasis]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-emphasis": "", class: "tsz-ve-emphasis" },
        HTMLAttributes
      ),
      0
    ];
  }
});

export const PhonemeMark = Mark.create({
  name: "phoneme",
  inclusive: false,
  addAttributes() {
    return {
      phoneme: {
        default: "",
        // The parse rule only matches elements that own this attribute.
        parseHTML: (element) => element.getAttribute("data-phoneme") as string,
        renderHTML: (attributes) =>
          attributes.phoneme ? { "data-phoneme": attributes.phoneme } : {}
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-phoneme]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ class: "tsz-ve-phoneme" }, HTMLAttributes),
      0
    ];
  }
});

export const LiaisonMark = Mark.create({
  name: "liaison",
  inclusive: false,
  parseHTML() {
    return [{ tag: "span[data-liaison]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-liaison": "", class: "tsz-ve-liaison" },
        HTMLAttributes
      ),
      0
    ];
  }
});

export const HighlightMark = Mark.create({
  name: "voiceHighlight",
  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (element) => element.getAttribute("data-color") ?? "yellow",
        renderHTML: (attributes) => ({ "data-color": attributes.color })
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-voice-highlight]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-voice-highlight": "", class: "tsz-ve-highlight" },
        HTMLAttributes
      ),
      0
    ];
  }
});

export const PauseNode = Node.create({
  name: "voicePause",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      durationMs: {
        default: 300,
        parseHTML: (element) =>
          Number(element.getAttribute("data-duration-ms")) || 300,
        renderHTML: (attributes) => ({
          "data-duration-ms": attributes.durationMs
        })
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-voice-pause]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-voice-pause": "",
          class: "tsz-ve-pause",
          contenteditable: "false"
        },
        HTMLAttributes
      ),
      `⏸ ${String(node.attrs.durationMs)}ms`
    ];
  }
});
