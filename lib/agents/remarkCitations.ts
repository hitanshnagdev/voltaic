import { SKIP, visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Link, Root, Text } from "mdast";

const CITATION_RE = /\[#(\d+)\]/g;
export const CITATION_URL_PREFIX = "voltaic-citation://";

/**
 * Remark plugin: split text containing `[#N]` markers into a sequence
 * of text + synthetic link nodes. The links carry `voltaic-citation://N`
 * URLs which the MessageBubble's `components.a` mapping intercepts to
 * render as inline citation chips.
 *
 * Why links and not a custom node type: react-markdown's component
 * map keys on hast element names. Built-in mdast `link` → hast `a` is
 * a clean intercept point that survives the mdast → hast transform
 * without registering a custom remark-rehype handler.
 */
export const remarkCitations: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null) return;
      const value = (node as Text).value;
      if (!value.includes("[#")) return;

      const matches = Array.from(value.matchAll(CITATION_RE));
      if (matches.length === 0) return;

      const newNodes: Array<Text | Link> = [];
      let lastIndex = 0;
      for (const m of matches) {
        const start = m.index ?? 0;
        if (start > lastIndex) {
          newNodes.push({ type: "text", value: value.slice(lastIndex, start) });
        }
        const n = m[1];
        newNodes.push({
          type: "link",
          url: `${CITATION_URL_PREFIX}${n}`,
          children: [{ type: "text", value: `[#${n}]` }],
        });
        lastIndex = start + m[0].length;
      }
      if (lastIndex < value.length) {
        newNodes.push({ type: "text", value: value.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...newNodes);
      // Skip past the freshly-inserted nodes — visiting them would
      // re-enter this same text and loop forever.
      return [SKIP, index + newNodes.length];
    });
  };
};
