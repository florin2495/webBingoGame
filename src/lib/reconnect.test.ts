import { describe, expect, it } from "vitest";
import { DISCONNECT_MS, isConnected, isDeviceId, seatBusyMessage, seatClaim } from "./reconnect";

const T0 = Date.parse("2026-01-01T12:00:00.000Z");
const at = new Date(T0).toISOString();
const A = "a".repeat(64);
const B = "b".repeat(64);

describe("isConnected", () => {
  it("is true until DISCONNECT_MS has passed", () => {
    expect(isConnected(at, T0)).toBe(true);
    expect(isConnected(at, T0 + DISCONNECT_MS - 1)).toBe(true);
    expect(isConnected(at, T0 + DISCONNECT_MS)).toBe(false);
  });
  it("treats missing or invalid stamps as disconnected", () => {
    expect(isConnected(null, T0)).toBe(false);
    expect(isConnected(undefined, T0)).toBe(false);
    expect(isConnected("garbage", T0)).toBe(false);
  });
});

describe("isDeviceId", () => {
  it("accepts UUIDs only", () => {
    expect(isDeviceId("3f2b8c1e-9d4a-4c7e-8b1f-0a2d3e4f5a6b")).toBe(true);
    expect(isDeviceId("3F2B8C1E-9D4A-4C7E-8B1F-0A2D3E4F5A6B")).toBe(true);
    expect(isDeviceId("not-a-uuid")).toBe(false);
    expect(isDeviceId("")).toBe(false);
    expect(isDeviceId(42)).toBe(false);
    expect(isDeviceId(undefined)).toBe(false);
  });
});

describe("seatClaim", () => {
  it("lets the same device reclaim even while the seat looks connected", () => {
    expect(seatClaim({ device_hash: A, last_seen_at: at }, A, T0)).toBe("device");
  });
  it("refuses another device while the seat is connected", () => {
    expect(seatClaim({ device_hash: A, last_seen_at: at }, B, T0 + 1_000)).toBe("busy");
    expect(seatClaim({ device_hash: A, last_seen_at: at }, null, T0 + 1_000)).toBe("busy");
    expect(seatClaim({ device_hash: null, last_seen_at: at }, B, T0 + 1_000)).toBe("busy");
  });
  it("lets anyone reclaim a disconnected seat", () => {
    const later = T0 + DISCONNECT_MS;
    expect(seatClaim({ device_hash: A, last_seen_at: at }, B, later)).toBe("stale");
    expect(seatClaim({ device_hash: A, last_seen_at: at }, null, later)).toBe("stale");
    expect(seatClaim({ device_hash: null, last_seen_at: at }, null, later)).toBe("stale");
  });
  it("never matches two unknown devices", () => {
    expect(seatClaim({ device_hash: null, last_seen_at: at }, null, T0)).toBe("busy");
  });
});

describe("seatBusyMessage", () => {
  it("names the player and the wait", () => {
    expect(seatBusyMessage("Ana")).toBe("Ana e conectat acum. Dacă ești tu, închide celălalt tab sau așteaptă 45 de secunde.");
  });
});
