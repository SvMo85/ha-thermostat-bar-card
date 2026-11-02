/**
 * Thermostat Bar Card
 *
 * Waagerechte Thermostat-Karte fuer Home Assistant: Die Fuellung zeigt die
 * Ist-Temperatur, die Flaeche bis zur Markierung die Heizanforderung.
 *
 * Die Leiste in der Karte ist reine Anzeige, damit senkrechtes Scrollen auf
 * Telefonen nie versehentlich einen Wert verstellt. Ein Halten von 600 ms
 * oeffnet den Bearbeitungsmodus, der dieselbe Leiste noch einmal zeigt,
 * dort ziehbar und mit grossen Plus- und Minus-Flaechen.
 *
 * Ueber der Leiste zeigt die Karte auf Wunsch den Tagesplan des Heizprofils
 * als Kurve, dazu Abweichungen vom Plan und den gemessenen Verlauf bis jetzt.
 * Der Plan stammt aus dem Attribut schedule_data, das Homematic(IP) Local an
 * jeder Klima-Entitaet bereitstellt.
 *
 * Der Betriebsmodus wird beim Verstellen bewusst nicht geaendert. Homematic IP
 * behaelt einen im Automatikbetrieb gesetzten Wert bis zum naechsten
 * Schaltzeitpunkt des Heizprofils bei; das ist gewolltes Verhalten.
 */

const CARD_VERSION = "0.3.1";

console.info(
  `%c THERMOSTAT-BAR-CARD %c ${CARD_VERSION} `,
  "color: #16181a; background: #e8a33d; font-weight: 700;",
  "color: #e8a33d; background: #16181a;"
);

// Ein Blau fuer Ist und Automatik, ein Rot fuer alles, was heizt. Beide sind
// Theme-Farben von Home Assistant und folgen damit dem eingestellten Theme.
const IST_FARBE = "var(--primary-color, #009ac7)";
const WAERME_FARBE = "var(--red-color, #f44336)";

const STANDARDFARBEN = {
  track: "var(--divider-color, #262c32)",
  current: IST_FARBE,
  demand: null, // wird aus current und demand_glow abgeleitet, siehe heizflaecheVerlauf
  demand_glow: WAERME_FARBE,
  target: "#e8a33d",
  target_heating: null, // wird aus demand_glow abgeleitet
  label_current: "#dde7ee",
  label_target: "#e8a33d",
  status_heating: WAERME_FARBE,
  status_reached: IST_FARBE,
  status_idle: "var(--secondary-text-color, #8d97a1)",
  mode_auto: IST_FARBE,
  mode_heat: WAERME_FARBE,
  mode_off: "#3d5f7a",
  mode_inactive: "var(--divider-color, #2a3036)",
  lock_active: "#c06a6a"
};

const TAGESPLAN_VORGABEN = {
  show: false,
  min_temp: 16,
  max_temp: 24,
  min_color: "primary",
  max_color: "red",
  show_history: true,
  // Bewusst dumpf und fast grau: der Verlauf ergaenzt die Planlinie, er
  // darf ihr nicht die Aufmerksamkeit nehmen.
  history_heating_color: "#b46058",
  history_idle_color: "#5e92ac",
  history_color: "secondary-text"
};

const KARTEN_VORGABEN = {
  name: null,
  icon: "mdi:radiator",
  lock_entity: null,
  height: 44,
  edit_height: 56,
  edge_space: 60,
  tolerance: 0.2,
  show_labels: true,
  show_status: true,
  show_icons: true,
  show_mode_labels: true,
  hvac_modes: null
};

const MODUS_SYMBOLE = {
  auto: "mdi:calendar-sync",
  heat: "mdi:fire",
  cool: "mdi:snowflake",
  heat_cool: "mdi:autorenew",
  dry: "mdi:water-percent",
  fan_only: "mdi:fan",
  off: "mdi:power"
};

const HALTEDAUER_MS = 600;
const BEWEGUNGSSCHWELLE_PX = 6;
const BESCHRIFTUNGSLUECKE_PX = 10;
const GREIFPUNKT_RADIUS_PX = 9;
const RAND_BEARBEITEN_PX = 52;

// Ueber diese Breite laeuft das Blau der Ist-Fuellung ins Rot der
// Heizflaeche: genug gegen die harte Farbkante, wenig genug, damit die
// Grenze zwischen Ist und Soll klar bleibt.
const KANTENUEBERGANG_PX = 4;

const TAGESMINUTEN = 1440;
const ZEITMARKEN_MIN = [240, 480, 720, 960, 1200];
const RAMPE_MIN = 40;
const SKALA_LUFT_GRAD = 0.5;
const KURVE_LINIE_PX = 2.5;
const KURVE_FLAECHE_DECKKRAFT = 0.3;
const VERLAUF_LINIE_PX = 1.5;
const VERLAUF_FARBSTAERKE_PROZENT = 60;
const VERLAUF_ABRUF_MS = 5 * 60 * 1000;
const UHR_TAKT_MS = 60 * 1000;
const ABWEICHUNG_SCHWELLE_GRAD = 0.05;

/**
 * Theme-Farbnamen wie "primary" oder "secondary-text" werden wie in Home
 * Assistant zu var(--primary-color). Alles andere bleibt, wie es ist.
 * Der Rueckfall auf den Namen selbst haelt CSS-Farbnamen wie "red" gueltig.
 */
function cssFarbe(wert) {
  if (typeof wert !== "string") return wert;
  if (/^[a-z]+(-[a-z]+)*$/.test(wert)) return `var(--${wert}-color, ${wert})`;
  return wert;
}

const dunkler = (farbe, anteil) => `color-mix(in oklab, ${farbe} ${anteil}%, #000)`;

/** Gluehverlauf von der Ist-Kante zum Sollwert, dunkel beginnend. */
function heizflaecheVerlauf(istFarbe, waermeFarbe) {
  return (
    `linear-gradient(90deg in oklab, ${istFarbe} 0px, ${dunkler(waermeFarbe, 45)} ${KANTENUEBERGANG_PX}px, ` +
    `${dunkler(waermeFarbe, 62)} 40%, ${dunkler(waermeFarbe, 85)} 78%, ${waermeFarbe} 100%)`
  );
}

/** "06:45" -> 405, "24:00" -> 1440 */
function uhrzeitInMinuten(text) {
  const teile = /^(\d{1,2}):(\d{2})$/.exec(String(text));
  if (!teile) return null;
  return Number(teile[1]) * 60 + Number(teile[2]);
}

