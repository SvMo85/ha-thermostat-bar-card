/**
 * Thermostat Bar Card
 *
 * Waagerechte Thermostat-Karte fuer Home Assistant: Die Fuellung zeigt die
 * Ist-Temperatur, die Flaeche bis zur Markierung die Heizanforderung, die
 * ziehbare Markierung setzt die Solltemperatur.
 *
 * Der Modus wird beim Ziehen bewusst nicht geaendert. Homematic IP behaelt
 * einen im Automatikbetrieb gesetzten Wert bis zum naechsten Schaltzeitpunkt
 * des Heizprofils bei; das ist gewolltes Verhalten.
 */

const CARD_VERSION = "1.0.0";

console.info(
  `%c THERMOSTAT-BAR-CARD %c ${CARD_VERSION} `,
  "color: #16181a; background: #e8a33d; font-weight: 700;",
  "color: #e8a33d; background: #16181a;"
);

const STANDARDFARBEN = {
  track: "var(--divider-color, #262c32)",
  current: "#4a7f9e",
  demand: "#7d4226",
  target: "#e8a33d",
  label_current: "#dde7ee",
  label_target: "#e8a33d",
  status_heating: "#e8663d",
  status_reached: "#5aa469",
  status_idle: "var(--secondary-text-color, #8d97a1)",
  mode_auto: "#5aa469",
  mode_heat: "#e8663d",
  mode_off: "#3d5f7a",
  mode_inactive: "var(--divider-color, #2a3036)",
  lock_active: "#c06a6a"
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

const MODUS_FARBSCHLUESSEL = {
  auto: "mode_auto",
  heat: "mode_heat",
  heat_cool: "mode_heat",
  cool: "mode_off",
  off: "mode_off"
};

const HALTEDAUER_MS = 500;
const BEWEGUNGSSCHWELLE_PX = 6;
const BESCHRIFTUNGSLUECKE_PX = 10;
const GREIFPUNKT_RADIUS_PX = 9;

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
    this._zieht = false;
    this._haltenTimer = null;
    this._startX = 0;
    this._gezogen = false;
    this._feinBox = null;
    this._vorschauSoll = null;
    this._aufgebaut = false;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Es muss eine Klima-Entitaet angegeben werden.");
    }
    if (!config.entity.startsWith("climate.")) {
      throw new Error("entity muss aus der Domaene climate stammen.");
    }

    this._config = {
      name: null,
      lock_entity: null,
      height: 56,
      edge_space: 60,
      tolerance: 0.2,
      show_labels: true,
      show_status: true,
      show_icons: true,
      show_mode_labels: true,
      hvac_modes: null,
      ...config,
      colors: { ...STANDARDFARBEN, ...(config.colors || {}) }
    };

    this._aufgebaut = false;
    if (this._hass) this._zeichnen();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._zeichnen();
  }

  getCardSize() {
    return this._config && this._config.show_status ? 3 : 2;
  }

  // ---------------------------------------------------------------- Zustand

  get _zustand() {
    return this._hass.states[this._config.entity];
  }

  get _min() {
    const z = this._zustand;
    return Number(z.attributes.min_temp !== undefined ? z.attributes.min_temp : 5);
  }

  get _max() {
    const z = this._zustand;
    return Number(z.attributes.max_temp !== undefined ? z.attributes.max_temp : 35);
  }

  get _schritt() {
    const z = this._zustand;
    return Number(z.attributes.target_temp_step || 0.5);
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

  _modusBeschriftung(eintrag) {
    if (eintrag.label !== undefined) return eintrag.label;
    const schluessel = `component.climate.entity_component._.state.${eintrag.mode}`;
    const uebersetzt = this._hass.localize(schluessel);
    return uebersetzt || eintrag.mode;
  }

  _anteil(wert) {
    const spanne = this._max - this._min;
    if (spanne <= 0) return 0;
    return Math.min(1, Math.max(0, (wert - this._min) / spanne));
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

  _zahlteil(wert) {
    return Number(wert).toFixed(1).replace(".", this._dezimaltrennzeichen());
  }

  _einheit() {
    return this._hass.config.unit_system.temperature || "°C";
  }

  _dezimaltrennzeichen() {
    const sprache = (this._hass.locale && this._hass.locale.language) || "en";
    return sprache.startsWith("de") ? "," : ".";
  }

  // ----------------------------------------------------------------- Aufbau

  _zeichnen() {
    const zustand = this._zustand;

    if (!zustand) {
      this.shadowRoot.innerHTML =
        `<ha-card><div style="padding:16px">Entitaet ${this._config.entity} nicht gefunden.</div></ha-card>`;
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
    const c = this._config;
    const f = c.colors;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --tb-height: ${c.height}px;
          --tb-edge: ${c.edge_space}px;
        }
        ha-card {
          display: flex; flex-direction: column; gap: 14px;
          padding: 14px 16px; position: relative;
          box-sizing: border-box; width: 100%; overflow: hidden;
        }
        *, *::before, *::after { box-sizing: border-box; }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .name {
          font-size: 1.12rem; font-weight: 600; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
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
          font-size: 0.98rem; white-space: nowrap;
          color: ${f.status_idle};
        }
        .status ha-icon { --mdc-icon-size: 18px; }
        .status[data-zustand="heating"] { color: ${f.status_heating}; font-weight: 500; }
        .status[data-zustand="reached"] { color: ${f.status_reached}; font-weight: 500; }

        .trackwrap {
          position: relative; margin: 0 var(--tb-edge);
          height: var(--tb-height);
          /* Senkrechtes Scrollen bleibt dem Browser ueberlassen, waagerechte
             Gesten wertet die Karte selbst aus. */
          touch-action: pan-y;
        }
        .trackclip {
          position: absolute; inset: 0; border-radius: 8px;
          background: ${f.track}; overflow: hidden; cursor: pointer;
        }
        .trackwrap:focus-visible .trackclip {
          outline: 2px solid ${f.target}; outline-offset: 2px;
        }
        .demand { position: absolute; top: 0; bottom: 0; background: ${f.demand}; display: none; }
        .fill { position: absolute; inset: 0 auto 0 0; background: ${f.current}; }
        .markerline {
          position: absolute; top: 0; bottom: 0;
          width: 3px; margin-left: -1.5px; background: ${f.target};
        }
        .markerdot {
          position: absolute; top: 50%;
          width: 18px; height: 18px; margin: -9px 0 0 -9px;
          border-radius: 50%; background: ${f.target};
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4); pointer-events: none;
        }
        .lbl {
          position: absolute; top: 50%; transform: translateY(-50%);
          white-space: nowrap; pointer-events: none;
          font-size: 1.2rem; font-variant-numeric: tabular-nums;
        }
        .einheit {
          font-size: 0.58em; vertical-align: super;
          margin-left: 2px; letter-spacing: 0.02em;
        }
        .lbl.ist { color: ${f.label_current}; }
        .lbl.soll { color: ${f.label_target}; font-weight: 600; }

        .modes { display: flex; gap: 8px; }
        .modes button {
          flex: 1; min-width: 0; min-height: 44px;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          border: 1px solid ${f.mode_inactive}; border-radius: 8px;
          background: transparent; color: var(--primary-text-color);
          font: inherit; font-size: 1.06rem; cursor: pointer;
        }
        .modes button ha-icon { --mdc-icon-size: 22px; }
        .modes button[aria-pressed="true"] { font-weight: 600; color: #16181a; }
        .modes button[aria-pressed="true"][data-mode="auto"] { background: ${f.mode_auto}; border-color: ${f.mode_auto}; }
        .modes button[aria-pressed="true"][data-mode="heat"],
        .modes button[aria-pressed="true"][data-mode="heat_cool"] { background: ${f.mode_heat}; border-color: ${f.mode_heat}; }
        .modes button[aria-pressed="true"][data-mode="off"],
        .modes button[aria-pressed="true"][data-mode="cool"] {
          background: ${f.mode_off}; border-color: ${f.mode_off}; color: #eef3f7;
        }

        .feintune {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%); z-index: 5;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          background: var(--card-background-color, #0c0f12);
          border: 1px solid var(--divider-color); border-radius: 14px;
          padding: 14px; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.55);
        }
        .feintune .zeile { display: flex; align-items: center; gap: 14px; }
        .feintune .zeile button {
          width: 58px; height: 58px; border-radius: 12px;
          border: 1px solid var(--divider-color); background: transparent;
          color: var(--primary-text-color); font: inherit; font-size: 1.7rem;
          line-height: 1; cursor: pointer;
        }
        .feintune .wert {
          min-width: 96px; text-align: center; font-size: 1.2rem; font-weight: 600;
          font-variant-numeric: tabular-nums; color: ${f.label_target};
        }
        .feintune .fertig {
          align-self: stretch; min-height: 42px; padding: 0 20px;
          border: 1px solid ${f.target}; border-radius: 10px;
          background: ${f.target}; color: #16181a;
          font: inherit; font-size: 0.95rem; font-weight: 600; cursor: pointer;
        }
      </style>

      <ha-card>
        <div class="head">
          <span class="head-left">
            ${c.lock_entity ? '<button type="button" class="lock" aria-pressed="false"></button>' : ""}
            <span class="name"></span>
          </span>
          ${c.show_status ? '<span class="status"><ha-icon></ha-icon><span class="stext"></span></span>' : ""}
        </div>

        <div class="trackwrap" tabindex="0" role="slider">
          <div class="trackclip">
            <div class="demand"></div>
            <div class="fill"></div>
            <div class="markerline"></div>
          </div>
          <div class="markerdot"></div>
          ${c.show_labels ? '<span class="lbl ist"></span><span class="lbl soll"></span>' : ""}
        </div>

        <div class="modes"></div>
      </ha-card>
    `;

    this._el = {
      karte: this.shadowRoot.querySelector("ha-card"),
      name: this.shadowRoot.querySelector(".name"),
      lock: this.shadowRoot.querySelector(".lock"),
      status: this.shadowRoot.querySelector(".status"),
      wrap: this.shadowRoot.querySelector(".trackwrap"),
      clip: this.shadowRoot.querySelector(".trackclip"),
      demand: this.shadowRoot.querySelector(".demand"),
      fill: this.shadowRoot.querySelector(".fill"),
      linie: this.shadowRoot.querySelector(".markerline"),
      punkt: this.shadowRoot.querySelector(".markerdot"),
      istLbl: this.shadowRoot.querySelector(".lbl.ist"),
      sollLbl: this.shadowRoot.querySelector(".lbl.soll"),
      modes: this.shadowRoot.querySelector(".modes")
    };

    this._gestenBinden();
    this._modiBauen();

    if (this._el.lock) {
      this._el.lock.addEventListener("click", () => this._sperreUmschalten());
    }

    // Nach einer Konfigurationsaenderung zeigt der alte Beobachter auf einen
    // entfernten Knoten, deshalb wird er bei jedem Aufbau neu gesetzt.
    if (this._beobachter) this._beobachter.disconnect();
    this._beobachter = new ResizeObserver(() => this._werteSchreiben());
    this._beobachter.observe(this._el.wrap);
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
    if (!el) return;

    el.name.textContent = c.name || z.attributes.friendly_name || this._config.entity;

    const breite = el.clip.offsetWidth;
    const ist = this._ist;
    const soll = this._soll;

    const istPx = ist === null ? 0 : this._anteil(ist) * breite;
    const sollPx = soll === null ? 0 : this._anteil(soll) * breite;

    el.fill.style.width = `${istPx}px`;
    el.linie.style.left = `${sollPx}px`;
    el.punkt.style.left = `${sollPx}px`;

    const aktion = z.attributes.hvac_action;
    const erreicht = ist !== null && soll !== null && Math.abs(soll - ist) <= c.tolerance;

    // Die Flaeche zeigt den Abstand zwischen Ist und Soll, nicht den laufenden
    // Betrieb. hvac_action meldet bei abgeschalteter Heizung "idle", obwohl
    // das Ventil geoeffnet waere, sobald Waerme verfuegbar ist.
    const bedarf = ist !== null && soll !== null && soll > ist + c.tolerance;

    // Der Status folgt dagegen dem gemeldeten Betrieb, soweit vorhanden.
    const heizt = aktion !== undefined ? aktion === "heating" : bedarf;

    if (bedarf && sollPx > istPx) {
      el.demand.style.display = "block";
      el.demand.style.left = `${istPx}px`;
      el.demand.style.width = `${sollPx - istPx}px`;
    } else {
      el.demand.style.display = "none";
    }

    el.wrap.setAttribute("aria-valuemin", String(this._min));
    el.wrap.setAttribute("aria-valuemax", String(this._max));
    el.wrap.setAttribute("aria-valuenow", String(soll === null ? this._min : soll));
    el.wrap.setAttribute("aria-valuetext", this._formatieren(soll));
    el.wrap.setAttribute("aria-label", el.name.textContent);

    if (el.status) {
      const art = heizt ? "heating" : erreicht ? "reached" : "idle";
      el.status.setAttribute("data-zustand", art);
      el.status.querySelector("ha-icon").setAttribute(
        "icon",
        heizt ? "mdi:fire" : erreicht ? "mdi:check-circle-outline" : "mdi:thermometer"
      );
      el.status.querySelector(".stext").textContent = this._statustext(art);
    }

    if (c.show_labels) this._beschriftungenSetzen(breite, istPx, sollPx, ist, soll);

    this._modiAktualisieren();
    this._sperreAktualisieren();
  }

  _statustext(art) {
    const z = this._zustand;
    if (z.attributes.hvac_action) {
      const uebersetzt = this._hass.localize(
        `component.climate.entity_component._.state_attributes.hvac_action.state.${z.attributes.hvac_action}`
      );
      if (uebersetzt) return uebersetzt;
    }
    if (art === "heating") return "Heizt";
    if (art === "reached") return "Erreicht";
    return "Bereit";
  }

  /**
   * Die Soll-Beschriftung steht immer rechts vom Strich, die Ist-Beschriftung
   * immer links davon. Reicht der Platz links nicht, weicht sie in den
   * Randbereich aus, den edge_space freihaelt.
   */
  _beschriftungenSetzen(breite, istPx, sollPx, ist, soll) {
    const el = this._el;
    const rand = this._config.edge_space;

    el.istLbl.innerHTML = this._formatierenHtml(ist);
    el.sollLbl.innerHTML = this._formatierenHtml(soll);

    const istBreite = el.istLbl.offsetWidth;
    const sollBreite = el.sollLbl.offsetWidth;

    let sollLinks = sollPx + GREIFPUNKT_RADIUS_PX + BESCHRIFTUNGSLUECKE_PX;
    const grenze = sollPx - GREIFPUNKT_RADIUS_PX - BESCHRIFTUNGSLUECKE_PX - istBreite;
    let istLinks = Math.min(istPx - BESCHRIFTUNGSLUECKE_PX - istBreite, grenze);

    const maxRechts = breite + rand - 4;
    if (sollLinks + sollBreite > maxRechts) sollLinks = maxRechts - sollBreite;
    if (istLinks < -rand + 4) istLinks = -rand + 4;

    el.sollLbl.style.left = `${sollLinks}px`;
    el.istLbl.style.left = `${istLinks}px`;
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
      gesperrt ? "Bedienung am Geraet gesperrt" : "Bedienung am Geraet moeglich"
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

  // ------------------------------------------------------------------ Gesten

  _gestenBinden() {
    const clip = this._el.clip;
    const wrap = this._el.wrap;

    clip.addEventListener("pointerdown", (ereignis) => {
      if (this._feinBox) return;
      // Der Zeiger wird bewusst noch nicht eingefangen: Solange die Richtung
      // der Geste unklar ist, muss der Browser senkrecht scrollen duerfen.
      this._startX = ereignis.clientX;
      this._startY = ereignis.clientY;
      this._gezogen = false;
      this._verworfen = false;
      this._haltenAbbrechen();
      this._haltenTimer = setTimeout(() => {
        this._haltenTimer = null;
        this._gezogen = true;
        this._feinOeffnen();
      }, HALTEDAUER_MS);
    });

    clip.addEventListener("pointermove", (ereignis) => {
      if (this._verworfen || this._startX === null) return;

      const dx = ereignis.clientX - this._startX;
      const dy = ereignis.clientY - this._startY;

      if (!this._gezogen) {
        // Ueberwiegend senkrecht: Der Nutzer scrollt, die Karte haelt sich raus.
        if (Math.abs(dy) > BEWEGUNGSSCHWELLE_PX && Math.abs(dy) > Math.abs(dx)) {
          this._verworfen = true;
          this._haltenAbbrechen();
          return;
        }
        if (Math.abs(dx) <= BEWEGUNGSSCHWELLE_PX) return;

        this._gezogen = true;
        this._haltenAbbrechen();
        clip.setPointerCapture(ereignis.pointerId);
      }

      this._vorschauSoll = this._wertAusEreignis(ereignis);
      this._werteSchreiben();
    });

    clip.addEventListener("pointerup", (ereignis) => {
      this._haltenAbbrechen();

      const verworfen = this._verworfen;
      const dx = Math.abs(ereignis.clientX - this._startX);
      const dy = Math.abs(ereignis.clientY - this._startY);
      const gezogen = this._gezogen;

      this._startX = null;
      this._verworfen = false;

      if (verworfen) return;

      if (!gezogen) {
        // Tippen zaehlt nur, wenn der Finger in beiden Richtungen ruhig blieb.
        if (dx <= BEWEGUNGSSCHWELLE_PX && dy <= BEWEGUNGSSCHWELLE_PX) {
          this._sollSenden(this._wertAusEreignis(ereignis));
        }
        return;
      }

      if (this._vorschauSoll !== null) this._sollSenden(this._vorschauSoll);
    });

    clip.addEventListener("pointercancel", () => {
      this._haltenAbbrechen();
      this._startX = null;
      this._verworfen = false;
      this._vorschauSoll = null;
      this._werteSchreiben();
    });

    wrap.addEventListener("keydown", (ereignis) => {
      const schritt = this._schritt;
      const soll = this._soll;
      if (soll === null) return;
      if (ereignis.key === "ArrowRight" || ereignis.key === "ArrowUp") {
        this._sollSenden(Math.min(this._max, soll + schritt));
        ereignis.preventDefault();
      }
      if (ereignis.key === "ArrowLeft" || ereignis.key === "ArrowDown") {
        this._sollSenden(Math.max(this._min, soll - schritt));
        ereignis.preventDefault();
      }
    });
  }

  _haltenAbbrechen() {
    if (this._haltenTimer) {
      clearTimeout(this._haltenTimer);
      this._haltenTimer = null;
    }
  }

  _wertAusEreignis(ereignis) {
    const rechteck = this._el.clip.getBoundingClientRect();
    let quote = (ereignis.clientX - rechteck.left) / rechteck.width;
    quote = Math.min(1, Math.max(0, quote));
    const schritt = this._schritt;
    const roh = this._min + quote * (this._max - this._min);
    return Math.round(roh / schritt) * schritt;
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

  // ----------------------------------------------------------- Feinjustierung

  _feinOeffnen() {
    if (this._feinBox) return;

    const box = document.createElement("div");
    box.className = "feintune";
    box.innerHTML = `
      <div class="zeile">
        <button type="button" data-schritt="-1" aria-label="Weniger">&minus;</button>
        <span class="wert"></span>
        <button type="button" data-schritt="1" aria-label="Mehr">+</button>
      </div>
      <button type="button" class="fertig">Fertig</button>
    `;

    const wert = box.querySelector(".wert");
    wert.innerHTML = this._formatierenHtml(this._soll);

    box.addEventListener("click", (ereignis) => {
      const knopf = ereignis.target.closest("button");
      if (!knopf) return;
      if (knopf.classList.contains("fertig")) {
        this._feinSchliessen();
        return;
      }
      const richtung = Number(knopf.dataset.schritt);
      const neu = Math.min(
        this._max,
        Math.max(this._min, (this._soll || this._min) + richtung * this._schritt)
      );
      wert.innerHTML = this._formatierenHtml(neu);
      this._sollSenden(neu);
    });

    this._aussenKlick = (ereignis) => {
      if (!ereignis.composedPath().includes(box)) this._feinSchliessen();
    };

    this._el.karte.appendChild(box);
    this._feinBox = box;
    setTimeout(() => document.addEventListener("pointerdown", this._aussenKlick, true), 0);
  }

  _feinSchliessen() {
    if (!this._feinBox) return;
    document.removeEventListener("pointerdown", this._aussenKlick, true);
    this._feinBox.remove();
    this._feinBox = null;
  }

  disconnectedCallback() {
    this._haltenAbbrechen();
    this._feinSchliessen();
    clearTimeout(this._freigabeTimer);
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
  { name: "lock_entity", selector: { entity: { domain: ["switch", "lock", "input_boolean"] } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "height", selector: { number: { min: 32, max: 120, step: 2, mode: "box" } } },
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
  lock_entity: "Entitaet der Bedienungssperre",
  height: "Hoehe der Leiste",
  edge_space: "Randbereich",
  tolerance: "Toleranz fuer Erreicht",
  show_labels: "Werte in der Leiste",
  show_status: "Statusanzeige",
  show_icons: "Symbole auf den Knoepfen",
  show_mode_labels: "Text auf den Knoepfen"
};

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
        EDITOR_BESCHRIFTUNGEN[eintrag.name] || eintrag.name;
      this._form.addEventListener("value-changed", (ereignis) => {
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: ereignis.detail.value },
            bubbles: true,
            composed: true
          })
        );
      });
      this.appendChild(this._form);
    }

    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
  }
}

customElements.define("thermostat-bar-card", ThermostatBarCard);
customElements.define("thermostat-bar-card-editor", ThermostatBarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermostat-bar-card",
  name: "Thermostat Bar Card",
  description:
    "Waagerechte Thermostat-Karte mit Ist-Fuellung, Heizanforderung und ziehbarer Solltemperatur.",
  preview: true,
  documentationURL: "https://github.com/SvMo85/ha-thermostat-bar-card"
});
