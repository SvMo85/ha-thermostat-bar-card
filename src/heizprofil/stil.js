/** Stil des Heizprofil-Blatts; f sind die Farben der Karte. */
export function blattStil(f) {
  return `
      <style>
        :host {
          position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; justify-content: center;
          font-family: var(--ha-font-family-body, Roboto, sans-serif); color: var(--primary-text-color);
          --spur: var(--divider-color, rgba(225, 225, 225, 0.12));
        }
        *, *::before, *::after { box-sizing: border-box; }
        button { font: inherit; color: inherit; cursor: pointer; }
        button:disabled { cursor: default; }
        ha-icon { --mdc-icon-size: 22px; }
        .abdunkeln { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
        .blatt {
          position: relative; width: 100%; max-width: 560px; height: 92%;
          display: flex; flex-direction: column; overscroll-behavior: contain;
          background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          border-radius: 20px 20px 0 0; box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.5);
          padding-bottom: env(safe-area-inset-bottom);
        }
        .griff { width: 40px; height: 4px; border-radius: 2px; background: var(--spur); margin: 8px auto 2px; flex: 0 0 auto; }
        .kopf { display: flex; align-items: center; gap: 4px; padding: 6px 8px 6px 16px; flex: 0 0 auto; }
        .kopf.mit-zurueck { padding-left: 4px; }
        .kopf h1 { font-size: 1.1rem; font-weight: 500; margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rundknopf { width: 44px; height: 44px; border-radius: 50%; border: none; background: transparent;
          display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
        .inhalt { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
        .fuss { flex: 0 0 auto; display: flex; gap: 8px; padding: 10px 16px 16px; border-top: 1px solid var(--spur); }
        .fuss button { flex: 1; height: 48px; border-radius: 12px; border: none; background: var(--spur); font-weight: 500; }
        .fuss button.haupt { background: var(--primary-color); color: #fff; }
        .fuss button:disabled { opacity: 0.45; }

        .chips { display: flex; gap: 6px; margin: 4px 0 12px; }
        .chips button { flex: 1; min-width: 0; height: 40px; border-radius: 10px; border: none;
          background: var(--spur); font-size: 0.9rem; position: relative; }
        .chips button[aria-pressed="true"] { background: var(--primary-color); color: #fff; font-weight: 500; }
        /* Punkt unten: aktives Profil bzw. heute. Punkt oben: ungespeichert. */
        .chips button.aktiv::after { content: ""; position: absolute; left: 50%; bottom: 4px; width: 4px; height: 4px;
          margin-left: -2px; border-radius: 50%; background: currentColor; }
        .chips button.geaendert::before, .wochentag.geaendert .name::after { content: ""; position: absolute;
          top: 5px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: ${f.target}; }
        .titel { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--secondary-text-color);
          margin: 14px 0 6px; display: flex; justify-content: space-between; gap: 8px; }
        .titel .zaehler { text-transform: none; letter-spacing: 0; }
        .titel .zaehler.voll { color: var(--error-color, #db4437); }
        .hinweis { color: var(--secondary-text-color); font-size: 0.85rem; }
        .hinweis.fehler { color: var(--error-color, #db4437); }

        .tag { position: relative; border-radius: 10px; background: var(--spur); overflow: hidden; user-select: none; }
        .tag svg { display: block; width: 100%; height: 100%; }
        .tag .wert { position: absolute; transform: translate(-50%, -100%); font-size: 0.75rem; padding-bottom: 3px;
          white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums; }
        .zeitachse { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--secondary-text-color);
          margin: 4px 2px 0; font-variant-numeric: tabular-nums; }
        .eingerueckt { display: grid; grid-template-columns: 34px 1fr 24px; gap: 8px; }

        .woche { display: grid; gap: 6px; }
        .wochentag { display: grid; grid-template-columns: 34px 1fr 24px; align-items: center; gap: 8px; min-height: 44px;
          border: none; background: transparent; padding: 2px 0; text-align: left; border-radius: 8px; }
        .wochentag .name { font-size: 0.9rem; position: relative; padding-right: 10px; }
        .wochentag.heute .name { color: var(--primary-color); font-weight: 500; }
        .wochentag.aktuell { background: var(--spur); padding-left: 4px; margin-left: -4px; }
        .wochentag .tag { border-radius: 7px; }
        .wochentag ha-icon { color: var(--secondary-text-color); --mdc-icon-size: 20px; }
        .wochentag ha-icon.an { color: var(--primary-color); }
        .wochentag.quelle { opacity: 0.55; }
        .schnellwahl { display: flex; gap: 6px; margin: 4px 0 12px; }
        .schnellwahl button { flex: 1; height: 36px; border-radius: 18px; border: 1px solid var(--spur);
          background: transparent; font-size: 0.85rem; }

        .zeitraum { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; min-height: 56px;
          padding: 6px 6px 6px 12px; margin-bottom: 6px; border-radius: 12px; background: var(--spur);
          border-left: 4px solid var(--farbe, transparent); }
        .zeitraum.gewaehlt { outline: 2px solid var(--primary-color); outline-offset: -2px; }
        .zeit { display: flex; gap: 4px; align-items: center; font-size: 1rem; font-variant-numeric: tabular-nums; }
        .zeit.ohne-knopf { padding: 8px 4px; }
        .zeit button { border: none; background: transparent; padding: 8px 4px; border-radius: 6px; font-size: 1rem; }
        .unter { font-size: 0.75rem; color: var(--secondary-text-color); padding-left: 4px; }
        .stepper { display: flex; align-items: center; gap: 2px; }
        .stepper button { width: 44px; height: 44px; border-radius: 10px; border: none;
          background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          display: inline-flex; align-items: center; justify-content: center; }
        .stepper .temp { min-width: 58px; text-align: center; font-size: 1.05rem; font-weight: 500; font-variant-numeric: tabular-nums; }
        .aufgeklappt { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; }
        .loeschen { height: 44px; border: none; background: transparent; color: var(--error-color, #db4437);
          display: inline-flex; align-items: center; gap: 4px; padding: 0 4px; }
        .zuklappen { height: 44px; min-width: 96px; border-radius: 10px; border: none; color: var(--primary-color); font-weight: 500;
          background: var(--ha-card-background, var(--card-background-color, #1c1c1c)); }
        .hinzu { width: 100%; height: 48px; border-radius: 12px; border: 1px dashed var(--spur); background: transparent;
          color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
        .hinzu:disabled { opacity: 0.5; }

        .meldung { position: absolute; left: 16px; right: 16px; bottom: 84px; padding: 12px 14px; border-radius: 10px;
          background: #323232; color: #f1f1f1; font-size: 0.9rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
        .meldung[hidden] { display: none; }

        .sperre { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.35); border-radius: inherit; cursor: wait; }
        .sperre-text { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 12px;
          background: #323232; color: #f1f1f1; font-size: 0.95rem; font-weight: 500; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
        .lader { width: 18px; height: 18px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent;
          animation: lader-dreht 900ms linear infinite; }
        @keyframes lader-dreht { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .lader { animation: none; } }

        @media (hover: hover) {
          .rundknopf:hover, .zeit button:hover { background: var(--spur); }
          .chips button:hover, .stepper button:hover, .fuss button:hover:not(:disabled) { filter: brightness(1.15); }
        }
        button:focus-visible { outline: 2px solid ${f.target}; outline-offset: 2px; }
      </style>
  `;
}
