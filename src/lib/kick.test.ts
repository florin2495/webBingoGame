import { describe, expect, it } from "vitest";
import { isKickExpired, KICK_EXPIRY_MS, KICK_GRACE_MS, kickRemainingMs } from "./kick";

const T0 = Date.parse("2026-01-01T12:00:00.000Z");

describe("kickRemainingMs", () => {
  it("is null without a pending kick", () => {
    expect(kickRemainingMs(null, T0)).toBeNull();
    expect(kickRemainingMs(undefined, T0)).toBeNull();
    expect(kickRemainingMs("not a date", T0)).toBeNull();
  });
  it("counts down from the grace period", () => {
    expect(kickRemainingMs("2026-01-01T12:00:00.000Z", T0)).toBe(KICK_GRACE_MS);
    expect(kickRemainingMs("2026-01-01T12:00:00.000Z", T0 + 4_000)).toBe(6_000);
  });
  it("clamps to [0, KICK_GRACE_MS]", () => {
    expect(kickRemainingMs(T0, T0 + 60_000)).toBe(0);
    expect(kickRemainingMs(T0 + 5_000, T0)).toBe(KICK_GRACE_MS); // clock skew: requested "in the future"
  });
});

describe("isKickExpired", () => {
  it("is false without a kick and within grace + network grace", () => {
    expect(isKickExpired(null, T0)).toBe(false);
    expect(isKickExpired(T0, T0 + KICK_GRACE_MS)).toBe(false);
    expect(isKickExpired(T0, T0 + KICK_EXPIRY_MS)).toBe(false);
  });
  it("is true after grace + 2 s", () => {
    expect(isKickExpired(T0, T0 + KICK_EXPIRY_MS + 1)).toBe(true);
    expect(isKickExpired("2026-01-01T12:00:00.000Z", T0 + 60_000)).toBe(true);
  });
});