function wertUm(abschnitte, minute) {
  const abschnitt = abschnitte.find((a) => minute >= a.von && minute < a.bis);
  return abschnitt ? abschnitt.temp : null;
}

function naechsterSchaltpunkt(abschnitte, minute) {
  const abschnitt = abschnitte.find((a) => a.von > minute);
  return abschnitt ? abschnitt.von : TAGESMINUTEN;
}

/**
 * Ein Wochentag aus schedule_data als lueckenlose Abschnitte von 0 bis 1440
 * Minuten. Die Grundtemperatur gilt ueberall, wo keine Periode liegt.
 */
function tagesabschnitte(tagesplan) {
  if (!tagesplan) return [];
  const basis = Number(tagesplan.base_temperature);
  const perioden = (tagesplan.periods || [])
    .map((p) => ({
      von: uhrzeitInMinuten(p.starttime),
      bis: uhrzeitInMinuten(p.endtime),
      temp: Number(p.temperature)
    }))
    .filter((p) => p.von !== null && p.bis !== null && p.bis > p.von && Number.isFinite(p.temp))
    .sort((a, b) => a.von - b.von);

  const abschnitte = [];
  let position = 0;
  perioden.forEach((p) => {
    if (p.von > position && Number.isFinite(basis)) {
      abschnitte.push({ von: position, bis: p.von, temp: basis });
    }
    const von = Math.max(p.von, position);
    if (p.bis > von) abschnitte.push({ von, bis: p.bis, temp: p.temp });
    position = Math.max(position, p.bis);
  });
  if (position < TAGESMINUTEN && Number.isFinite(basis)) {
    abschnitte.push({ von: position, bis: TAGESMINUTEN, temp: basis });
  }
  return abschnitte;
}

/**
 * Teilt die Punkte des Verlaufs an jedem Farbwechsel. Jeder Abschnitt endet
 * auf dem ersten Punkt des naechsten, damit die Linie durchgehend bleibt.
 */
function verlaufsabschnitte(punkte, farbeVon) {
  const abschnitte = [];
  punkte.forEach((p) => {
    const farbe = farbeVon(p);
    const letzter = abschnitte[abschnitte.length - 1];
    if (letzter && letzter.farbe === farbe) {
      letzter.punkte.push(p);
      return;
    }
    if (letzter) letzter.punkte.push(p);
    abschnitte.push({ farbe, punkte: [p] });
  });
  return abschnitte.filter((a) => a.punkte.length >= 2);
}

/** Alle Temperaturen der Woche, fuer eine Hoehenskala, die nicht taeglich springt. */
function wochentemperaturen(planDaten) {
  return Object.values(planDaten || {}).flatMap((tag) => [
    Number(tag.base_temperature),
    ...(tag.periods || []).map((p) => Number(p.temperature))
  ]).filter(Number.isFinite);
}

class ThermostatBarCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("thermostat-bar-card-editor");
  }

  static getStubConfig(hass) {
    const ersteKlimaEntitaet = Object.keys(hass.states).find((id) => id.startsWith("climate."));
    return { entity: ersteKlimaEntitaet || "" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._haltenTimer = null;
    this._startX = 0;
    this._startY = 0;
    this._editBox = null;
    this._editLeiste = null;
    this._vorschauSoll = null;
    this._aufgebaut = false;
    this._verlauf = [];
    this._verlaufGeladenAm = 0;
    this._verlaufLaedt = false;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Es muss eine Klima-Entität angegeben werden.");
    }
    if (!config.entity.startsWith("climate.")) {
      throw new Error("entity muss aus der Domäne climate stammen.");
    }

    const farben = { ...STANDARDFARBEN, ...(config.colors || {}) };
    if (!farben.demand) farben.demand = heizflaecheVerlauf(farben.current, farben.demand_glow);
    if (!farben.target_heating) farben.target_heating = dunkler(farben.demand_glow, 80);

    this._config = {
      ...KARTEN_VORGABEN,
      ...config,
      colors: farben,
      schedule: { ...TAGESPLAN_VORGABEN, ...(config.schedule || {}) }
    };

    if (this._config.entity !== (this._verlaufEntitaet || this._config.entity)) this._verlauf = [];
    this._verlaufEntitaet = this._config.entity;
    this._verlaufGeladenAm = 0;
    this._aufgebaut = false;
    if (this._hass) this._zeichnen();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._zeichnen();
    this._verlaufBeiBedarfLaden();
  }

  getCardSize() {
    return this._tagesplanSichtbar ? 4 : 3;
  }

  connectedCallback() {
    // Der Zeitstrich wandert, auch wenn sich am Geraet nichts aendert.
    clearInterval(this._uhr);
    this._uhr = setInterval(() => {
      if (this._hass && this._el) this._planZeichnen();
      this._verlaufBeiBedarfLaden();
    }, UHR_TAKT_MS);
  }

  // ---------------------------------------------------------------- Zustand

  get _zustand() {
    return this._hass.states[this._config.entity];
  }

  get _min() {
    const wert = this._zustand.attributes.min_temp;
    return Number(wert === undefined ? 5 : wert);
  }

  get _max() {
    const wert = this._zustand.attributes.max_temp;
    return Number(wert === undefined ? 35 : wert);
  }

  get _schritt() {
    return Number(this._zustand.attributes.target_temp_step || 0.5);
  }

  get _ist() {
    const wert = this._zustand.attributes.current_temperature;
    return wert === undefined || wert === null ? null : Number(wert);
  }

  get _soll() {
    if (this._vorschauSoll !== null) return this._vorschauSoll;
    const wert = this._zustand.attributes.temperature;
    return wert === undefined || wert === null ? null : Number(wert);
  }

  get _modi() {
    if (Array.isArray(this._config.hvac_modes) && this._config.hvac_modes.length) {
      return this._config.hvac_modes.map((eintrag) =>
        typeof eintrag === "string" ? { mode: eintrag } : eintrag
      );
    }
    return (this._zustand.attributes.hvac_modes || []).map((mode) => ({ mode }));
  }

  get _planDaten() {
    return this._zustand.attributes.schedule_data || null;
  }

  get _tagesplanSichtbar() {
    return Boolean(this._config && this._config.schedule.show && this._hass && this._zustand && this._planDaten);
  }

  _modusBeschriftung(eintrag) {
    if (eintrag.label !== undefined) return eintrag.label;
    const uebersetzt = this._hass.localize(
      `component.climate.entity_component._.state.${eintrag.mode}`
    );
    return uebersetzt || eintrag.mode;
  }

  _anteil(wert) {
    const spanne = this._max - this._min;
    if (spanne <= 0) return 0;
    return Math.min(1, Math.max(0, (wert - this._min) / spanne));
  }

  _rasten(wert) {
    const schritt = this._schritt;
    return Math.min(this._max, Math.max(this._min, Math.round(wert / schritt) * schritt));
  }

  _einheit() {
    return this._hass.config.unit_system.temperature || "°C";
  }

  _zahlteil(wert) {
    const sprache = (this._hass.locale && this._hass.locale.language) || "en";
    const trenner = sprache.startsWith("de") ? "," : ".";
    return Number(wert).toFixed(1).replace(".", trenner);
  }

  _formatieren(wert) {
    if (wert === null || wert === undefined || isNaN(wert)) return "--";
    return `${this._zahlteil(wert)} ${this._einheit()}`;
  }

  /** Zahl gross, Einheit klein und hochgestellt. */
  _formatierenHtml(wert) {
    if (wert === null || wert === undefined || isNaN(wert)) return "--";
    return `${this._zahlteil(wert)}<span class="einheit">${this._einheit()}</span>`;
  }

  /**
   * Wochentag und Minute in der Zeitzone von Home Assistant. Das Heizprofil
   * laeuft auf dem Geraet nach der Uhr der Zentrale, nicht nach der des Browsers.
   */
  _jetzt() {
    const zeitzone = this._hass.config && this._hass.config.time_zone;
    const optionen = { weekday: "long", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };
    let teile;
    try {
      teile = new Intl.DateTimeFormat("en-US", { ...optionen, timeZone: zeitzone }).formatToParts(new Date());
    } catch (fehler) {
      teile = new Intl.DateTimeFormat("en-US", optionen).formatToParts(new Date());
    }
    const teil = (typ) => (teile.find((t) => t.type === typ) || {}).value;
    return {
      tag: String(teil("weekday")).toUpperCase(),
      minute: Number(teil("hour")) * 60 + Number(teil("minute")) + Number(teil("second")) / 60
    };
  }

  // ----------------------------------------------------------------- Aufbau

  _zeichnen() {
    if (!this._zustand) {
      this.shadowRoot.innerHTML =
        `<ha-card><div style="padding:16px">Entität ${this._config.entity} nicht gefunden.</div></ha-card>`;
      this._aufgebaut = false;
      return;
    }

    if (!this._aufgebaut) {
      this._geruestBauen();
      this._aufgebaut = true;
    }

    this._werteSchreiben();
  }

  _geruestBauen() {
    // Ein offener Bearbeitungsmodus gehoert zum alten Aufbau und muss weg,
    // sonst blockiert sein Zustand das naechste Oeffnen.
    this._editSchliessen();

    const c = this._config;
    const f = c.colors;

    this.shadowRoot.innerHTML = `
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
        .tagesplan { position: relative; height: ${c.height}px; }
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

      <ha-card>
        <div class="head">
          <span class="head-left">
            ${c.lock_entity ? '<button type="button" class="lock" aria-pressed="false"></button>' : ""}
            ${c.icon ? `<ha-icon class="namensymbol" icon="${c.icon}"></ha-icon>` : ""}
            <span class="name"></span>
          </span>
          ${c.show_status ? '<span class="status"><ha-icon></ha-icon><span class="stext"></span></span>' : ""}
        </div>
        <div class="instrument">
          <div class="tagesplan" aria-hidden="true">
            <div class="tp-clip">
              <div class="tp-marken"></div>
              <svg class="tp-kurve"></svg>
            </div>
            <div class="tp-jetzt"></div>
          </div>
          <div class="modes"></div>
        </div>
      </ha-card>
    `;

    this._el = {
      karte: this.shadowRoot.querySelector("ha-card"),
      name: this.shadowRoot.querySelector(".name"),
      lock: this.shadowRoot.querySelector(".lock"),
      status: this.shadowRoot.querySelector(".status"),
      instrument: this.shadowRoot.querySelector(".instrument"),
      plan: this.shadowRoot.querySelector(".tagesplan"),
      modes: this.shadowRoot.querySelector(".modes")
    };

    this._anzeigeLeiste = this._leisteErzeugen(this._config.edge_space, false);
    this._el.instrument.insertBefore(this._anzeigeLeiste.wrap, this._el.modes);

    this._haltenBinden(this._anzeigeLeiste.wrap);
    this._modiBauen();

    if (this._el.lock) {
      this._el.lock.addEventListener("click", () => this._sperreUmschalten());
    }

    if (this._beobachter) this._beobachter.disconnect();
    this._beobachter = new ResizeObserver(() => this._werteSchreiben());
    this._beobachter.observe(this._anzeigeLeiste.wrap);
    this._beobachter.observe(this._el.plan);
  }

  /**
   * Erzeugt eine Leiste. Anzeige und Bearbeitungsmodus nutzen dieselbe
   * Darstellung, nur Bedienbarkeit, Hoehe und Randbereich unterscheiden sich.
   */
  _leisteErzeugen(rand, bedienbar) {
    const wrap = document.createElement("div");
    wrap.className = `trackwrap ${bedienbar ? "bedienbar" : "anzeige"}`;
    wrap.setAttribute("role", "slider");
    wrap.setAttribute("tabindex", "0");
    wrap.innerHTML = `
      <div class="waermeglow"></div>
      <div class="trackclip">
        <div class="fill"></div>
        <div class="demand"></div>
        <div class="haltefortschritt"></div>
      </div>
      <div class="markerline"></div>
      <div class="markerdot"></div>
      ${this._config.show_labels ? '<span class="lbl ist"></span><span class="lbl soll"></span>' : ""}
    `;

    const clip = wrap.querySelector(".trackclip");
    const demand = wrap.querySelector(".demand");
    const glow = wrap.querySelector(".waermeglow");
    const fortschritt = wrap.querySelector(".haltefortschritt");
    const fill = wrap.querySelector(".fill");
    const linie = wrap.querySelector(".markerline");
    const punkt = wrap.querySelector(".markerdot");
    const istLbl = wrap.querySelector(".lbl.ist");
    const sollLbl = wrap.querySelector(".lbl.soll");

    /**
     * bedarf:      Soll liegt ueber Ist. Steuert Flaeche und Schein.
     * geraetHeizt: Das Geraet meldet, dass es heizt. Steuert Kugel und Strich.
     */
    const zeichnen = (ist, soll, bedarf, geraetHeizt) => {
      const breite = clip.offsetWidth;
      const istPx = ist === null ? 0 : this._anteil(ist) * breite;
      const sollPx = soll === null ? 0 : this._anteil(soll) * breite;
      const strichPx = Math.round(sollPx);

      fill.style.width = `${istPx}px`;
      linie.style.left = `${strichPx}px`;
      punkt.style.left = `${strichPx}px`;

      wrap.classList.toggle("heizt", geraetHeizt);

      if (bedarf && sollPx > istPx) {
        demand.style.display = "block";
        demand.style.left = `${istPx}px`;
        demand.style.width = `${sollPx - istPx}px`;
        glow.style.display = "block";
        glow.style.left = `${istPx}px`;
        glow.style.width = `${sollPx - istPx}px`;
      } else {
        demand.style.display = "none";
        glow.style.display = "none";
      }

      wrap.setAttribute("aria-valuemin", String(this._min));
      wrap.setAttribute("aria-valuemax", String(this._max));
      wrap.setAttribute("aria-valuenow", String(soll === null ? this._min : soll));
      wrap.setAttribute("aria-valuetext", this._formatieren(soll));

      if (!istLbl) return;

      istLbl.innerHTML = this._formatierenHtml(ist);
      sollLbl.innerHTML = this._formatierenHtml(soll);

      const istBreite = istLbl.offsetWidth;
      const sollBreite = sollLbl.offsetWidth;

      // Soll steht immer rechts vom Strich, Ist immer links davon.
      let sollLinks = sollPx + GREIFPUNKT_RADIUS_PX + BESCHRIFTUNGSLUECKE_PX;
      const grenze = sollPx - GREIFPUNKT_RADIUS_PX - BESCHRIFTUNGSLUECKE_PX - istBreite;
      let istLinks = Math.min(istPx - BESCHRIFTUNGSLUECKE_PX - istBreite, grenze);

      const maxRechts = breite + rand - 4;
      if (sollLinks + sollBreite > maxRechts) sollLinks = maxRechts - sollBreite;
      if (istLinks < -rand + 4) istLinks = -rand + 4;

      sollLbl.style.left = `${sollLinks}px`;
      istLbl.style.left = `${istLinks}px`;
    };

    const wertAus = (ereignis) => {
      const rechteck = clip.getBoundingClientRect();
      const quote = Math.min(1, Math.max(0, (ereignis.clientX - rechteck.left) / rechteck.width));
      return this._rasten(this._min + quote * (this._max - this._min));
    };

    return { wrap, clip, fortschritt, zeichnen, wertAus };
  }

  _modiBauen() {
    const c = this._config;
    this._el.modes.innerHTML = this._modi
      .map((eintrag) => {
        const text = this._modusBeschriftung(eintrag);
        const symbol = eintrag.icon || MODUS_SYMBOLE[eintrag.mode] || "mdi:help-circle-outline";
        const teile = [];
        if (c.show_icons) teile.push(`<ha-icon icon="${symbol}"></ha-icon>`);
        if (c.show_mode_labels && text) teile.push(`<span>${text}</span>`);
        if (!teile.length) teile.push(`<span>${text || eintrag.mode}</span>`);
        return (
          `<button type="button" data-mode="${eintrag.mode}" aria-pressed="false"` +
          ` aria-label="${text}" title="${text}">${teile.join("")}</button>`
        );
      })
      .join("");

    this._el.modes.addEventListener("click", (ereignis) => {
      const knopf = ereignis.target.closest("button");
      if (!knopf) return;
      this._hass.callService("climate", "set_hvac_mode", {
        entity_id: this._config.entity,
        hvac_mode: knopf.dataset.mode
      });
    });
  }

  // ---------------------------------------------------------------- Zeichnen

  _werteSchreiben() {
    const c = this._config;
    const z = this._zustand;
    const el = this._el;
    if (!el || !z) return;

    el.name.textContent = c.name || z.attributes.friendly_name || c.entity;

    const ist = this._ist;
    const soll = this._soll;

    // Die Flaeche zeigt den Abstand zwischen Ist und Soll, nicht den laufenden
    // Betrieb. hvac_action meldet bei abgeschalteter Heizung "idle", obwohl
    // das Ventil geoeffnet waere, sobald Waerme verfuegbar ist.
    const bedarf = ist !== null && soll !== null && soll > ist + c.tolerance;
    const erreicht = ist !== null && soll !== null && Math.abs(soll - ist) <= c.tolerance;

    // Kugel, Strich und Status folgen dem Geraet. Meldet es kein hvac_action,
    // dient die Differenz als Ersatz.
    const aktion = z.attributes.hvac_action;
    const geraetHeizt = aktion !== undefined ? aktion === "heating" : bedarf;

    this._anzeigeLeiste.zeichnen(ist, soll, bedarf, geraetHeizt);
    if (this._editLeiste) this._editLeiste.zeichnen(ist, soll, bedarf, geraetHeizt);

    if (el.status) {
      const art = geraetHeizt ? "heating" : erreicht ? "reached" : "idle";
      el.status.setAttribute("data-zustand", art);
      el.status.querySelector("ha-icon").setAttribute(
        "icon",
        geraetHeizt ? "mdi:fire" : erreicht ? "mdi:check-circle-outline" : "mdi:thermometer"
      );
      el.status.querySelector(".stext").textContent = this._statustext(art);
    }

    this._modiAktualisieren();
    this._sperreAktualisieren();
    this._planZeichnen();
  }

  _statustext(art) {
    const aktion = this._zustand.attributes.hvac_action;
    if (aktion) {
      const uebersetzt = this._hass.localize(
        `component.climate.entity_component._.state_attributes.hvac_action.state.${aktion}`
      );
      if (uebersetzt) return uebersetzt;
    }
    if (art === "heating") return "Heizt";
    if (art === "reached") return "Erreicht";
    return "Bereit";
  }

  _modiAktualisieren() {
    const aktuell = this._zustand.state;
    this._el.modes.querySelectorAll("button").forEach((knopf) => {
      knopf.setAttribute("aria-pressed", String(knopf.dataset.mode === aktuell));
    });
  }

  _sperreAktualisieren() {
    if (!this._el.lock) return;
    const sperrzustand = this._hass.states[this._config.lock_entity];
    const gesperrt = sperrzustand
      ? sperrzustand.state === "on" || sperrzustand.state === "locked"
      : false;
    this._el.lock.setAttribute("aria-pressed", String(gesperrt));
    this._el.lock.setAttribute(
      "title",
      gesperrt ? "Bedienung am Gerät gesperrt" : "Bedienung am Gerät möglich"
    );
    this._el.lock.innerHTML = `<ha-icon icon="${gesperrt ? "mdi:lock" : "mdi:lock-open-variant"}"></ha-icon>`;
  }

  _sperreUmschalten() {
    const id = this._config.lock_entity;
    const zustand = this._hass.states[id];
    if (!zustand) return;

    if (id.startsWith("lock.")) {
      const gesperrt = zustand.state === "locked";
      this._hass.callService("lock", gesperrt ? "unlock" : "lock", { entity_id: id });
    } else {
      this._hass.callService("homeassistant", "toggle", { entity_id: id });
    }
  }

  // --------------------------------------------------------------- Tagesplan

  _planZeichnen() {
    const plan = this._el && this._el.plan;
    if (!plan || !this._zustand) return;

    const sichtbar = this._tagesplanSichtbar;
    plan.style.display = sichtbar ? "" : "none";
    if (!sichtbar) return;

    const jetzt = this._jetzt();
    const abschnitte = tagesabschnitte(this._planDaten[jetzt.tag]);
    const breite = plan.offsetWidth;
    const hoehe = plan.offsetHeight;
    const prozent = (m) => `${(m / TAGESMINUTEN) * 100}%`;

    plan.querySelector(".tp-marken").innerHTML = ZEITMARKEN_MIN
      .map((m) => `<div class="tp-marke" style="left:${prozent(m)}"></div>`)
      .join("");
    plan.querySelector(".tp-jetzt").style.left = prozent(jetzt.minute);

    const svg = plan.querySelector(".tp-kurve");
    if (!abschnitte.length || !breite || !hoehe) {
      svg.innerHTML = "";
      return;
    }
    svg.innerHTML = this._kurveSvg(abschnitte, jetzt.minute, breite, hoehe);
  }

  /**
   * Hoehe der Kurve: unten der kleinste Planwert der Woche, oben der
   * groesste oder der Sollwert, falls hoeher. Im Modus Aus zaehlt der
   * Sollwert nicht, weil das Geraet dort den Frostschutzwert meldet.
   * Die Farben haengen davon nicht ab, sie folgen der festen Farbskala.
   */
  _hoehenskala(abschnitte) {
    const werte = wochentemperaturen(this._planDaten);
    if (!werte.length) werte.push(...abschnitte.map((a) => a.temp));
    let oben = Math.max(...werte);
    const soll = this._soll;
    if (this._zustand.state !== "off" && soll !== null) oben = Math.max(oben, soll);
    return { unten: Math.min(...werte) - SKALA_LUFT_GRAD, oben: oben + SKALA_LUFT_GRAD };
  }

  _kurveSvg(abschnitte, minute, breite, hoehe) {
    const p = this._config.schedule;
    const innenrand = KURVE_LINIE_PX + 1;
    const skala = this._hoehenskala(abschnitte);
    const spanne = skala.oben - skala.unten;
    const x = (m) => (m / TAGESMINUTEN) * breite;
    // Ohne Begrenzung fuer den Farbverlauf: er haengt an der festen
    // Farbskala und darf deshalb ueber die Flaeche hinausreichen.
    const yUnbegrenzt = (t) => {
      const anteil = spanne <= 0 ? 0.5 : (t - skala.unten) / spanne;
      return hoehe - innenrand - anteil * (hoehe - 2 * innenrand);
    };
    const y = (t) => Math.min(hoehe - innenrand, Math.max(innenrand, yUnbegrenzt(t)));
    const abblassen = (von, bis, deckkraft) =>
      `<rect x="${x(von)}" y="0" width="${Math.max(0, x(bis) - x(von))}" height="${hoehe}"` +
      ` style="fill: var(--card-background-color, #1c1c1c)" opacity="${deckkraft}"/>`;

    const minFarbe = cssFarbe(p.min_color);
    const maxFarbe = cssFarbe(p.max_color);
    const stopps = [];
    for (let k = 0; k <= 8; k++) {
      stopps.push(
        `<stop offset="${k / 8}" style="stop-color: color-mix(in oklab, ${maxFarbe} ${(k / 8) * 100}%, ${minFarbe})"/>`
      );
    }

    const pfad = this._kurvenpfad(abschnitte, x, y);
    const teile = [
      `<defs><linearGradient id="tp-farbskala" gradientUnits="userSpaceOnUse" x1="0"` +
        ` y1="${yUnbegrenzt(p.min_temp)}" x2="0" y2="${yUnbegrenzt(p.max_temp)}">${stopps.join("")}</linearGradient></defs>`,
      `<path d="${pfad} L ${breite} ${hoehe} L 0 ${hoehe} Z" fill="url(#tp-farbskala)" opacity="${KURVE_FLAECHE_DECKKRAFT}"/>`,
      `<path d="${pfad}" fill="none" stroke="url(#tp-farbskala)" stroke-width="${KURVE_LINIE_PX}"` +
        ` stroke-linejoin="round" stroke-linecap="round"/>`
    ];

    if (p.show_history) teile.push(this._verlaufSvg(minute, x, y));

    const abweichung = this._abweichung(abschnitte, minute);
    if (abweichung) teile.push(this._abweichungSvg(abweichung, abschnitte, skala, x, y, breite, abblassen));

    return teile.join("");
  }

  /**
   * Stufen mit Uebergaengen: jeder Schaltpunkt wird zu einer geglaetteten
   * Rampe, mittig um den Schaltpunkt. Kurze Abschnitte begrenzen die Rampe,
   * damit kein Plateau verschwindet.
   */
  _kurvenpfad(abschnitte, x, y) {
    const halb = RAMPE_MIN / 2;
    let d = `M 0 ${y(abschnitte[0].temp)}`;
    for (let i = 0; i + 1 < abschnitte.length; i++) {
      const a = abschnitte[i];
      const b = abschnitte[i + 1];
      const r = Math.min(halb, (a.bis - a.von) / 2, (b.bis - b.von) / 2);
      const x1 = x(a.bis - r);
      const x2 = x(a.bis + r);
      const y1 = y(a.temp);
      const y2 = y(b.temp);
      d += ` L ${x1} ${y1}`;
      if (r > 0) {
        const xm = (x1 + x2) / 2;
        d += ` C ${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`;
      } else {
        d += ` L ${x2} ${y2}`;
      }
    }
    return `${d} L ${x(TAGESMINUTEN)} ${y(abschnitte[abschnitte.length - 1].temp)}`;
  }

  /**
   * Weicht der Sollwert vom Plan ab, gilt die Abweichung im Automatikbetrieb
   * bis zum naechsten Schaltpunkt; Homematic IP kehrt dann ins Profil zurueck.
   * In jedem anderen Modus ruht das Profil, die Abweichung gilt bis Tagesende.
   */
  _abweichung(abschnitte, minute) {
    const modus = this._zustand.state;
    const soll = this._soll;

    if (modus === "off") return { von: minute, bis: TAGESMINUTEN, aus: true, text: this._modusBeschriftung({ mode: "off" }) };
    if (modus !== "auto") {
      if (soll === null) return null;
      return {
        von: minute,
        bis: TAGESMINUTEN,
        aus: false,
        text: `${this._modusBeschriftung({ mode: modus })} ${this._zahlteil(soll)}°`
      };
    }

    const planwert = wertUm(abschnitte, minute);
    if (soll === null || planwert === null || Math.abs(soll - planwert) < ABWEICHUNG_SCHWELLE_GRAD) return null;
    return {
      von: minute,
      bis: naechsterSchaltpunkt(abschnitte, minute),
      aus: false,
      text: `Manuell ${this._zahlteil(soll)}°`
    };
  }

  _abweichungSvg(abweichung, abschnitte, skala, x, y, breite, abblassen) {
    const f = this._config.colors;
    const teile = [abblassen(abweichung.von, abweichung.bis, abweichung.aus ? 0.7 : 0.6)];
    let textHoehe = y(skala.unten);

    if (!abweichung.aus) {
      const ys = y(this._soll);
      const strich = `stroke="${f.target}" stroke-width="${KURVE_LINIE_PX}" stroke-dasharray="5 4" stroke-linecap="round"`;
      const planVorher = wertUm(abschnitte, abweichung.von);
      const planNachher = wertUm(abschnitte, Math.min(abweichung.bis, TAGESMINUTEN - 1));

      // Senkrechte Anschluesse zeigen, wo die Abweichung vom Plan abzweigt
      // und wohin sie zurueckkehrt.
      if (planVorher !== null) {
        teile.push(`<line x1="${x(abweichung.von)}" y1="${y(planVorher)}" x2="${x(abweichung.von)}" y2="${ys}" ${strich}/>`);
      }
      teile.push(`<line x1="${x(abweichung.von)}" y1="${ys}" x2="${x(abweichung.bis)}" y2="${ys}" ${strich}/>`);
      if (abweichung.bis < TAGESMINUTEN && planNachher !== null) {
        teile.push(`<line x1="${x(abweichung.bis)}" y1="${ys}" x2="${x(abweichung.bis)}" y2="${y(planNachher)}" ${strich}/>`);
      }
      textHoehe = ys;
    }

    // Die Beschriftung steht immer, auch wenn die Abweichung kuerzer ist als der Text.
    const textY = textHoehe - 6 < 10 ? textHoehe + 14 : textHoehe - 6;
    const textX = Math.min(x(abweichung.von) + 6, breite - 70);
    const farbe = abweichung.aus ? "var(--secondary-text-color)" : f.target;
    teile.push(`<text x="${textX}" y="${textY}" style="fill: ${farbe}">${abweichung.text}</text>`);
    return teile.join("");
  }

  // ----------------------------------------------------------------- Verlauf

  /**
   * Gemessene Ist-Temperatur von 0 Uhr bis jetzt, gedaempft und gestrichelt,
   * damit die Planlinie fuehrend bleibt. Endet am aktuellen Ist-Wert.
   * Meldet das Geraet hvac_action, ist die Linie dort rot, wo geheizt wurde,
   * und blau, wo nicht; sonst hat sie durchgehend history_color.
   */
  _verlaufSvg(minute, x, y) {
    const tagesbeginn = Date.now() - minute * 60000;
    const punkte = this._verlauf
      .map((p) => ({ m: Math.max(0, (p.zeit - tagesbeginn) / 60000), t: p.t, aktion: p.aktion }))
      .filter((p) => p.m <= minute);
    if (this._ist !== null) {
      punkte.push({ m: minute, t: this._ist, aktion: this._zustand.attributes.hvac_action });
    }
    if (punkte.length < 2) return "";

    const geglaettet = punkte.map((p, i) => {
      const fenster = punkte.slice(Math.max(0, i - 3), i + 4);
      return { ...p, t: fenster.reduce((summe, q) => summe + q.t, 0) / fenster.length };
    });
    geglaettet[geglaettet.length - 1] = punkte[punkte.length - 1];

    const s = this._config.schedule;
    const mitAktion = geglaettet.some((p) => p.aktion !== undefined && p.aktion !== null);
    const farbeVon = (p) => !mitAktion ? s.history_color
      : p.aktion === "heating" ? s.history_heating_color : s.history_idle_color;
    return verlaufsabschnitte(geglaettet, farbeVon)
      .map((abschnitt) => this._verlaufPfad(abschnitt.punkte, abschnitt.farbe, x, y))
      .join("");
  }

  _verlaufPfad(punkte, farbe, x, y) {
    const d = punkte
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.m)} ${y(p.t)}`)
      .join(" ");
    const strich = `color-mix(in oklab, ${cssFarbe(farbe)} ` +
      `${VERLAUF_FARBSTAERKE_PROZENT}%, var(--card-background-color, #1c1c1c))`;
    return `<path d="${d}" fill="none" style="stroke: ${strich}" stroke-width="${VERLAUF_LINIE_PX}"` +
      ` stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  _verlaufBeiBedarfLaden() {
    if (!this._tagesplanSichtbar || !this._config.schedule.show_history) return;
    if (!this._hass.callWS || this._verlaufLaedt) return;
    if (Date.now() - this._verlaufGeladenAm < VERLAUF_ABRUF_MS) return;
    this._verlaufLaden();
  }

  /**
   * Holt die Ist-Temperatur des heutigen Tages aus dem Verlauf von Home
   * Assistant. Nur mit minimal_response: false traegt jeder Eintrag seine
   * Attribute; lu ist der Zeitpunkt in Sekunden.
   */
  async _verlaufLaden() {
    this._verlaufLaedt = true;
    this._verlaufGeladenAm = Date.now();
    const entitaet = this._config.entity;
    try {
      const ende = new Date();
      const beginn = new Date(ende.getTime() - this._jetzt().minute * 60000);
      const antwort = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: beginn.toISOString(),
        end_time: ende.toISOString(),
        entity_ids: [entitaet],
        minimal_response: false,
        no_attributes: false,
        significant_changes_only: false
      });
      if (entitaet !== this._config.entity) return;
      this._verlauf = ((antwort && antwort[entitaet]) || [])
        .map((eintrag) => ({
          zeit: Number(eintrag.lu) * 1000,
          t: Number(eintrag.a && eintrag.a.current_temperature),
          aktion: eintrag.a ? eintrag.a.hvac_action : undefined
        }))
        .filter((p) => Number.isFinite(p.zeit) && Number.isFinite(p.t))
        .sort((a, b) => a.zeit - b.zeit);
    } catch (fehler) {
      // Ohne Verlauf bleibt der Tagesplan vollstaendig; die Linie fehlt nur.
      this._verlauf = [];
    } finally {
      this._verlaufLaedt = false;
      if (this._el) this._planZeichnen();
    }
  }

  // ------------------------------------------------------------------ Gesten

  /**
   * Die Anzeigeleiste reagiert nur auf langes Halten. Jede Bewegung bricht ab,
   * damit senkrechtes Scrollen ueber der Karte nie etwas verstellt.
   */
  _haltenBinden(wrap) {
    wrap.addEventListener("pointerdown", (ereignis) => {
      if (this._editBox) return;
      this._startX = ereignis.clientX;
      this._startY = ereignis.clientY;
      this._haltenAbbrechen();
      this._fortschrittStarten();
      this._haltenTimer = setTimeout(() => {
        this._haltenTimer = null;
        this._fortschrittZuruecksetzen();
        this._editOeffnen();
      }, HALTEDAUER_MS);
    });

    wrap.addEventListener("pointermove", (ereignis) => {
      if (!this._haltenTimer) return;
      if (
        Math.abs(ereignis.clientX - this._startX) > BEWEGUNGSSCHWELLE_PX ||
        Math.abs(ereignis.clientY - this._startY) > BEWEGUNGSSCHWELLE_PX
      ) {
        this._haltenAbbrechen();
      }
    });

    wrap.addEventListener("pointerup", () => this._haltenAbbrechen());
    wrap.addEventListener("pointercancel", () => this._haltenAbbrechen());
    wrap.addEventListener("pointerleave", () => this._haltenAbbrechen());

    wrap.addEventListener("keydown", (ereignis) => {
      if (ereignis.key === "Enter" || ereignis.key === " ") {
        this._editOeffnen();
        ereignis.preventDefault();
      }
    });
  }

  _haltenAbbrechen() {
    if (this._haltenTimer) {
      clearTimeout(this._haltenTimer);
      this._haltenTimer = null;
    }
    this._fortschrittZuruecksetzen();
  }

  /** Macht sichtbar, dass laenger gehalten werden muss. */
  _fortschrittStarten() {
    if (!this._anzeigeLeiste) return;
    const balken = this._anzeigeLeiste.fortschritt;
    balken.style.transition = "none";
    balken.style.width = "0";
    void balken.offsetWidth; // Neuberechnung erzwingen, sonst startet die Animation nicht
    balken.style.transition = `width ${HALTEDAUER_MS}ms linear`;
    balken.style.width = "100%";
    this._anzeigeLeiste.wrap.classList.add("haelt");
  }

  _fortschrittZuruecksetzen() {
    if (!this._anzeigeLeiste) return;
    const balken = this._anzeigeLeiste.fortschritt;
    balken.style.transition = "width 140ms ease";
    balken.style.width = "0";
    this._anzeigeLeiste.wrap.classList.remove("haelt");
  }

  // --------------------------------------------------------- Bearbeitungsmodus

  _editOeffnen() {
    if (this._editBox) return;

    const box = document.createElement("div");
    box.className = "editbox";

    this._editLeiste = this._leisteErzeugen(RAND_BEARBEITEN_PX, true);
    box.appendChild(this._editLeiste.wrap);

    const zeile = document.createElement("div");
    zeile.className = "zeile";
    zeile.innerHTML =
      '<button type="button" data-schritt="-1" aria-label="Weniger">−</button>' +
      '<button type="button" data-schritt="1" aria-label="Mehr">+</button>';
    box.appendChild(zeile);

    const fertig = document.createElement("button");
    fertig.type = "button";
    fertig.className = "fertig";
    fertig.textContent = "Fertig";
    box.appendChild(fertig);

    // Als Ueberlagerung waere der Bearbeitungsmodus hoeher als die Karte und
    // wuerde ueber ihren Rand ragen. Deshalb ersetzt er die Anzeige im Fluss.
    // Der Tagesplan bleibt darueber sichtbar.
    this._anzeigeLeiste.wrap.style.display = "none";
    this._el.modes.style.display = "none";
    this._el.instrument.appendChild(box);
    this._editBox = box;
    if (this._beobachter) this._beobachter.observe(this._editLeiste.wrap);

    let zieht = false;
    const clip = this._editLeiste.clip;

    clip.addEventListener("pointerdown", (ereignis) => {
      clip.setPointerCapture(ereignis.pointerId);
      zieht = true;
      this._vorschauSoll = this._editLeiste.wertAus(ereignis);
      this._werteSchreiben();
    });

    clip.addEventListener("pointermove", (ereignis) => {
      if (!zieht) return;
      this._vorschauSoll = this._editLeiste.wertAus(ereignis);
      this._werteSchreiben();
    });

    const loslassen = () => {
      if (!zieht) return;
      zieht = false;
      if (this._vorschauSoll !== null) this._sollSenden(this._vorschauSoll);
    };
    clip.addEventListener("pointerup", loslassen);
    clip.addEventListener("pointercancel", loslassen);

    box.addEventListener("click", (ereignis) => {
      const knopf = ereignis.target.closest("button");
      if (!knopf) return;
      if (knopf === fertig) {
        this._editSchliessen();
        return;
      }
      const richtung = Number(knopf.dataset.schritt);
      const basis = this._soll === null ? this._min : this._soll;
      this._sollSenden(this._rasten(basis + richtung * this._schritt));
    });

    this._aussenKlick = (ereignis) => {
      if (!ereignis.composedPath().includes(box)) this._editSchliessen();
    };
    setTimeout(() => document.addEventListener("pointerdown", this._aussenKlick, true), 0);

    this._werteSchreiben();
  }

  _editSchliessen() {
    if (!this._editBox) return;
    document.removeEventListener("pointerdown", this._aussenKlick, true);
    if (this._beobachter && this._editLeiste) this._beobachter.unobserve(this._editLeiste.wrap);
    this._editBox.remove();
    this._editBox = null;
    this._editLeiste = null;
    if (this._anzeigeLeiste) this._anzeigeLeiste.wrap.style.display = "";
    if (this._el) this._el.modes.style.display = "";
  }

  _sollSenden(wert) {
    this._vorschauSoll = wert;
    this._werteSchreiben();
    this._hass.callService("climate", "set_temperature", {
      entity_id: this._config.entity,
      temperature: wert
    });

    // Die optimistische Anzeige wird freigegeben, sobald das Geraet geantwortet
    // hat. Batteriegeraete melden verzoegert, deshalb grosszuegig bemessen.
    clearTimeout(this._freigabeTimer);
    this._freigabeTimer = setTimeout(() => {
      this._vorschauSoll = null;
      if (this._hass) this._werteSchreiben();
    }, 5000);
  }

  disconnectedCallback() {
    this._haltenAbbrechen();
    this._editSchliessen();
    clearTimeout(this._freigabeTimer);
    clearInterval(this._uhr);
    if (this._beobachter) {
      this._beobachter.disconnect();
      this._beobachter = null;
    }
  }
}

// ------------------------------------------------------------------- Editor

const EDITOR_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "climate" } } },
  { name: "name", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
  { name: "lock_entity", selector: { entity: { domain: ["switch", "lock", "input_boolean"] } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "height", selector: { number: { min: 28, max: 120, step: 2, mode: "box" } } },
      { name: "edit_height", selector: { number: { min: 28, max: 120, step: 2, mode: "box" } } },
      { name: "edge_space", selector: { number: { min: 0, max: 160, step: 4, mode: "box" } } },
      { name: "tolerance", selector: { number: { min: 0, max: 2, step: 0.1, mode: "box" } } }
    ]
  },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_labels", selector: { boolean: {} } },
      { name: "show_status", selector: { boolean: {} } },
      { name: "show_icons", selector: { boolean: {} } },
      { name: "show_mode_labels", selector: { boolean: {} } }
    ]
  },
  {
    type: "expandable",
    name: "schedule",
    title: "Tagesplan",
    schema: [
      { name: "show", selector: { boolean: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "min_temp", selector: { number: { min: 0, max: 35, step: 0.5, mode: "box", unit_of_measurement: "°C" } } },
          { name: "max_temp", selector: { number: { min: 0, max: 35, step: 0.5, mode: "box", unit_of_measurement: "°C" } } },
          { name: "min_color", selector: { ui_color: {} } },
          { name: "max_color", selector: { ui_color: {} } }
        ]
      },
      { name: "show_history", selector: { boolean: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "history_heating_color", selector: { ui_color: {} } },
          { name: "history_idle_color", selector: { ui_color: {} } }
        ]
      },
      { name: "history_color", selector: { ui_color: {} } }
    ]
  },
  {
    type: "expandable",
    name: "colors",
    title: "Farben",
    schema: Object.keys(STANDARDFARBEN).map((schluessel) => ({
      name: schluessel,
      selector: { text: {} }
    }))
  }
];

const EDITOR_BESCHRIFTUNGEN = {
  entity: "Thermostat",
  name: "Name",
  icon: "Symbol vor dem Namen",
  lock_entity: "Entität der Bedienungssperre",
  height: "Höhe der Anzeigeleiste",
  edit_height: "Höhe im Bearbeitungsmodus",
  edge_space: "Randbereich",
  tolerance: "Toleranz für Erreicht",
  show_labels: "Werte in der Leiste",
  show_status: "Statusanzeige",
  show_icons: "Symbole auf den Knöpfen",
  show_mode_labels: "Text auf den Knöpfen",
  show: "Tagesplan anzeigen",
  min_temp: "Farbskala von",
  max_temp: "Farbskala bis",
  min_color: "Farbe Skalenanfang",
  max_color: "Farbe Skalenende",
  show_history: "Gemessenen Verlauf zeigen",
  history_heating_color: "Verlauf beim Heizen",
  history_idle_color: "Verlauf ohne Heizen",
  history_color: "Verlauf ohne Heizmeldung"
};

// Was der Editor anzeigt, wenn ein Schluessel nicht im YAML steht. Ohne diese
// Vorgaben zeigte er Schalter als aus und Zahlenfelder leer, obwohl die Karte
// die Werte nutzt.
const EDITOR_VORGABEN = { ...KARTEN_VORGABEN, schedule: TAGESPLAN_VORGABEN };
delete EDITOR_VORGABEN.name;
delete EDITOR_VORGABEN.lock_entity;
delete EDITOR_VORGABEN.hvac_modes;

/** Ergaenzt fehlende Schluessel um ihre Vorgabe, damit der Editor sie zeigt. */
function mitVorgaben(config) {
  return {
    ...EDITOR_VORGABEN,
    ...config,
    schedule: { ...TAGESPLAN_VORGABEN, ...(config.schedule || {}) }
  };
}

/** Entfernt Werte, die ihrer Vorgabe entsprechen, damit das YAML schlank bleibt. */
function ohneVorgaben(config) {
  const ergebnis = { ...config };
  Object.keys(EDITOR_VORGABEN).forEach((schluessel) => {
    if (schluessel !== "schedule" && ergebnis[schluessel] === EDITOR_VORGABEN[schluessel]) {
      delete ergebnis[schluessel];
    }
  });
  const plan = { ...(config.schedule || {}) };
  Object.keys(TAGESPLAN_VORGABEN).forEach((schluessel) => {
    if (plan[schluessel] === TAGESPLAN_VORGABEN[schluessel] || plan[schluessel] === undefined) {
      delete plan[schluessel];
    }
  });
  if (Object.keys(plan).length) ergebnis.schedule = plan;
  else delete ergebnis.schedule;
  return ergebnis;
}

class ThermostatBarCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._zeichnen();
  }

  set hass(hass) {
    this._hass = hass;
    this._zeichnen();
  }

  _zeichnen() {
    if (!this._hass || !this._config) return;

    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (eintrag) =>
        EDITOR_BESCHRIFTUNGEN[eintrag.name] || eintrag.title || eintrag.name;
      this._form.addEventListener("value-changed", (ereignis) => {
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: ohneVorgaben(ereignis.detail.value) },
            bubbles: true,
            composed: true
          })
        );
      });
      this.appendChild(this._form);
    }

    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = mitVorgaben(this._config);
  }
}

customElements.define("thermostat-bar-card", ThermostatBarCard);
customElements.define("thermostat-bar-card-editor", ThermostatBarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermostat-bar-card",
  name: "Thermostat Bar Card",
  description:
    "Waagerechte Thermostat-Karte mit Ist-Füllung, Heizanforderung, Tagesplan und Bearbeitungsmodus.",
  preview: true,
  documentationURL: "https://github.com/SvMo85/ha-thermostat-bar-card"
});
