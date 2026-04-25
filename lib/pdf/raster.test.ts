import { describe, expect, it } from "vitest";
import {
  DEFAULT_RASTER_WIDTH_PX,
  RASTER_WIDTH_BY_DOC_TYPE,
  targetWidthForDocType,
} from "./raster";

describe("targetWidthForDocType", () => {
  it("returns the configured width for known doc types", () => {
    expect(targetWidthForDocType("spec")).toBe(RASTER_WIDTH_BY_DOC_TYPE.spec);
    expect(targetWidthForDocType("submittal")).toBe(
      RASTER_WIDTH_BY_DOC_TYPE.submittal,
    );
    expect(targetWidthForDocType("drawing")).toBe(
      RASTER_WIDTH_BY_DOC_TYPE.drawing,
    );
    expect(targetWidthForDocType("other")).toBe(RASTER_WIDTH_BY_DOC_TYPE.other);
  });

  it("falls back to the default when doc type is null or undefined", () => {
    expect(targetWidthForDocType(null)).toBe(DEFAULT_RASTER_WIDTH_PX);
    expect(targetWidthForDocType(undefined)).toBe(DEFAULT_RASTER_WIDTH_PX);
  });

  it("falls back to the default for unknown doc types", () => {
    expect(targetWidthForDocType("rfp")).toBe(DEFAULT_RASTER_WIDTH_PX);
    expect(targetWidthForDocType("")).toBe(DEFAULT_RASTER_WIDTH_PX);
  });

  // Behavior preservation: non-drawing types must continue to use the
  // existing raster width. A regression here would silently change
  // ingestion costs and storage size for every spec and submittal.
  it("preserves the default width for spec and submittal", () => {
    expect(targetWidthForDocType("spec")).toBe(DEFAULT_RASTER_WIDTH_PX);
    expect(targetWidthForDocType("submittal")).toBe(DEFAULT_RASTER_WIDTH_PX);
  });

  // The whole point: drawings get more pixels.
  it("gives drawings a higher density than the default", () => {
    expect(targetWidthForDocType("drawing")).toBeGreaterThan(
      DEFAULT_RASTER_WIDTH_PX,
    );
  });
});
