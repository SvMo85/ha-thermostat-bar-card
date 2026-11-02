import { KANTENUEBERGANG_PX } from "./konstanten.js";

/**
 * Theme-Farbnamen wie "primary" oder "secondary-text" werden wie in Home
 * Assistant zu var(--primary-color). Alles andere bleibt, wie es ist.
 * Der Rueckfall auf den Namen selbst haelt CSS-Farbnamen wie "red" gueltig.
 */
export function cssFarbe(wert) {
  if (typeof wert !== "string") return wert;
  if (/^[a-z]+(-[a-z]+)*$/.test(wert)) return `var(--${wert}-color, ${wert})`;
  return wert;
}

export const dunkler = (farbe, anteil) => `color-mix(in oklab, ${farbe} ${anteil}%, #000)`;

/** Gluehverlauf von der Ist-Kante zum Sollwert, dunkel beginnend. */
export function heizflaecheVerlauf(istFarbe, waermeFarbe) {
  return (
    `linear-gradient(90deg in oklab, ${istFarbe} 0px, ${dunkler(waermeFarbe, 45)} ${KANTENUEBERGANG_PX}px, ` +
    `${dunkler(waermeFarbe, 62)} 40%, ${dunkler(waermeFarbe, 85)} 78%, ${waermeFarbe} 100%)`
  );
}
