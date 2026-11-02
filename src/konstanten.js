export const CARD_VERSION = "0.4.0";

// Ein Blau fuer Ist und Automatik, ein Rot fuer alles, was heizt. Beide sind
// Theme-Farben von Home Assistant und folgen damit dem eingestellten Theme.
export const IST_FARBE = "var(--primary-color, #009ac7)";
export const WAERME_FARBE = "var(--red-color, #f44336)";

export const STANDARDFARBEN = {
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

export const TAGESPLAN_VORGABEN = {
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

export const KARTEN_VORGABEN = {
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

export const MODUS_SYMBOLE = {
  auto: "mdi:calendar-sync",
  heat: "mdi:fire",
  cool: "mdi:snowflake",
  heat_cool: "mdi:autorenew",
  dry: "mdi:water-percent",
  fan_only: "mdi:fan",
  off: "mdi:power"
};

export const HALTEDAUER_MS = 600;
export const BEWEGUNGSSCHWELLE_PX = 6;
export const BESCHRIFTUNGSLUECKE_PX = 10;
export const GREIFPUNKT_RADIUS_PX = 9;
export const RAND_BEARBEITEN_PX = 52;

// Ueber diese Breite laeuft das Blau der Ist-Fuellung ins Rot der
// Heizflaeche: genug gegen die harte Farbkante, wenig genug, damit die
// Grenze zwischen Ist und Soll klar bleibt.
export const KANTENUEBERGANG_PX = 4;

export const TAGESMINUTEN = 1440;
export const ZEITMARKEN_MIN = [240, 480, 720, 960, 1200];
export const RAMPE_MIN = 40;
export const SKALA_LUFT_GRAD = 0.5;
export const KURVE_LINIE_PX = 2.5;
export const KURVE_FLAECHE_DECKKRAFT = 0.3;
export const VERLAUF_LINIE_PX = 1.5;
export const VERLAUF_FARBSTAERKE_PROZENT = 60;
export const VERLAUF_ABRUF_MS = 5 * 60 * 1000;
export const UHR_TAKT_MS = 60 * 1000;
export const ABWEICHUNG_SCHWELLE_GRAD = 0.05;
