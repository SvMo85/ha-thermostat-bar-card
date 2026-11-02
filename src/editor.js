import { KARTEN_VORGABEN, STANDARDFARBEN, TAGESPLAN_VORGABEN } from "./konstanten.js";

export const EDITOR_SCHEMA = [
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

export const EDITOR_BESCHRIFTUNGEN = {
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
export const EDITOR_VORGABEN = { ...KARTEN_VORGABEN, schedule: TAGESPLAN_VORGABEN };
delete EDITOR_VORGABEN.name;
delete EDITOR_VORGABEN.lock_entity;
delete EDITOR_VORGABEN.hvac_modes;

/** Ergaenzt fehlende Schluessel um ihre Vorgabe, damit der Editor sie zeigt. */
export function mitVorgaben(config) {
  return {
    ...EDITOR_VORGABEN,
    ...config,
    schedule: { ...TAGESPLAN_VORGABEN, ...(config.schedule || {}) }
  };
}

/** Entfernt Werte, die ihrer Vorgabe entsprechen, damit das YAML schlank bleibt. */
export function ohneVorgaben(config) {
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

export class ThermostatBarCardEditor extends HTMLElement {
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
