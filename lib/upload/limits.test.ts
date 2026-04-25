import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bytesToMb, getMaxUploadBytes } from "./limits";

const FIFTY_MB = 50 * 1024 * 1024;

describe("getMaxUploadBytes", () => {
  // The function reads process.env at call time, so each test sets and
  // restores its own env override.
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.UPLOAD_MAX_BYTES;
  });
  afterEach(() => {
    if (saved == null) delete process.env.UPLOAD_MAX_BYTES;
    else process.env.UPLOAD_MAX_BYTES = saved;
  });

  it("returns the 50 MB default when the env var is unset", () => {
    delete process.env.UPLOAD_MAX_BYTES;
    expect(getMaxUploadBytes()).toBe(FIFTY_MB);
  });

  it("parses the env var as bytes when it's a positive integer", () => {
    process.env.UPLOAD_MAX_BYTES = "104857600"; // 100 MB
    expect(getMaxUploadBytes()).toBe(104857600);
  });

  it("falls back to the default when the env var is empty", () => {
    process.env.UPLOAD_MAX_BYTES = "";
    expect(getMaxUploadBytes()).toBe(FIFTY_MB);
  });

  it("falls back to the default when the env var is non-numeric", () => {
    process.env.UPLOAD_MAX_BYTES = "fifty-mb";
    expect(getMaxUploadBytes()).toBe(FIFTY_MB);
  });

  it("falls back to the default when the env var is zero or negative", () => {
    process.env.UPLOAD_MAX_BYTES = "0";
    expect(getMaxUploadBytes()).toBe(FIFTY_MB);
    process.env.UPLOAD_MAX_BYTES = "-1024";
    expect(getMaxUploadBytes()).toBe(FIFTY_MB);
  });

  it("floors fractional values rather than throwing", () => {
    process.env.UPLOAD_MAX_BYTES = "1024.9";
    expect(getMaxUploadBytes()).toBe(1024);
  });
});

describe("bytesToMb", () => {
  it("rounds to the nearest MB", () => {
    expect(bytesToMb(50 * 1024 * 1024)).toBe(50);
    expect(bytesToMb(100 * 1024 * 1024)).toBe(100);
    expect(bytesToMb(0)).toBe(0);
  });

  it("rounds half-MB up", () => {
    expect(bytesToMb(1.5 * 1024 * 1024)).toBe(2);
  });
});
