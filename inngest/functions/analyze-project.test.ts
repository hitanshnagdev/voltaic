import { describe, expect, it } from "vitest";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { RuleResult } from "@/lib/rag/rules/types";
import {
  buildContradictionFindingRow,
  buildRuleFindingRow,
} from "./analyze-project";

const atom = (overrides: Partial<RetrievedAtom> = {}): RetrievedAtom => ({
  id: "00000000-0000-0000-0000-00000000aaaa",
  sourceKind: "spec_paragraph",
  documentId: "00000000-0000-0000-0000-00000000bbbb",
  pageNum: 4,
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2.2",
  csiParagraph: "A",
  requirementType: "aic",
  referencedStandards: ["UL 67"],
  content: "Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
  score: 0.8,
  ranks: { bm25: 1, vector: 1 },
  ...overrides,
});

const ruleNonCompliant: RuleResult = {
  ruleId: "aic",
  verdict: "non_compliant",
  confidence: 0.95,
  severity: "hot",
  summary: "MDP-A AIC 42 kA < required 65 kA. Short by 23.0 kA.",
  inputs: {
    submittedAicKa: 42,
    requiredKa: 65,
    requirementSource: "spec",
    marginKa: -23,
  },
  comparator: "≥",
  evidence: [
    {
      sourceKind: "submittal_field",
      sourceId: "sf-1",
      documentId: "doc-sub-1",
      pageNum: 2,
      role: "primary",
      snippet: "submitted AIC = 42 kA",
    },
    {
      sourceKind: "spec_paragraph",
      sourceId: atom().id,
      documentId: atom().documentId,
      pageNum: atom().pageNum,
      role: "primary",
      snippet: "Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
    },
  ],
};

describe("buildRuleFindingRow", () => {
  it("packs a non_compliant rule result into a finding row with rule fields populated", () => {
    const row = buildRuleFindingRow({
      workspaceId: "ws-1",
      projectId: "pr-1",
      equipment: { id: "eq-1", tag: "MDP-A" },
      ruleResult: ruleNonCompliant,
    });
    expect(row.kind).toBe("rule");
    expect(row.ruleId).toBe("aic");
    expect(row.severity).toBe("hot");
    expect(row.verdict).toBe("non_compliant");
    expect(row.category).toBe("code");
    expect(row.equipmentIds).toEqual(["eq-1"]);
    // confidence is numeric in pg, drizzle takes the string form
    expect(row.confidence).toBe("0.95");
    expect(row.title).toContain("MDP-A");
    expect(row.title).toMatch(/undersized|AIC/);
    expect(row.summary).toBe(ruleNonCompliant.summary);
    const evidence = row.evidence as Array<{ sourceKind: string }>;
    expect(evidence).toHaveLength(2);
    expect(evidence.map((e) => e.sourceKind)).toEqual([
      "submittal_field",
      "spec_paragraph",
    ]);
    const trace = row.reasoningTrace as { kind: string; ruleId: string };
    expect(trace.kind).toBe("rule");
    expect(trace.ruleId).toBe("aic");
  });

  it("uses a clean compliant title when verdict is compliant", () => {
    const compliant: RuleResult = {
      ...ruleNonCompliant,
      verdict: "compliant",
      severity: "cool",
      summary: "MDP-A AIC 100 kA ≥ required 65 kA.",
    };
    const row = buildRuleFindingRow({
      workspaceId: "ws-1",
      projectId: "pr-1",
      equipment: { id: "eq-1", tag: "MDP-A" },
      ruleResult: compliant,
    });
    expect(row.title).toMatch(/AIC OK for MDP-A/);
    expect(row.severity).toBe("cool");
  });

  it("falls back to a generic 'Equipment' label when tag is null", () => {
    const row = buildRuleFindingRow({
      workspaceId: "ws-1",
      projectId: "pr-1",
      equipment: { id: "eq-1", tag: null },
      ruleResult: ruleNonCompliant,
    });
    expect(row.title).toContain("Equipment");
  });
});

describe("buildContradictionFindingRow", () => {
  it("packs a spec-vs-spec contradiction into a contradiction finding row", () => {
    const row = buildContradictionFindingRow({
      workspaceId: "ws-1",
      projectId: "pr-1",
      equipment: { id: "eq-1", tag: "MDP-A" },
      contradiction: {
        candidates: [
          { atom: atom({ id: "high", content: "Minimum 65 kAIC." }), ka: 65 },
          { atom: atom({ id: "low", content: "Branch panels: 22 kAIC." }), ka: 22 },
        ],
        distinctKas: [65, 22],
      },
    });
    expect(row.kind).toBe("contradiction");
    expect(row.ruleId).toBeNull();
    // contradictions are at minimum warm
    expect(row.severity).toBe("warm");
    expect(row.verdict).toBe("no_conflict");
    expect(row.equipmentIds).toEqual(["eq-1"]);
    expect(row.title).toMatch(/Spec disagrees on AIC requirement for MDP-A/);
    expect(row.summary).toMatch(/65 kA vs 22 kA/);
    const evidence = row.evidence as Array<{ sourceKind: string; sourceId: string }>;
    expect(evidence).toHaveLength(2);
    expect(evidence.every((e) => e.sourceKind === "spec_paragraph")).toBe(true);
    expect(evidence.map((e) => e.sourceId)).toEqual(["high", "low"]);
    const trace = row.reasoningTrace as {
      kind: string;
      conflict_field: string;
      values: number[];
    };
    expect(trace.kind).toBe("contradiction");
    expect(trace.conflict_field).toBe("aic_required_ka");
    expect(trace.values).toEqual([65, 22]);
  });
});
