import fs from "fs";
import path from "path";

const cards = [
  { id: "cinza-rastejante", bg: "#3d3d48", accent: "#a8a29e", sym: "◌" },
  { id: "fragmento-poco", bg: "#1e3a4a", accent: "#5eead4", sym: "◇" },
  { id: "vigia-reverso", bg: "#2d2458", accent: "#a78bfa", sym: "△" },
  { id: "eco-banshee", bg: "#1a3d2e", accent: "#86efac", sym: "◎" },
  { id: "lamina-pacto", bg: "#4a1c28", accent: "#fca5a5", sym: "†" },
  { id: "guardiao-estandarte", bg: "#3d3520", accent: "#fcd34d", sym: "▣" },
  { id: "flagelo-cobre", bg: "#4a2c14", accent: "#fdba74", sym: "⚡" },
  { id: "sombra-erudito", bg: "#1a2240", accent: "#93c5fd", sym: "☾" },
  { id: "colosso-abismo", bg: "#2a1020", accent: "#f472b6", sym: "▲" },
  { id: "carnical-incandescente", bg: "#4a1808", accent: "#fb923c", sym: "✦" },
  { id: "token-gargula", bg: "#2a2a32", accent: "#a8a29e", sym: "G" },
  { id: "susej-arauto", bg: "#1a1a2e", accent: "#c4b5fd", sym: "?" },
];

const dir = path.join("public", "cards");
fs.mkdirSync(dir, { recursive: true });

for (const c of cards) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="200" height="280">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c.bg}"/>
      <stop offset="100%" stop-color="#0f0e14"/>
    </linearGradient>
  </defs>
  <rect width="200" height="280" fill="url(#g)"/>
  <ellipse cx="100" cy="118" rx="62" ry="72" fill="${c.accent}" opacity="0.35"/>
  <ellipse cx="100" cy="112" rx="42" ry="50" fill="${c.accent}" opacity="0.55"/>
  <text x="100" y="132" text-anchor="middle" font-size="48" fill="${c.accent}" opacity="0.9" font-family="Segoe UI, sans-serif">${c.sym}</text>
  <rect x="12" y="12" width="176" height="256" rx="8" fill="none" stroke="${c.accent}" stroke-width="2" opacity="0.4"/>
</svg>`;
  fs.writeFileSync(path.join(dir, `${c.id}.svg`), svg);
}

console.log(`Generated ${cards.length} placeholders in ${dir}/`);
