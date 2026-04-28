import { describe, expect, it } from "vitest";
import type { Root } from "mdast";
import { CITATION_URL_PREFIX, remarkCitations } from "./remarkCitations";

/**
 * Tests construct mdast trees directly and feed them through the
 * plugin's transformer — avoids pulling remark-parse just for tests.
 * The plugin is a unified Plugin<[], Root>; calling it returns a
 * Transformer that mutates the tree in place and returns void.
 */
function applyPlugin(tree: Root): Root {
  // unified Plugin types expect a Processor as `this`; we don't use
  // it, so call without one. Cast to a plain factory to satisfy TS.
  const factory = remarkCitations as unknown as () => (tree: Root) => void;
  const transformer = factory();
  transformer(tree);
  return tree;
}

function paragraphWith(text: string): Root {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: text }],
      },
    ],
  };
}

function linksIn(tree: Root): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const walk = (node: { type: string; url?: string; value?: string; children?: unknown[] }) => {
    if (node.type === "link") {
      const text = (node.children ?? [])
        .map((c) => {
          const child = c as { type: string; value?: string };
          return child.type === "text" ? (child.value ?? "") : "";
        })
        .join("");
      out.push({ url: node.url ?? "", text });
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) {
        walk(c as { type: string; children?: unknown[] });
      }
    }
  };
  walk(tree as unknown as { type: string; children?: unknown[] });
  return out;
}

function textsIn(tree: Root): string[] {
  const out: string[] = [];
  const walk = (node: { type: string; value?: string; children?: unknown[] }) => {
    if (node.type === "text") out.push(node.value ?? "");
    if (Array.isArray(node.children)) {
      for (const c of node.children) {
        walk(c as { type: string; children?: unknown[]; value?: string });
      }
    }
  };
  walk(tree as unknown as { type: string; children?: unknown[] });
  return out;
}

describe("remarkCitations", () => {
  it("converts a [#N] marker into a synthetic link node", () => {
    const tree = applyPlugin(
      paragraphWith("the spec requires 65 kAIC [#1]."),
    );
    const links = linksIn(tree);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe(`${CITATION_URL_PREFIX}1`);
    expect(links[0].text).toBe("[#1]");
  });

  it("handles multiple markers in one paragraph", () => {
    const tree = applyPlugin(
      paragraphWith("compare [#2] vs [#3] vs [#2] again"),
    );
    const links = linksIn(tree);
    expect(links.map((l) => l.url)).toEqual([
      `${CITATION_URL_PREFIX}2`,
      `${CITATION_URL_PREFIX}3`,
      `${CITATION_URL_PREFIX}2`,
    ]);
  });

  it("preserves surrounding text segments", () => {
    const tree = applyPlugin(paragraphWith("before [#1] middle [#2] after"));
    const texts = textsIn(tree);
    expect(texts).toContain("before ");
    expect(texts).toContain(" middle ");
    expect(texts).toContain(" after");
  });

  it("leaves text without markers untouched", () => {
    const tree = applyPlugin(paragraphWith("plain prose, no markers"));
    expect(linksIn(tree)).toEqual([]);
    expect(textsIn(tree)).toEqual(["plain prose, no markers"]);
  });

  it("handles double-digit indices", () => {
    const tree = applyPlugin(paragraphWith("see [#42]"));
    const links = linksIn(tree);
    expect(links[0].url).toBe(`${CITATION_URL_PREFIX}42`);
  });

  it("only matches well-formed [#N] (rejects [#x] / [#])", () => {
    const tree = applyPlugin(paragraphWith("noise [#x] or [#] or [##1]"));
    expect(linksIn(tree)).toEqual([]);
  });
});
