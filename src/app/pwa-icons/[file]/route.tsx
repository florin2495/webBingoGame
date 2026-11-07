import { pwaIcon } from "@/lib/pwa-icon";

const ICONS: Record<string, { size: number; safe: number }> = {
  // apple-touch-icon (linked from layout metadata; an app/apple-icon.tsx URL misses basePath under Turbopack).
  "apple-icon.png": { size: 180, safe: 0.84 },
  "icon-192.png": { size: 192, safe: 0.86 },
  "icon-512.png": { size: 512, safe: 0.86 },
  "icon-maskable-512.png": { size: 512, safe: 0.68 },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const spec = ICONS[file];
  if (!spec) return new Response("Not found", { status: 404 });
  return pwaIcon(spec.size, spec.safe);
}
