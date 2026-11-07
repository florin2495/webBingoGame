import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bingo",
    short_name: "Bingo",
    description: "Bingo multiplayer între prieteni, cu matrice N×N personalizabilă.",
    id: "/classicbingo/",
    start_url: "/classicbingo/",
    // "/" on purpose: leaving the game for the hub (same origin) stays inside the installed app.
    scope: "/",
    display: "standalone",
    lang: "ro",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/classicbingo/pwa-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/classicbingo/pwa-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/classicbingo/pwa-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
