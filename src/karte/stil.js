import { RAND_BEARBEITEN_PX } from "../konstanten.js";

/** Stil der Karte; c ist die Konfiguration, f deren Farben. */
export function karteStil(c, f) {
  return `
      <style>
        :host { display: block; }
        *, *::before, *::after { box-sizing: border-box; }
        ha-card {
          display: flex; flex-direction: column; gap: 14px;
          padding: 14px 16px; position: relative;
          width: 100%; overflow: hidden;
        }

        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .name {
          font-size: 1.12rem; font-weight: 600; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
        .namensymbol { --mdc-icon-size: 21px; color: var(--secondary-text-color); flex: 0 0 auto; }
        .lock {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; flex: 0 0 auto; margin-left: -4px;
          border: 1px solid transparent; border-radius: 8px;
          background: transparent; color: var(--secondary-text-color);
          cursor: pointer; padding: 0;
        }
        .lock[aria-pressed="true"] { color: ${f.lock_active}; border-color: ${f.lock_active}; }
        .lock ha-icon { --mdc-icon-size: 18px; }

        .status {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 0.98rem; white-space: nowrap; color: ${f.status_idle};
        }
        .status ha-icon { --mdc-icon-size: 18px; }
        .status[data-zustand="heating"] { color: ${f.status_heating}; font-weight: 500; }
        .status[data-zustand="reached"] { color: ${f.status_reached}; font-weight: 500; }

        /* Tagesplan, Leiste und Knoepfe stehen in einem Behaelter mit
           einheitlichem Abstand, damit sie als ein Bedienelement wirken. */
        .instrument { display: flex; flex-direction: column; gap: 6px; }

        /* Volle Kartenbreite wie die Knoepfe: der Randbereich der Leiste
           existiert nur fuer deren Beschriftungen. */
        .tagesplan {
          position: relative; height: ${c.height}px;
          cursor: pointer; transition: transform 120ms ease;
        }
        .tagesplan.haelt { transform: scale(0.98); }
        .tagesplan.haelt .haltefortschritt { opacity: 1; }
        .tagesplan:focus-visible { outline: none; }
        .tagesplan:focus-visible .tp-clip { outline: 2px solid ${f.target}; outline-offset: 2px; }
        .tp-clip {
          position: absolute; inset: 0; border-radius: 8px; overflow: hidden;
          background: ${f.track};
        }
        .tp-marke { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--divider-color); }
        /* Liegt im gerundeten Beschnitt, damit Flaeche und Linie den Ecken folgen. */
        .tp-kurve { position: absolute; inset: 0; width: 100%; height: 100%; }
        .tp-kurve text {
          font: 600 11px var(--ha-font-family-body, Roboto, sans-serif);
          font-variant-numeric: tabular-nums;
          paint-order: stroke; stroke: var(--card-background-color, #1c1c1c); stroke-width: 3px;
        }
        .tp-jetzt {
          position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px;
          background: var(--primary-text-color); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
          border-radius: 1px; pointer-events: none;
        }

        .trackwrap { position: relative; transition: transform 120ms ease; }
        .trackwrap.haelt { transform: scale(0.98); }

        /* Waechst waehrend des Haltens von der Mitte nach aussen. */
        .haltefortschritt {
          position: absolute; top: 0; bottom: 0; left: 50%; width: 0;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.22);
          border-left: 2px solid rgba(255, 255, 255, 0.55);
          border-right: 2px solid rgba(255, 255, 255, 0.55);
          opacity: 0; pointer-events: none;
        }
        .trackwrap.haelt .haltefortschritt { opacity: 1; }
        .trackwrap.anzeige {
          height: ${c.height}px; margin: 0 ${c.edge_space}px;
          touch-action: auto; cursor: pointer;
        }
        .trackwrap.bedienbar {
          height: ${c.edit_height}px; margin: 0 ${RAND_BEARBEITEN_PX}px;
          touch-action: none; cursor: pointer;
        }
        .trackclip {
          position: absolute; inset: 0; border-radius: 8px;
          background: ${f.track}; overflow: hidden; z-index: 1;
        }

        /* Warmer Schein unter der Heizanforderung, ausserhalb des Beschnitts */
        .waermeglow {
          position: absolute; top: 3px; bottom: 3px; display: none; z-index: 0;
          background: ${f.demand_glow}; opacity: 0.5; filter: blur(12px);
          border-radius: 8px; pointer-events: none;
        }
        .trackwrap:focus-visible .trackclip {
          outline: 2px solid ${f.target}; outline-offset: 2px;
        }
        /* Glut-Verlauf von der Ist-Kante zum Sollwert. Beginnt exakt an der
           Ist-Kante, damit die Ist-Fuellung nicht optisch verkuerzt wird. */
        .demand {
          position: absolute; top: 0; bottom: 0; display: none; overflow: hidden;
          background: ${f.demand};
        }
        .demand::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 0%, rgba(255, 196, 128, 0.2) 45%, transparent 70%);
          background-size: 220% 100%;
          animation: waermeflimmern 3.2s ease-in-out infinite;
        }
        @keyframes waermeflimmern {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        .fill { position: absolute; inset: 0 auto 0 0; background: ${f.current}; }

        /* Der Soll-Strich steht wie der Zeitstrich ueber die Leiste hinaus und
           liegt deshalb ausserhalb des Beschnitts. Strich und Kugel haben eine
           gerade Breite und stehen auf ganzen Pixeln; sonst rundet der Browser
           ihre Kanten verschieden und der Strich sitzt neben der Kugelmitte. */
        .markerline {
          position: absolute; top: -4px; bottom: -4px; z-index: 2;
          width: 4px; margin-left: -2px; border-radius: 2px; background: ${f.target};
        }
        .markerdot {
          position: absolute; top: 50%;
          width: 18px; height: 18px; margin: -9px 0 0 -9px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 35%, #f2c27a 0%, ${f.target} 40%, #a86a1a 100%);
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4); pointer-events: none;
          z-index: 2;
        }
        .lbl {
          position: absolute; top: 50%; transform: translateY(-50%);
          white-space: nowrap; pointer-events: none; z-index: 2;
          font-size: 1.2rem; font-variant-numeric: tabular-nums;
        }
        .lbl.ist { color: ${f.label_current}; }
        .lbl.soll { color: ${f.label_target}; font-weight: 600; }

        /* Beim Heizen: Strich dunkelrot hinter der Kugel, die Kugel glueht,
           die Soll-Beschriftung zieht mit. */
        .trackwrap.heizt .markerline {
          background: ${f.target_heating};
          box-shadow: 0 0 6px 1px ${f.target_heating};
        }
        .trackwrap.heizt .markerdot {
          background: radial-gradient(circle at 40% 35%, #ffd8a8 0%, #ff7a33 45%, #d63c18 100%);
          animation: glutpuls 1.8s ease-in-out infinite;
        }
        .trackwrap.heizt .lbl.soll { color: #ff8a4a; }
        @keyframes glutpuls {
          0%, 100% { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 10px 2px rgba(255, 90, 38, 0.5); }
          50%      { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 18px 6px rgba(255, 90, 38, 0.85); }
        }

        @media (prefers-reduced-motion: reduce) {
          .demand::after { animation: none; }
          .trackwrap.heizt .markerdot {
            animation: none;
            box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 14px 4px rgba(255, 90, 38, 0.65);
          }
          .trackwrap { transition: none; }
        }
        .einheit { font-size: 0.58em; vertical-align: super; margin-left: 2px; }

        /* Segmentleiste: gleiche Flaeche wie die Leiste, schmale Fugen, nur
           die aeusseren Ecken gerundet. */
        .modes { display: flex; gap: 2px; }
        .modes button {
          flex: 1; min-width: 0; min-height: 44px;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          border: 1px solid transparent; border-radius: 0;
          background: ${f.track}; color: var(--primary-text-color);
          font: inherit; font-size: 1.06rem; cursor: pointer;
        }
        .modes button:first-child { border-radius: 8px 0 0 8px; }
        .modes button:last-child { border-radius: 0 8px 8px 0; }
        .modes button:only-child { border-radius: 8px; }
        .modes button ha-icon { --mdc-icon-size: 22px; }
        .modes button[aria-pressed="true"] { font-weight: 600; color: #eef3f7; }
        .modes button[aria-pressed="true"][data-mode="auto"] { background: ${f.mode_auto}; border-color: ${f.mode_auto}; }
        .modes button[aria-pressed="true"][data-mode="heat"],
        .modes button[aria-pressed="true"][data-mode="heat_cool"] { background: ${f.mode_heat}; border-color: ${f.mode_heat}; }
        .modes button[aria-pressed="true"][data-mode="off"],
        .modes button[aria-pressed="true"][data-mode="cool"] {
          background: ${f.mode_off}; border-color: ${f.mode_off};
        }

        /* Ersetzt im Bearbeitungsmodus Anzeigeleiste und Modus-Knoepfe im
           Fluss der Karte; die Karte waechst dabei mit. */
        .editbox {
          display: flex; flex-direction: column; gap: 12px;
          background: var(--secondary-background-color, rgba(0, 0, 0, 0.25));
          border: 1px solid var(--divider-color); border-radius: 12px;
          padding: 12px;
        }
        .editbox .zeile { display: flex; gap: 12px; }
        .editbox .zeile button {
          flex: 1; min-height: 54px; border-radius: 12px;
          border: 1px solid var(--divider-color); background: transparent;
          color: var(--primary-text-color); font: inherit; font-size: 1.8rem;
          line-height: 1; cursor: pointer;
        }
        .editbox .fertig {
          min-height: 46px; border: 1px solid ${f.target}; border-radius: 10px;
          background: ${f.target}; color: #16181a;
          font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer;
        }

        /* Rueckmeldung fuer alles Bedienbare. */
        .lock, .modes button, .editbox button, .trackclip {
          transition: background-color 120ms ease, border-color 120ms ease,
                      filter 120ms ease, transform 80ms ease, box-shadow 120ms ease;
        }

        /* Hover nur bei echtem Zeiger. Auf Touchgeraeten bliebe der Effekt
           nach dem Antippen haengen. */
        @media (hover: hover) {
          .lock:hover {
            background: rgba(255, 255, 255, 0.08);
            color: var(--primary-text-color);
          }
          .lock[aria-pressed="true"]:hover { color: ${f.lock_active}; }
          .modes button:hover {
            filter: brightness(1.15);
            border-color: var(--secondary-text-color);
          }
          .modes button[aria-pressed="true"]:hover { filter: brightness(1.1); }
          .trackwrap:hover .trackclip {
            filter: brightness(1.12);
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
          }
          .editbox .zeile button:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--secondary-text-color);
          }
          .editbox .fertig:hover { filter: brightness(1.1); }
        }

        /* Druckrueckmeldung wirkt auch auf Touchgeraeten. */
        .lock:active, .modes button:active, .editbox button:active { transform: scale(0.97); }

        .lock:focus-visible, .modes button:focus-visible, .editbox button:focus-visible {
          outline: 2px solid ${f.target}; outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
          .lock, .modes button, .editbox button, .trackclip { transition: none; }
          .lock:active, .modes button:active, .editbox button:active { transform: none; }
        }
      </style>
  `;
}
