// Baut src/ zu der einen Datei, die Home Assistant und HACS laden.
// npm run build    einmal bauen
// npm run watch    bei jeder Aenderung neu bauen
import * as esbuild from "esbuild";
import { CARD_VERSION } from "./src/konstanten.js";

const optionen = {
  entryPoints: ["src/thermostat-bar-card.js"],
  outfile: "dist/thermostat-bar-card.js",
  bundle: true,
  format: "esm",
  target: "es2020",
  charset: "utf8",
  banner: {
    js: `// Thermostat Bar Card ${CARD_VERSION}\n// Gebaut aus src/ mit npm run build. Nicht von Hand bearbeiten.`
  },
  logLevel: "info"
};

if (process.argv.includes("--watch")) {
  const kontext = await esbuild.context(optionen);
  await kontext.watch();
} else {
  await esbuild.build(optionen);
}
