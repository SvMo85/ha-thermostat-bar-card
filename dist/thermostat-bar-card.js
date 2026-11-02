// Thermostat Bar Card 0.3.1
// Gebaut aus src/ mit npm run build. Nicht von Hand bearbeiten.

// src/konstanten.js
var CARD_VERSION = "0.3.1";
var IST_FARBE = "var(--primary-color, #009ac7)";
var WAERME_FARBE = "var(--red-color, #f44336)";
var STANDARDFARBEN = {
  track: "var(--divider-color, #262c32)",
  current: IST_FARBE,
  demand: null,
  // wird aus current und demand_glow abgeleitet, siehe heizflaecheVerlauf
  demand_glow: WAERME_FARBE,
  target: "#e8a33d",
  target_heating: null,
  // wird aus demand_glow abgeleitet
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
var TAGESPLAN_VORGABEN = {
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
var KARTEN_VORGABEN = {
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
var MODUS_SYMBOLE = {
  auto: "mdi:calendar-sync",
  heat: "mdi:fire",
  cool: "mdi:snowflake",
  heat_cool: "mdi:autorenew",
  dry: "mdi:water-percent",
  fan_only: "mdi:fan",
  off: "mdi:power"
};
var HALTEDAUER_MS = 600;
var BEWEGUNGSSCHWELLE_PX = 6;
var BESCHRIFTUNGSLUECKE_PX = 10;
var GREIFPUNKT_RADIUS_PX = 9;
var RAND_BEARBEITEN_PX = 52;
var KANTENUEBERGANG_PX = 4;
var TAGESMINUTEN = 1440;
var ZEITMARKEN_MIN = [240, 480, 720, 960, 1200];
var RAMPE_MIN = 40;
var SKALA_LUFT_GRAD = 0.5;
var KURVE_LINIE_PX = 2.5;
var KURVE_FLAECHE_DECKKRAFT = 0.3;
var VERLAUF_LINIE_PX = 1.5;
var VERLAUF_FARBSTAERKE_PROZENT = 60;
var VERLAUF_ABRUF_MS = 5 * 60 * 1e3;
var UHR_TAKT_MS = 60 * 1e3;
var ABWEICHUNG_SCHWELLE_GRAD = 0.05;

// src/editor.js
var EDITOR_SCHEMA = [
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
var EDITOR_BESCHRIFTUNGEN = {
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
var EDITOR_VORGABEN = { ...KARTEN_VORGABEN, schedule: TAGESPLAN_VORGABEN };
delete EDITOR_VORGABEN.name;
delete EDITOR_VORGABEN.lock_entity;
delete EDITOR_VORGABEN.hvac_modes;
function mitVorgaben(config) {
  return {
    ...EDITOR_VORGABEN,
    ...config,
    schedule: { ...TAGESPLAN_VORGABEN, ...config.schedule || {} }
  };
}
function ohneVorgaben(config) {
  const ergebnis = { ...config };
  Object.keys(EDITOR_VORGABEN).forEach((schluessel) => {
    if (schluessel !== "schedule" && ergebnis[schluessel] === EDITOR_VORGABEN[schluessel]) {
      delete ergebnis[schluessel];
    }
  });
  const plan = { ...config.schedule || {} };
  Object.keys(TAGESPLAN_VORGABEN).forEach((schluessel) => {
    if (plan[schluessel] === TAGESPLAN_VORGABEN[schluessel] || plan[schluessel] === void 0) {
      delete plan[schluessel];
    }
  });
  if (Object.keys(plan).length) ergebnis.schedule = plan;
  else delete ergebnis.schedule;
  return ergebnis;
}
var ThermostatBarCardEditor = class extends HTMLElement {
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
      this._form.computeLabel = (eintrag) => EDITOR_BESCHRIFTUNGEN[eintrag.name] || eintrag.title || eintrag.name;
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
};

// src/farben.js
function cssFarbe(wert) {
  if (typeof wert !== "string") return wert;
  if (/^[a-z]+(-[a-z]+)*$/.test(wert)) return `var(--${wert}-color, ${wert})`;
  return wert;
}
var dunkler = (farbe, anteil) => `color-mix(in oklab, ${farbe} ${anteil}%, #000)`;
function heizflaecheVerlauf(istFarbe, waermeFarbe) {
  return `linear-gradient(90deg in oklab, ${istFarbe} 0px, ${dunkler(waermeFarbe, 45)} ${KANTENUEBERGANG_PX}px, ${dunkler(waermeFarbe, 62)} 40%, ${dunkler(waermeFarbe, 85)} 78%, ${waermeFarbe} 100%)`;
}

// src/heizprofil/plan.js
var WOCHENTAGE = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
var WERKTAGE = WOCHENTAGE.slice(0, 5);
var WOCHENENDE = WOCHENTAGE.slice(5);
var PROFIL_RASTER_MIN = 5;
var PROFIL_MAX_SCHALTPUNKTE = 13;
var PROFIL_NEU_DAUER_MIN = 60;
var PROFIL_MELDUNG_MS = 2500;
var kopie = (wert) => JSON.parse(JSON.stringify(wert));
var minutenAus = (text) => {
  const [h, m] = String(text).split(":").map(Number);
  return h * 60 + m;
};
var uhrzeitAus = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
function zeitraumAbschnitte(tag) {
  const liste = [];
  let position = 0;
  (tag.periods || []).map((p, index) => ({ von: minutenAus(p.starttime), bis: minutenAus(p.endtime), temp: Number(p.temperature), index })).sort((a, b) => a.von - b.von).forEach((p) => {
    if (p.von > position) liste.push({ von: position, bis: p.von, temp: Number(tag.base_temperature), index: null });
    liste.push(p);
    position = p.bis;
  });
  if (position < TAGESMINUTEN) {
    liste.push({ von: position, bis: TAGESMINUTEN, temp: Number(tag.base_temperature), index: null });
  }
  return liste;
}
var schaltpunkteVon = (tag) => zeitraumAbschnitte(tag).length;
function temperaturGeschaltet(temperatur, richtung, { min, max, schritt }) {
  const roh = Math.round((Number(temperatur) + richtung * schritt) / schritt) * schritt;
  return Math.min(max, Math.max(min, roh));
}
function nachbargrenzen(tag, index) {
  const p = tag.periods[index];
  const andere = tag.periods.filter((_, i) => i !== index);
  return {
    frueheste: Math.max(0, ...andere.map((q) => minutenAus(q.endtime)).filter((m) => m <= minutenAus(p.starttime))),
    spaeteste: Math.min(TAGESMINUTEN, ...andere.map((q) => minutenAus(q.starttime)).filter((m) => m >= minutenAus(p.endtime)))
  };
}
function zeitGesetzt(tag, index, kante, minute) {
  const p = tag.periods[index];
  const { frueheste, spaeteste } = nachbargrenzen(tag, index);
  const von = minutenAus(p.starttime);
  const bis = minutenAus(p.endtime);
  const gerundet = Math.round(minute / PROFIL_RASTER_MIN) * PROFIL_RASTER_MIN;
  if (kante === "von") {
    return { starttime: uhrzeitAus(Math.min(bis - PROFIL_RASTER_MIN, Math.max(frueheste, gerundet))), endtime: p.endtime };
  }
  return { starttime: p.starttime, endtime: uhrzeitAus(Math.max(von + PROFIL_RASTER_MIN, Math.min(spaeteste, gerundet))) };
}
function neuerZeitraum(tag, maxTemp) {
  const temperatur = Math.min(maxTemp, Number(tag.base_temperature) + 1);
  return zeitraumAbschnitte(tag).filter((a) => a.index === null && a.bis - a.von >= PROFIL_RASTER_MIN).reverse().map((l) => ({
    starttime: uhrzeitAus(l.von),
    endtime: uhrzeitAus(l.von + Math.min(PROFIL_NEU_DAUER_MIN, l.bis - l.von)),
    temperature: temperatur
  })).find((p) => schaltpunkteVon({ ...tag, periods: [...tag.periods, p] }) <= PROFIL_MAX_SCHALTPUNKTE) || null;
}

// src/heizprofil/stil.js
function blattStil(f) {
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
        .wochentag .tag { height: 34px; border-radius: 7px; }
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

        @media (hover: hover) {
          .rundknopf:hover, .zeit button:hover { background: var(--spur); }
          .chips button:hover, .stepper button:hover, .fuss button:hover:not(:disabled) { filter: brightness(1.15); }
        }
        button:focus-visible { outline: 2px solid ${f.target}; outline-offset: 2px; }
      </style>
  `;
}

// src/heizprofil/blatt.js
var htmlSicher = (text) => String(text).replace(/[&<>"]/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[z]);
var ThermostatHeizprofilBlatt = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  oeffnen({ hass, entity, name, heute, farbskala, farben }) {
    this._hass = hass;
    this._entity = entity;
    this._name = name;
    this._heute = heute;
    this._farbskala = farbskala;
    this._farben = farben;
    const a = this._zustand.attributes;
    const aktiv = a.current_schedule_profile || "P1";
    this._profile = [...a.available_profiles && a.available_profiles.length ? a.available_profiles : [aktiv]].sort();
    this._aktivesProfil = aktiv;
    this._z = {
      ansicht: "tag",
      profil: aktiv,
      tag: heute,
      gewaehlt: null,
      kopierziele: /* @__PURE__ */ new Set(),
      wochen: { [aktiv]: a.schedule_data ? kopie(a.schedule_data) : null },
      geaendert: Object.fromEntries(this._profile.map((p) => [p, /* @__PURE__ */ new Set()])),
      laedt: /* @__PURE__ */ new Set(),
      fehler: {},
      speichert: false,
      meldung: ""
    };
    this._aufbauen();
    document.body.appendChild(this);
    this._zeichnen();
    if (!this._z.wochen[aktiv]) this._profilLaden(aktiv);
  }
  set hass(hass) {
    this._hass = hass;
  }
  schliessen() {
    clearTimeout(this._meldungTimer);
    document.removeEventListener("keydown", this._tasteGedrueckt);
    this.remove();
  }
  get _zustand() {
    return this._hass.states[this._entity];
  }
  // ------------------------------------------------------------ Daten
  get _woche() {
    return this._z.wochen[this._z.profil];
  }
  _planVon(tagName) {
    return this._woche && this._woche[tagName];
  }
  get _geaenderteTage() {
    return this._z.geaendert[this._z.profil];
  }
  get _anzahlGeaendert() {
    return this._profile.reduce((summe, p) => summe + this._z.geaendert[p].size, 0);
  }
  get _grenzen() {
    const a = this._zustand.attributes;
    return {
      min: Number(a.min_temp === void 0 ? 5 : a.min_temp),
      max: Number(a.max_temp === void 0 ? 30.5 : a.max_temp),
      schritt: Number(a.target_temp_step || 0.5)
    };
  }
  async _geraetId() {
    if (this._geraet) return this._geraet;
    const eintrag = this._hass.entities && this._hass.entities[this._entity];
    if (eintrag && eintrag.device_id) {
      this._geraet = eintrag.device_id;
    } else {
      const register = await this._hass.callWS({ type: "config/entity_registry/get", entity_id: this._entity });
      this._geraet = register.device_id;
    }
    return this._geraet;
  }
  async _dienst(dienst, daten, mitAntwort) {
    const deviceId = await this._geraetId();
    const ergebnis = await this._hass.callWS({
      type: "call_service",
      domain: "homematicip_local",
      service: dienst,
      service_data: { device_id: deviceId, ...daten },
      return_response: mitAntwort
    });
    return ergebnis && ergebnis.response;
  }
  /** schedule_data enthaelt nur das aktive Profil; die anderen kommen vom Geraet. */
  async _profilLaden(profil) {
    if (this._z.laedt.has(profil)) return;
    this._z.laedt.add(profil);
    delete this._z.fehler[profil];
    this._zeichnen();
    try {
      const antwort = await this._dienst("get_schedule_profile", { profile: profil }, true);
      if (!antwort || !antwort.MONDAY) throw new Error("Antwort ohne Wochenplan");
      this._z.wochen[profil] = kopie(antwort);
    } catch (fehler) {
      this._z.fehler[profil] = fehler && fehler.message || String(fehler);
    } finally {
      this._z.laedt.delete(profil);
      if (this.isConnected) this._zeichnen();
    }
  }
  /** Schreibt je geaendertem Tag; bricht beim ersten Fehler ab und behaelt den Rest. */
  async _speichern() {
    this._z.speichert = true;
    this._zeichnen();
    let gespeichert = 0;
    try {
      for (const profil of this._profile) {
        for (const tagName of WOCHENTAGE.filter((t) => this._z.geaendert[profil].has(t))) {
          const tag = this._z.wochen[profil][tagName];
          await this._dienst("set_schedule_weekday", {
            profile: profil,
            weekday: tagName,
            base_temperature: Number(tag.base_temperature),
            simple_weekday_list: [...tag.periods].sort((a, b) => minutenAus(a.starttime) - minutenAus(b.starttime))
          }, false);
          this._z.geaendert[profil].delete(tagName);
          gespeichert += 1;
        }
      }
      this._melden(`${gespeichert} ${gespeichert === 1 ? "Tag" : "Tage"} gespeichert.`);
    } catch (fehler) {
      this._melden(`Speichern fehlgeschlagen: ${fehler && fehler.message || fehler}`, true);
    } finally {
      this._z.speichert = false;
      if (this.isConnected) this._zeichnen();
    }
  }
  // ------------------------------------------------------- Aenderungen
  _temperaturAendern(index, richtung) {
    const tag = this._planVon(this._z.tag);
    if (index === "basis") tag.base_temperature = temperaturGeschaltet(tag.base_temperature, richtung, this._grenzen);
    else tag.periods[index].temperature = temperaturGeschaltet(tag.periods[index].temperature, richtung, this._grenzen);
    this._geaenderteTage.add(this._z.tag);
  }
  _zeitSetzen(index, kante, minute) {
    const tag = this._planVon(this._z.tag);
    Object.assign(tag.periods[index], zeitGesetzt(tag, index, kante, minute));
    this._geaenderteTage.add(this._z.tag);
  }
  _neuerZeitraum(tag) {
    return neuerZeitraum(tag, this._grenzen.max);
  }
  _kopierenAusfuehren() {
    const quelle = this._planVon(this._z.tag);
    this._z.kopierziele.forEach((t) => {
      this._woche[t] = kopie(quelle);
      this._geaenderteTage.add(t);
    });
    const ziele = WOCHENTAGE.filter((t) => this._z.kopierziele.has(t)).map((t) => this._tagKurz(t)).join(", ");
    this._melden(`${this._tagLang(this._z.tag)} auf ${ziele} kopiert. Noch nicht gespeichert.`);
    this._z.kopierziele = /* @__PURE__ */ new Set();
    this._z.ansicht = "tag";
  }
  _schliessenAnfragen() {
    if (this._anzahlGeaendert && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    this.schliessen();
  }
  _melden(text, bleibt) {
    this._z.meldung = text;
    clearTimeout(this._meldungTimer);
    if (bleibt) return;
    this._meldungTimer = setTimeout(() => {
      this._z.meldung = "";
      if (this.isConnected) this._zeichnen();
    }, PROFIL_MELDUNG_MS);
  }
  // ------------------------------------------------------- Darstellung
  get _sprache() {
    return this._hass.locale && this._hass.locale.language || "de";
  }
  // 2024-01-01 war ein Montag.
  _tagName(tagName, art) {
    const datum = new Date(Date.UTC(2024, 0, 1 + WOCHENTAGE.indexOf(tagName), 12));
    return new Intl.DateTimeFormat(this._sprache, { weekday: art, timeZone: "UTC" }).format(datum);
  }
  _tagKurz(tagName) {
    return this._tagName(tagName, "short").replace(".", "");
  }
  _tagLang(tagName) {
    return this._tagName(tagName, "long");
  }
  _grad(t) {
    const trenner = this._sprache.startsWith("de") ? "," : ".";
    return `${Number(t).toFixed(1).replace(".", trenner)}°`;
  }
  _dauer(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
  }
  /** Dieselbe feste Farbskala wie der Tagesplan der Karte. */
  _farbe(t) {
    const s = this._farbskala;
    const spanne = Number(s.max_temp) - Number(s.min_temp);
    const anteil = spanne > 0 ? Math.min(1, Math.max(0, (t - Number(s.min_temp)) / spanne)) : 0;
    return `color-mix(in oklab, ${cssFarbe(s.max_color)} ${Math.round(anteil * 100)}%, ${cssFarbe(s.min_color)})`;
  }
  _skala() {
    const werte = WOCHENTAGE.map((t) => this._planVon(t)).filter(Boolean).flatMap((t) => [Number(t.base_temperature), ...t.periods.map((p) => Number(p.temperature))]);
    if (!werte.length) return { unten: 15, oben: 25 };
    return { unten: Math.min(...werte) - 1, oben: Math.max(...werte) + 1 };
  }
  /** Tageskurve als Stufen; viewBox 1440 mal 100, gedehnt auf die Breite. */
  _kurveSvg(tagName, mitAuswahl) {
    const { unten, oben } = this._skala();
    const y = (t) => 100 - (t - unten) / (oben - unten) * 100;
    const teile = zeitraumAbschnitte(this._planVon(tagName));
    const strich = 'vector-effect="non-scaling-stroke"';
    const marken = [360, 720, 1080].map((m) => `<line x1="${m}" y1="0" x2="${m}" y2="100" stroke="var(--divider-color)" stroke-width="1" ${strich}/>`).join("");
    const flaechen = teile.map((a) => {
      const gewaehlt = mitAuswahl && a.index !== null && this._z.gewaehlt === a.index;
      return `<rect x="${a.von}" y="${y(a.temp)}" width="${a.bis - a.von}" height="${100 - y(a.temp)}"
        style="fill: ${this._farbe(a.temp)}" fill-opacity="${gewaehlt ? 0.6 : 0.28}"/>`;
    }).join("");
    const linie = teile.map((a, i) => {
      const naechster = teile[i + 1];
      const stufe = naechster ? `<line x1="${a.bis}" y1="${y(a.temp)}" x2="${a.bis}" y2="${y(naechster.temp)}"
        stroke="var(--secondary-text-color)" stroke-opacity="0.5" stroke-width="1" ${strich}/>` : "";
      return `<line x1="${a.von}" y1="${y(a.temp)}" x2="${a.bis}" y2="${y(a.temp)}"
        style="stroke: ${this._farbe(a.temp)}" stroke-width="2.5" ${strich}/>${stufe}`;
    }).join("");
    return `<svg viewBox="0 0 1440 100" preserveAspectRatio="none">${marken}${flaechen}${linie}</svg>`;
  }
  _werteHtml(tagName) {
    const { unten, oben } = this._skala();
    return zeitraumAbschnitte(this._planVon(tagName)).filter((a) => a.bis - a.von >= 90).map((a) => `<span class="wert" style="left: ${(a.von + a.bis) / 2 / TAGESMINUTEN * 100}%;
        top: ${100 - (a.temp - unten) / (oben - unten) * 100}%">${this._grad(a.temp)}</span>`).join("");
  }
  _tagHtml(tagName, hoehe, gross) {
    return `<div class="tag" style="height: ${hoehe}px">${this._kurveSvg(tagName, gross)}${gross ? this._werteHtml(tagName) : ""}</div>`;
  }
  get _zeitachse() {
    return '<div class="zeitachse"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>';
  }
  get _zeitachseEingerueckt() {
    return `<div class="eingerueckt"><span></span>${this._zeitachse}<span></span></div>`;
  }
  _profileHtml() {
    if (this._profile.length < 2) return "";
    return `<div class="chips">${this._profile.map((p) => `<button type="button" data-profil="${p}"
      class="${p === this._aktivesProfil ? "aktiv" : ""} ${this._z.geaendert[p].size ? "geaendert" : ""}"
      aria-pressed="${p === this._z.profil}">${p}</button>`).join("")}</div>`;
  }
  _tageHtml() {
    return `<div class="chips">${WOCHENTAGE.map((t) => `<button type="button" data-wahltag="${t}"
      class="${t === this._heute ? "aktiv" : ""} ${this._geaenderteTage.has(t) ? "geaendert" : ""}"
      aria-pressed="${t === this._z.tag}">${this._tagKurz(t)}</button>`).join("")}</div>`;
  }
  _stepperHtml(index, temp) {
    return `<div class="stepper">
      <button type="button" data-schritt="-1" data-index="${index}" aria-label="kälter"><ha-icon icon="mdi:minus"></ha-icon></button>
      <span class="temp">${this._grad(temp)}</span>
      <button type="button" data-schritt="1" data-index="${index}" aria-label="wärmer"><ha-icon icon="mdi:plus"></ha-icon></button>
    </div>`;
  }
  _zeitraeumeHtml() {
    const tag = this._planVon(this._z.tag);
    const belegt = schaltpunkteVon(tag);
    const neu = this._neuerZeitraum(tag);
    const zeilen = zeitraumAbschnitte(tag).filter((a) => a.index !== null).map((a) => {
      const offen = this._z.gewaehlt === a.index;
      return `<div class="zeitraum ${offen ? "gewaehlt" : ""}" style="--farbe: ${this._farbe(a.temp)}" data-zeile="${a.index}">
        <div>
          <div class="zeit"><button type="button" data-zeitwahl="von" data-index="${a.index}">${uhrzeitAus(a.von)}</button>–<button
            type="button" data-zeitwahl="bis" data-index="${a.index}">${uhrzeitAus(a.bis)}</button></div>
          <div class="unter">${this._dauer(a.bis - a.von)}</div>
        </div>
        ${this._stepperHtml(a.index, a.temp)}
        ${offen ? `<div class="aufgeklappt">
          <button type="button" class="loeschen" data-aktion="loeschen" data-index="${a.index}">
            <ha-icon icon="mdi:delete-outline"></ha-icon> Zeitraum löschen</button>
          <button type="button" class="zuklappen" data-aktion="zuklappen">Fertig</button>
        </div>` : ""}
      </div>`;
    }).join("");
    return `
      <div class="titel"><span>Zeiträume</span>
        <span class="zaehler ${belegt >= PROFIL_MAX_SCHALTPUNKTE ? "voll" : ""}">${belegt} von ${PROFIL_MAX_SCHALTPUNKTE} Schaltpunkten</span></div>
      ${zeilen || '<p class="hinweis">Keine Zeiträume, den ganzen Tag gilt die Grundtemperatur.</p>'}
      <button type="button" class="hinzu" data-aktion="hinzufuegen" ${neu ? "" : "disabled"}>${neu ? '<ha-icon icon="mdi:plus"></ha-icon> Zeitraum hinzufügen' : belegt >= PROFIL_MAX_SCHALTPUNKTE ? "Alle 13 Schaltpunkte belegt" : "Kein Platz für einen weiteren Zeitraum"}</button>
      <div class="titel"><span>Übrige Zeit</span></div>
      <div class="zeitraum" style="--farbe: ${this._farbe(Number(tag.base_temperature))}">
        <div><div class="zeit ohne-knopf">Grundtemperatur</div></div>
        ${this._stepperHtml("basis", tag.base_temperature)}
      </div>`;
  }
  /** Lade- oder Fehlerzustand eines Profils, sonst null. */
  _profilZustandHtml() {
    const p = this._z.profil;
    if (this._z.laedt.has(p)) return `<p class="hinweis">Profil ${p} wird vom Gerät geladen …</p>`;
    if (this._z.fehler[p]) {
      return `<p class="hinweis fehler">Profil ${p} konnte nicht geladen werden: ${htmlSicher(this._z.fehler[p])}</p>
        <button type="button" class="hinzu" data-aktion="neu-laden">Erneut laden</button>`;
    }
    if (!this._woche) return `<p class="hinweis">Kein Plan vorhanden.</p>`;
    return null;
  }
  get _speichernHtml() {
    const anzahl = this._anzahlGeaendert;
    const text = this._z.speichert ? "Speichert …" : `Speichern${anzahl ? ` (${anzahl})` : ""}`;
    return `<button type="button" class="haupt" data-aktion="speichern" ${anzahl && !this._z.speichert ? "" : "disabled"}>${text}</button>`;
  }
  _tagAnsicht() {
    const zustand = this._profilZustandHtml();
    return {
      titel: `Heizprofil ${htmlSicher(this._name)}`,
      rechts: zustand ? "" : `<button type="button" class="rundknopf" data-aktion="woche" aria-label="Woche">
        <ha-icon icon="mdi:calendar-week"></ha-icon></button>`,
      inhalt: `${this._profileHtml()}${zustand || `${this._tageHtml()}${this._tagHtml(this._z.tag, 120, true)}${this._zeitachse}${this._zeitraeumeHtml()}`}`,
      fuss: `<button type="button" data-aktion="kopieren" ${zustand ? "disabled" : ""}>Auf Tage kopieren</button>${this._speichernHtml}`
    };
  }
  _wochenAnsicht() {
    return {
      titel: `Woche ${this._z.profil}`,
      zurueck: true,
      inhalt: `${this._profileHtml()}${this._profilZustandHtml() || `<div class="woche">${WOCHENTAGE.map((t) => `
        <button type="button" class="wochentag ${t === this._heute ? "heute" : ""} ${t === this._z.tag ? "aktuell" : ""}
          ${this._geaenderteTage.has(t) ? "geaendert" : ""}" data-oeffne="${t}">
          <span class="name">${this._tagKurz(t)}</span>${this._tagHtml(t, 34, false)}<ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>`).join("")}</div>${this._zeitachseEingerueckt}`}`,
      fuss: this._speichernHtml
    };
  }
  _kopierAnsicht() {
    const ziele = this._z.kopierziele;
    const auswahl = (tage, text) => `<button type="button" data-auswahl="${tage.join(",")}">${text}</button>`;
    return {
      titel: `${this._tagLang(this._z.tag)} kopieren`,
      zurueck: true,
      inhalt: `
        <div class="titel"><span>Quelle</span></div>
        ${this._tagHtml(this._z.tag, 60, false)}
        <div class="titel"><span>Auf diese Tage</span></div>
        <div class="schnellwahl">
          ${auswahl(WERKTAGE, `${this._tagKurz("MONDAY")} bis ${this._tagKurz("FRIDAY")}`)}
          ${auswahl(WOCHENENDE, `${this._tagKurz("SATURDAY")} und ${this._tagKurz("SUNDAY")}`)}
          ${auswahl(WOCHENTAGE, "Alle")}
        </div>
        <div class="woche">${WOCHENTAGE.map((t) => {
        const quelle = t === this._z.tag;
        const an = ziele.has(t);
        const symbol = quelle ? "mdi:content-copy" : an ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline";
        return `<button type="button" class="wochentag ${quelle ? "quelle" : ""}" data-ziel="${t}" ${quelle ? "disabled" : ""}
            role="checkbox" aria-checked="${an}">
            <span class="name">${this._tagKurz(t)}</span>${this._tagHtml(t, 34, false)}
            <ha-icon icon="${symbol}" class="${an ? "an" : ""}"></ha-icon>
          </button>`;
      }).join("")}</div>${this._zeitachseEingerueckt}
        <p class="hinweis">Der Plan der gewählten Tage wird ersetzt, auch die Grundtemperatur.</p>`,
      fuss: `<button type="button" data-aktion="zurueck">Abbrechen</button>
        <button type="button" class="haupt" data-aktion="kopieren-ausfuehren" ${ziele.size ? "" : "disabled"}>
          ${ziele.size ? `Auf ${ziele.size} ${ziele.size === 1 ? "Tag" : "Tage"} kopieren` : "Tage wählen"}</button>`
    };
  }
  _zeichnen() {
    const teile = { tag: () => this._tagAnsicht(), woche: () => this._wochenAnsicht(), kopieren: () => this._kopierAnsicht() }[this._z.ansicht]();
    const alt = this._blatt.querySelector(".inhalt");
    const scroll = alt && alt.dataset.ansicht === this._z.ansicht ? alt.scrollTop : 0;
    this._blatt.innerHTML = `
      <div class="griff"></div>
      <div class="kopf ${teile.zurueck ? "mit-zurueck" : ""}">
        ${teile.zurueck ? `<button type="button" class="rundknopf" data-aktion="zurueck" aria-label="Zurück">
          <ha-icon icon="mdi:arrow-left"></ha-icon></button>` : ""}
        <h1>${teile.titel}</h1>
        ${teile.rechts || ""}
        <button type="button" class="rundknopf" data-aktion="schliessen" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="inhalt" data-ansicht="${this._z.ansicht}">${teile.inhalt}</div>
      <div class="fuss">${teile.fuss}</div>
      <div class="meldung" ${this._z.meldung ? "" : "hidden"}>${htmlSicher(this._z.meldung)}</div>`;
    this._blatt.querySelector(".inhalt").scrollTop = scroll;
  }
  // ------------------------------------------------------------ Aufbau
  _aufbauen() {
    const f = this._farben;
    this.shadowRoot.innerHTML = `
      ${blattStil(f)}
      <div class="abdunkeln"></div>
      <div class="blatt" role="dialog" aria-modal="true"></div>`;
    this._blatt = this.shadowRoot.querySelector(".blatt");
    this.shadowRoot.querySelector(".abdunkeln").addEventListener("click", () => this._schliessenAnfragen());
    this._blatt.addEventListener("click", (ereignis) => this._klick(ereignis));
    this._zeitfeld = document.createElement("input");
    this._zeitfeld.type = "time";
    this._zeitfeld.step = String(PROFIL_RASTER_MIN * 60);
    this._zeitfeld.style.cssText = "position: fixed; opacity: 0; pointer-events: none; width: 1px; height: 1px;";
    this.shadowRoot.appendChild(this._zeitfeld);
    this._zeitfeld.addEventListener("change", () => {
      if (!this._zeitwahl || !this._zeitfeld.value) return;
      let minute = minutenAus(this._zeitfeld.value);
      if (this._zeitwahl.kante === "bis" && minute === 0) minute = TAGESMINUTEN;
      this._zeitSetzen(this._zeitwahl.index, this._zeitwahl.kante, minute);
      this._zeichnen();
    });
    this._tasteGedrueckt = (ereignis) => {
      if (ereignis.key === "Escape") this._schliessenAnfragen();
    };
    document.addEventListener("keydown", this._tasteGedrueckt);
  }
  _zeitwahlOeffnen(knopf) {
    const rahmen = knopf.getBoundingClientRect();
    this._zeitwahl = { index: Number(knopf.dataset.index), kante: knopf.dataset.zeitwahl };
    this._zeitfeld.style.left = `${rahmen.left}px`;
    this._zeitfeld.style.top = `${rahmen.bottom}px`;
    const text = knopf.textContent.trim();
    this._zeitfeld.value = text === "24:00" ? "00:00" : text;
    try {
      this._zeitfeld.showPicker();
    } catch (fehler) {
      this._zeitfeld.focus();
    }
  }
  _klick(ereignis) {
    const ziel = ereignis.target.closest("button, .zeitraum");
    if (!ziel || ziel.disabled) return;
    if (ziel.classList.contains("zeitraum") && ereignis.target.closest(".aufgeklappt")) return;
    const d = ziel.dataset;
    const z = this._z;
    if (d.zeitwahl) {
      this._zeitwahlOeffnen(ziel);
      return;
    }
    if (d.schritt) this._temperaturAendern(d.index === "basis" ? "basis" : Number(d.index), Number(d.schritt));
    else if (d.profil) {
      z.profil = d.profil;
      z.gewaehlt = null;
      if (!z.wochen[d.profil]) this._profilLaden(d.profil);
    } else if (d.wahltag) {
      z.tag = d.wahltag;
      z.gewaehlt = null;
    } else if (d.oeffne) {
      z.tag = d.oeffne;
      z.ansicht = "tag";
      z.gewaehlt = null;
    } else if (d.ziel) {
      if (z.kopierziele.has(d.ziel)) z.kopierziele.delete(d.ziel);
      else z.kopierziele.add(d.ziel);
    } else if (d.auswahl) {
      const tage = d.auswahl.split(",").filter((t) => t !== z.tag);
      const alleAn = tage.every((t) => z.kopierziele.has(t));
      tage.forEach((t) => alleAn ? z.kopierziele.delete(t) : z.kopierziele.add(t));
    } else if (d.aktion === "hinzufuegen") {
      const tag = this._planVon(z.tag);
      tag.periods.push(this._neuerZeitraum(tag));
      z.gewaehlt = tag.periods.length - 1;
      this._geaenderteTage.add(z.tag);
    } else if (d.aktion === "loeschen") {
      this._planVon(z.tag).periods.splice(Number(d.index), 1);
      z.gewaehlt = null;
      this._geaenderteTage.add(z.tag);
    } else if (d.aktion === "zuklappen") z.gewaehlt = null;
    else if (d.aktion === "woche") z.ansicht = "woche";
    else if (d.aktion === "kopieren") {
      z.kopierziele = /* @__PURE__ */ new Set();
      z.ansicht = "kopieren";
    } else if (d.aktion === "kopieren-ausfuehren") this._kopierenAusfuehren();
    else if (d.aktion === "zurueck") z.ansicht = "tag";
    else if (d.aktion === "neu-laden") this._profilLaden(z.profil);
    else if (d.aktion === "speichern") {
      this._speichern();
      return;
    } else if (d.aktion === "schliessen") {
      this._schliessenAnfragen();
      return;
    } else if (d.zeile !== void 0) z.gewaehlt = z.gewaehlt === Number(d.zeile) ? null : Number(d.zeile);
    else return;
    this._zeichnen();
    if (d.aktion === "hinzufuegen") {
      const zeile = this._blatt.querySelector(`[data-zeile="${z.gewaehlt}"]`);
      if (zeile) zeile.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
};

// src/karte/bedienung.js
var BedienungTeil = class {
  /**
   * Die Anzeigeleiste reagiert nur auf langes Halten. Jede Bewegung bricht ab,
   * damit senkrechtes Scrollen ueber der Karte nie etwas verstellt.
   */
  _haltenBinden(wrap, fortschritt, oeffnen) {
    wrap.addEventListener("pointerdown", (ereignis) => {
      if (this._editBox) return;
      this._startX = ereignis.clientX;
      this._startY = ereignis.clientY;
      this._haltenAbbrechen();
      this._halteZiel = { wrap, fortschritt };
      this._fortschrittStarten();
      this._haltenTimer = setTimeout(() => {
        this._haltenTimer = null;
        this._fortschrittZuruecksetzen();
        oeffnen();
      }, HALTEDAUER_MS);
    });
    wrap.addEventListener("pointermove", (ereignis) => {
      if (!this._haltenTimer) return;
      if (Math.abs(ereignis.clientX - this._startX) > BEWEGUNGSSCHWELLE_PX || Math.abs(ereignis.clientY - this._startY) > BEWEGUNGSSCHWELLE_PX) {
        this._haltenAbbrechen();
      }
    });
    wrap.addEventListener("pointerup", () => this._haltenAbbrechen());
    wrap.addEventListener("pointercancel", () => this._haltenAbbrechen());
    wrap.addEventListener("pointerleave", () => this._haltenAbbrechen());
    wrap.addEventListener("keydown", (ereignis) => {
      if (ereignis.key === "Enter" || ereignis.key === " ") {
        oeffnen();
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
    if (!this._halteZiel) return;
    const balken = this._halteZiel.fortschritt;
    balken.style.transition = "none";
    balken.style.width = "0";
    void balken.offsetWidth;
    balken.style.transition = `width ${HALTEDAUER_MS}ms linear`;
    balken.style.width = "100%";
    this._halteZiel.wrap.classList.add("haelt");
  }
  _fortschrittZuruecksetzen() {
    if (!this._halteZiel) return;
    const balken = this._halteZiel.fortschritt;
    balken.style.transition = "width 140ms ease";
    balken.style.width = "0";
    this._halteZiel.wrap.classList.remove("haelt");
  }
  // -------------------------------------------------------------- Heizprofil
  _profilOeffnen() {
    if (!this._tagesplanSichtbar) return;
    const blatt = document.createElement("thermostat-bar-card-heizprofil");
    blatt.oeffnen({
      hass: this._hass,
      entity: this._config.entity,
      name: this._config.name || this._zustand.attributes.friendly_name || this._config.entity,
      heute: this._jetzt().tag,
      farbskala: this._config.schedule,
      farben: this._config.colors
    });
    this._profilBlatt = blatt;
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
    zeile.innerHTML = '<button type="button" data-schritt="-1" aria-label="Weniger">−</button><button type="button" data-schritt="1" aria-label="Mehr">+</button>';
    box.appendChild(zeile);
    const fertig = document.createElement("button");
    fertig.type = "button";
    fertig.className = "fertig";
    fertig.textContent = "Fertig";
    box.appendChild(fertig);
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
    clearTimeout(this._freigabeTimer);
    this._freigabeTimer = setTimeout(() => {
      this._vorschauSoll = null;
      if (this._hass) this._werteSchreiben();
    }, 5e3);
  }
};

// src/karte/stil.js
function karteStil(c, f) {
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

// src/tagesplan/plan.js
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
function tagesabschnitte(tagesplan) {
  if (!tagesplan) return [];
  const basis = Number(tagesplan.base_temperature);
  const perioden = (tagesplan.periods || []).map((p) => ({
    von: uhrzeitInMinuten(p.starttime),
    bis: uhrzeitInMinuten(p.endtime),
    temp: Number(p.temperature)
  })).filter((p) => p.von !== null && p.bis !== null && p.bis > p.von && Number.isFinite(p.temp)).sort((a, b) => a.von - b.von);
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
function wochentemperaturen(planDaten) {
  return Object.values(planDaten || {}).flatMap((tag) => [
    Number(tag.base_temperature),
    ...(tag.periods || []).map((p) => Number(p.temperature))
  ]).filter(Number.isFinite);
}

// src/tagesplan/zeichnung.js
var TagesplanTeil = class {
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
    const prozent = (m) => `${m / TAGESMINUTEN * 100}%`;
    plan.querySelector(".tp-marken").innerHTML = ZEITMARKEN_MIN.map((m) => `<div class="tp-marke" style="left:${prozent(m)}"></div>`).join("");
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
    const x = (m) => m / TAGESMINUTEN * breite;
    const yUnbegrenzt = (t) => {
      const anteil = spanne <= 0 ? 0.5 : (t - skala.unten) / spanne;
      return hoehe - innenrand - anteil * (hoehe - 2 * innenrand);
    };
    const y = (t) => Math.min(hoehe - innenrand, Math.max(innenrand, yUnbegrenzt(t)));
    const abblassen = (von, bis, deckkraft) => `<rect x="${x(von)}" y="0" width="${Math.max(0, x(bis) - x(von))}" height="${hoehe}" style="fill: var(--card-background-color, #1c1c1c)" opacity="${deckkraft}"/>`;
    const minFarbe = cssFarbe(p.min_color);
    const maxFarbe = cssFarbe(p.max_color);
    const stopps = [];
    for (let k = 0; k <= 8; k++) {
      stopps.push(
        `<stop offset="${k / 8}" style="stop-color: color-mix(in oklab, ${maxFarbe} ${k / 8 * 100}%, ${minFarbe})"/>`
      );
    }
    const pfad = this._kurvenpfad(abschnitte, x, y);
    const teile = [
      `<defs><linearGradient id="tp-farbskala" gradientUnits="userSpaceOnUse" x1="0" y1="${yUnbegrenzt(p.min_temp)}" x2="0" y2="${yUnbegrenzt(p.max_temp)}">${stopps.join("")}</linearGradient></defs>`,
      `<path d="${pfad} L ${breite} ${hoehe} L 0 ${hoehe} Z" fill="url(#tp-farbskala)" opacity="${KURVE_FLAECHE_DECKKRAFT}"/>`,
      `<path d="${pfad}" fill="none" stroke="url(#tp-farbskala)" stroke-width="${KURVE_LINIE_PX}" stroke-linejoin="round" stroke-linecap="round"/>`
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
      if (planVorher !== null) {
        teile.push(`<line x1="${x(abweichung.von)}" y1="${y(planVorher)}" x2="${x(abweichung.von)}" y2="${ys}" ${strich}/>`);
      }
      teile.push(`<line x1="${x(abweichung.von)}" y1="${ys}" x2="${x(abweichung.bis)}" y2="${ys}" ${strich}/>`);
      if (abweichung.bis < TAGESMINUTEN && planNachher !== null) {
        teile.push(`<line x1="${x(abweichung.bis)}" y1="${ys}" x2="${x(abweichung.bis)}" y2="${y(planNachher)}" ${strich}/>`);
      }
      textHoehe = ys;
    }
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
    const tagesbeginn = Date.now() - minute * 6e4;
    const punkte = this._verlauf.map((p) => ({ m: Math.max(0, (p.zeit - tagesbeginn) / 6e4), t: p.t, aktion: p.aktion })).filter((p) => p.m <= minute);
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
    const mitAktion = geglaettet.some((p) => p.aktion !== void 0 && p.aktion !== null);
    const farbeVon = (p) => !mitAktion ? s.history_color : p.aktion === "heating" ? s.history_heating_color : s.history_idle_color;
    return verlaufsabschnitte(geglaettet, farbeVon).map((abschnitt) => this._verlaufPfad(abschnitt.punkte, abschnitt.farbe, x, y)).join("");
  }
  _verlaufPfad(punkte, farbe, x, y) {
    const d = punkte.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.m)} ${y(p.t)}`).join(" ");
    const strich = `color-mix(in oklab, ${cssFarbe(farbe)} ${VERLAUF_FARBSTAERKE_PROZENT}%, var(--card-background-color, #1c1c1c))`;
    return `<path d="${d}" fill="none" style="stroke: ${strich}" stroke-width="${VERLAUF_LINIE_PX}" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>`;
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
      const ende = /* @__PURE__ */ new Date();
      const beginn = new Date(ende.getTime() - this._jetzt().minute * 6e4);
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
      this._verlauf = (antwort && antwort[entitaet] || []).map((eintrag) => ({
        zeit: Number(eintrag.lu) * 1e3,
        t: Number(eintrag.a && eintrag.a.current_temperature),
        aktion: eintrag.a ? eintrag.a.hvac_action : void 0
      })).filter((p) => Number.isFinite(p.zeit) && Number.isFinite(p.t)).sort((a, b) => a.zeit - b.zeit);
    } catch (fehler) {
      this._verlauf = [];
    } finally {
      this._verlaufLaedt = false;
      if (this._el) this._planZeichnen();
    }
  }
};

// src/teile.js
function teileEinbauen(ziel, ...teile) {
  teile.forEach((teil) => {
    Object.getOwnPropertyNames(teil.prototype).filter((name) => name !== "constructor").forEach((name) => Object.defineProperty(ziel.prototype, name, Object.getOwnPropertyDescriptor(teil.prototype, name)));
  });
}

// src/karte/karte.js
var ThermostatBarCard = class extends HTMLElement {
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
    const farben = { ...STANDARDFARBEN, ...config.colors || {} };
    if (!farben.demand) farben.demand = heizflaecheVerlauf(farben.current, farben.demand_glow);
    if (!farben.target_heating) farben.target_heating = dunkler(farben.demand_glow, 80);
    this._config = {
      ...KARTEN_VORGABEN,
      ...config,
      colors: farben,
      schedule: { ...TAGESPLAN_VORGABEN, ...config.schedule || {} }
    };
    if (this._config.entity !== (this._verlaufEntitaet || this._config.entity)) this._verlauf = [];
    this._verlaufEntitaet = this._config.entity;
    this._verlaufGeladenAm = 0;
    this._aufgebaut = false;
    if (this._hass) this._zeichnen();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._profilBlatt && this._profilBlatt.isConnected) this._profilBlatt.hass = hass;
    if (!this._config) return;
    this._zeichnen();
    this._verlaufBeiBedarfLaden();
  }
  getCardSize() {
    return this._tagesplanSichtbar ? 4 : 3;
  }
  connectedCallback() {
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
    return Number(wert === void 0 ? 5 : wert);
  }
  get _max() {
    const wert = this._zustand.attributes.max_temp;
    return Number(wert === void 0 ? 35 : wert);
  }
  get _schritt() {
    return Number(this._zustand.attributes.target_temp_step || 0.5);
  }
  get _ist() {
    const wert = this._zustand.attributes.current_temperature;
    return wert === void 0 || wert === null ? null : Number(wert);
  }
  get _soll() {
    if (this._vorschauSoll !== null) return this._vorschauSoll;
    const wert = this._zustand.attributes.temperature;
    return wert === void 0 || wert === null ? null : Number(wert);
  }
  get _modi() {
    if (Array.isArray(this._config.hvac_modes) && this._config.hvac_modes.length) {
      return this._config.hvac_modes.map(
        (eintrag) => typeof eintrag === "string" ? { mode: eintrag } : eintrag
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
    if (eintrag.label !== void 0) return eintrag.label;
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
    const sprache = this._hass.locale && this._hass.locale.language || "en";
    const trenner = sprache.startsWith("de") ? "," : ".";
    return Number(wert).toFixed(1).replace(".", trenner);
  }
  _formatieren(wert) {
    if (wert === null || wert === void 0 || isNaN(wert)) return "--";
    return `${this._zahlteil(wert)} ${this._einheit()}`;
  }
  /** Zahl gross, Einheit klein und hochgestellt. */
  _formatierenHtml(wert) {
    if (wert === null || wert === void 0 || isNaN(wert)) return "--";
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
      teile = new Intl.DateTimeFormat("en-US", { ...optionen, timeZone: zeitzone }).formatToParts(/* @__PURE__ */ new Date());
    } catch (fehler) {
      teile = new Intl.DateTimeFormat("en-US", optionen).formatToParts(/* @__PURE__ */ new Date());
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
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:16px">Entität ${this._config.entity} nicht gefunden.</div></ha-card>`;
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
    this._editSchliessen();
    const c = this._config;
    const f = c.colors;
    this.shadowRoot.innerHTML = `
      ${karteStil(c, f)}

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
          <div class="tagesplan" role="button" tabindex="0" aria-label="Heizprofil bearbeiten">
            <div class="tp-clip">
              <div class="tp-marken"></div>
              <svg class="tp-kurve"></svg>
              <div class="haltefortschritt"></div>
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
    this._haltenBinden(this._anzeigeLeiste.wrap, this._anzeigeLeiste.fortschritt, () => this._editOeffnen());
    this._haltenBinden(this._el.plan, this._el.plan.querySelector(".haltefortschritt"), () => this._profilOeffnen());
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
    this._el.modes.innerHTML = this._modi.map((eintrag) => {
      const text = this._modusBeschriftung(eintrag);
      const symbol = eintrag.icon || MODUS_SYMBOLE[eintrag.mode] || "mdi:help-circle-outline";
      const teile = [];
      if (c.show_icons) teile.push(`<ha-icon icon="${symbol}"></ha-icon>`);
      if (c.show_mode_labels && text) teile.push(`<span>${text}</span>`);
      if (!teile.length) teile.push(`<span>${text || eintrag.mode}</span>`);
      return `<button type="button" data-mode="${eintrag.mode}" aria-pressed="false" aria-label="${text}" title="${text}">${teile.join("")}</button>`;
    }).join("");
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
    const bedarf = ist !== null && soll !== null && soll > ist + c.tolerance;
    const erreicht = ist !== null && soll !== null && Math.abs(soll - ist) <= c.tolerance;
    const aktion = z.attributes.hvac_action;
    const geraetHeizt = aktion !== void 0 ? aktion === "heating" : bedarf;
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
    const gesperrt = sperrzustand ? sperrzustand.state === "on" || sperrzustand.state === "locked" : false;
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
  disconnectedCallback() {
    this._haltenAbbrechen();
    this._editSchliessen();
    if (this._profilBlatt) this._profilBlatt.schliessen();
    clearTimeout(this._freigabeTimer);
    clearInterval(this._uhr);
    if (this._beobachter) {
      this._beobachter.disconnect();
      this._beobachter = null;
    }
  }
};
teileEinbauen(ThermostatBarCard, TagesplanTeil, BedienungTeil);

// src/thermostat-bar-card.js
console.info(
  `%c THERMOSTAT-BAR-CARD %c ${CARD_VERSION} `,
  "color: #16181a; background: #e8a33d; font-weight: 700;",
  "color: #e8a33d; background: #16181a;"
);
customElements.define("thermostat-bar-card", ThermostatBarCard);
customElements.define("thermostat-bar-card-editor", ThermostatBarCardEditor);
customElements.define("thermostat-bar-card-heizprofil", ThermostatHeizprofilBlatt);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermostat-bar-card",
  name: "Thermostat Bar Card",
  description: "Waagerechte Thermostat-Karte mit Ist-Füllung, Heizanforderung, Tagesplan und Bearbeitungsmodus.",
  preview: true,
  documentationURL: "https://github.com/SvMo85/ha-thermostat-bar-card"
});
