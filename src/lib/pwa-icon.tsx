import { ImageResponse } from "next/og";

const BG = "#4f46e5";
const NUMS = ["B", "I", "N", "G", "O"];

/**
 * Opaque bingo-card icon: indigo background, white card with a "BINGO" header
 * and a 3x3 grid of marked cells. `safe` is the fraction of the canvas the
 * artwork occupies (maskable icons need it inside the central 80%).
 */
export function pwaIcon(size: number, safe: number) {
  const card = Math.round(size * safe);
  const pad = Math.round(card * 0.07);
  const headH = Math.round(card * 0.24);
  const gap = Math.round(card * 0.035);
  const inner = card - pad * 2;
  const cell = Math.floor((inner - gap * 2) / 3);
  const cellH = Math.floor((inner - headH - gap * 3) / 3);
  const marked = new Set([0, 4, 8, 2, 6]);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
        }}
      >
        <div
          style={{
            width: card,
            height: card,
            display: "flex",
            flexDirection: "column",
            background: "#ffffff",
            borderRadius: Math.round(card * 0.14),
            padding: pad,
          }}
        >
          <div
            style={{
              height: headH,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: gap,
              color: BG,
              fontSize: Math.round(headH * 0.8),
              fontWeight: 900,
            }}
          >
            {NUMS.map((l) => (
              <div key={l} style={{ display: "flex", width: "20%", justifyContent: "center" }}>
                {l}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", width: inner, gap }}>
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: cell,
                  height: cellH,
                  borderRadius: Math.round(cell * 0.22),
                  background: marked.has(i) ? "#f59e0b" : "#e4e4e7",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
