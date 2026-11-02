import { cssFarbe } from "../farben.js";
import { TAGESMINUTEN } from "../konstanten.js";
import {
  PROFIL_MAX_SCHALTPUNKTE, PROFIL_MELDUNG_MS, PROFIL_RASTER_MIN, PROFIL_TAGESZEILE_PX, WERKTAGE, WOCHENENDE, WOCHENTAGE,
  kopie, minutenAus, neuerZeitraum, schaltpunkteVon, temperaturGeschaltet, uhrzeitAus, zeitGesetzt, zeitraumAbschnitte
} from "./plan.js";
import { blattStil } from "./stil.js";

const htmlSicher = (text) => String(text).replace(/[&<>"]/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[z]);

/**
 * Bearbeitet die Wochenplaene eines Thermostats von Homematic(IP) Local als
 * Blatt ueber dem Dashboard. Haengt am body, damit kein Elternelement der
 * Karte es beschneidet. Gelesen wird ueber get_schedule_profile, geschrieben
 * je geaendertem Tag ueber set_schedule_weekday.
 */
export class ThermostatHeizprofilBlatt extends HTMLElement {
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
    this._profile = [...(a.available_profiles && a.available_profiles.length ? a.available_profiles : [aktiv])].sort();
    this._aktivesProfil = aktiv;
    this._z = {
      ansicht: "tag", profil: aktiv, tag: heute, gewaehlt: null, kopierziele: new Set(),
      wochen: { [aktiv]: a.schedule_data ? kopie(a.schedule_data) : null },
      geaendert: Object.fromEntries(this._profile.map((p) => [p, new Set()])),
      laedt: new Set(), fehler: {}, speichert: false, meldung: ""
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

  _planVon(tagName, profil = this._z.profil) {
    const woche = this._z.wochen[profil];
    return woche && woche[tagName];
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
      min: Number(a.min_temp === undefined ? 5 : a.min_temp),
      max: Number(a.max_temp === undefined ? 30.5 : a.max_temp),
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
      this._z.fehler[profil] = (fehler && fehler.message) || String(fehler);
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
      this._melden(`Speichern fehlgeschlagen: ${(fehler && fehler.message) || fehler}`, true);
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

  /** Kopierziele als "P2|MONDAY", damit ueber mehrere Profile gewaehlt werden kann. */
  _kopierziel(profil, tagName) {
    return `${profil}|${tagName}`;
  }

  _istQuelle(profil, tagName) {
    return profil === this._z.profil && tagName === this._z.tag;
  }

  _kopierenAusfuehren() {
    const quelle = this._planVon(this._z.tag);
    const teile = [];
    this._profile.forEach((profil) => {
      const tage = WOCHENTAGE.filter((t) => this._z.kopierziele.has(this._kopierziel(profil, t)));
      if (!tage.length || !this._z.wochen[profil]) return;
      tage.forEach((t) => {
        this._z.wochen[profil][t] = kopie(quelle);
        this._z.geaendert[profil].add(t);
      });
      const namen = tage.map((t) => this._tagKurz(t)).join(", ");
      teile.push(this._profile.length > 1 ? `${profil} ${namen}` : namen);
    });
    this._melden(`${this._tagLang(this._z.tag)} auf ${teile.join("; ")} kopiert. Noch nicht gespeichert.`);
    this._z.kopierziele = new Set();
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
    return (this._hass.locale && this._hass.locale.language) || "de";
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

  _skala(profil) {
    const werte = WOCHENTAGE.map((t) => this._planVon(t, profil)).filter(Boolean)
      .flatMap((t) => [Number(t.base_temperature), ...t.periods.map((p) => Number(p.temperature))]);
    if (!werte.length) return { unten: 15, oben: 25 };
    return { unten: Math.min(...werte) - 1, oben: Math.max(...werte) + 1 };
  }

  /** Tageskurve als Stufen; viewBox 1440 mal 100, gedehnt auf die Breite. */
  _kurveSvg(tagName, mitAuswahl, profil) {
    const { unten, oben } = this._skala(profil);
    const y = (t) => 100 - ((t - unten) / (oben - unten)) * 100;
    const teile = zeitraumAbschnitte(this._planVon(tagName, profil));
    const strich = 'vector-effect="non-scaling-stroke"';
    const marken = [360, 720, 1080].map((m) =>
      `<line x1="${m}" y1="0" x2="${m}" y2="100" stroke="var(--divider-color)" stroke-width="1" ${strich}/>`).join("");
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
    return zeitraumAbschnitte(this._planVon(tagName))
      .filter((a) => a.bis - a.von >= 90)
      .map((a) => `<span class="wert" style="left: ${((a.von + a.bis) / 2 / TAGESMINUTEN) * 100}%;
        top: ${100 - ((a.temp - unten) / (oben - unten)) * 100}%">${this._grad(a.temp)}</span>`).join("");
  }

  _tagHtml(tagName, hoehe, gross, profil) {
    return `<div class="tag" style="height: ${hoehe}px">${this._kurveSvg(tagName, gross, profil)}${gross ? this._werteHtml(tagName) : ""}</div>`;
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
      <button type="button" class="hinzu" data-aktion="hinzufuegen" ${neu ? "" : "disabled"}>${neu
        ? '<ha-icon icon="mdi:plus"></ha-icon> Zeitraum hinzufügen'
        : belegt >= PROFIL_MAX_SCHALTPUNKTE ? "Alle 13 Schaltpunkte belegt" : "Kein Platz für einen weiteren Zeitraum"}</button>
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
          <span class="name">${this._tagKurz(t)}</span>${this._tagHtml(t, PROFIL_TAGESZEILE_PX, false)}<ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>`).join("")}</div>${this._zeitachseEingerueckt}`}`,
      fuss: this._speichernHtml
    };
  }

  /** Zielprofil der Kopieransicht; der Punkt markiert Profile, in denen Tage gewaehlt sind. */
  _zielprofileHtml() {
    if (this._profile.length < 2) return "";
    const ziel = this._z.kopierProfil;
    return `<div class="chips">${this._profile.map((p) => {
      const gewaehlt = WOCHENTAGE.some((t) => this._z.kopierziele.has(this._kopierziel(p, t)));
      return `<button type="button" data-zielprofil="${p}" class="${gewaehlt ? "geaendert" : ""}"
        aria-pressed="${p === ziel}">${p}</button>`;
    }).join("")}</div>`;
  }

  _kopierzieleHtml() {
    const ziel = this._z.kopierProfil;
    if (this._z.laedt.has(ziel)) return `<p class="hinweis">Profil ${ziel} wird vom Gerät geladen …</p>`;
    if (this._z.fehler[ziel]) {
      return `<p class="hinweis fehler">Profil ${ziel} konnte nicht geladen werden: ${htmlSicher(this._z.fehler[ziel])}</p>
        <button type="button" class="hinzu" data-aktion="ziel-neu-laden">Erneut laden</button>`;
    }
    if (!this._z.wochen[ziel]) return `<p class="hinweis">Kein Plan vorhanden.</p>`;
    const auswahl = (tage, text) => `<button type="button" data-auswahl="${tage.join(",")}">${text}</button>`;
    return `
      <div class="schnellwahl">
        ${auswahl(WERKTAGE, `${this._tagKurz("MONDAY")} bis ${this._tagKurz("FRIDAY")}`)}
        ${auswahl(WOCHENENDE, `${this._tagKurz("SATURDAY")} und ${this._tagKurz("SUNDAY")}`)}
        ${auswahl(WOCHENTAGE, "Alle")}
      </div>
      <div class="woche">${WOCHENTAGE.map((t) => {
        const quelle = this._istQuelle(ziel, t);
        const an = this._z.kopierziele.has(this._kopierziel(ziel, t));
        const symbol = quelle ? "mdi:content-copy" : an ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline";
        return `<button type="button" class="wochentag ${quelle ? "quelle" : ""}" data-ziel="${t}" ${quelle ? "disabled" : ""}
          role="checkbox" aria-checked="${an}">
          <span class="name">${this._tagKurz(t)}</span>${this._tagHtml(t, PROFIL_TAGESZEILE_PX, false, ziel)}
          <ha-icon icon="${symbol}" class="${an ? "an" : ""}"></ha-icon>
        </button>`;
      }).join("")}</div>${this._zeitachseEingerueckt}`;
  }

  _kopierAnsicht() {
    const anzahl = this._z.kopierziele.size;
    const quelle = this._profile.length > 1 ? `${this._z.profil} ${this._tagLang(this._z.tag)}` : this._tagLang(this._z.tag);
    return {
      titel: `${quelle} kopieren`,
      zurueck: true,
      inhalt: `
        <div class="titel"><span>Quelle</span></div>
        ${this._tagHtml(this._z.tag, 60, false)}
        <div class="titel"><span>Auf diese Tage</span></div>
        ${this._zielprofileHtml()}
        ${this._kopierzieleHtml()}
        <p class="hinweis">Der Plan der gewählten Tage wird ersetzt, auch die Grundtemperatur.</p>`,
      fuss: `<button type="button" data-aktion="zurueck">Abbrechen</button>
        <button type="button" class="haupt" data-aktion="kopieren-ausfuehren" ${anzahl ? "" : "disabled"}>
          ${anzahl ? `Auf ${anzahl} ${anzahl === 1 ? "Tag" : "Tage"} kopieren` : "Tage wählen"}</button>`
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

    // Unsichtbares Zeitfeld ueber der angetippten Uhrzeit oeffnet die
    // Zeitauswahl des Geraets. 24:00 kennt es nicht: als Ende gilt 00:00 als 24:00.
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
    } else if (d.zielprofil) {
      z.kopierProfil = d.zielprofil;
      if (!z.wochen[d.zielprofil]) this._profilLaden(d.zielprofil);
    } else if (d.ziel) {
      const schluessel = this._kopierziel(z.kopierProfil, d.ziel);
      if (z.kopierziele.has(schluessel)) z.kopierziele.delete(schluessel);
      else z.kopierziele.add(schluessel);
    } else if (d.auswahl) {
      const schluessel = d.auswahl.split(",")
        .filter((t) => !this._istQuelle(z.kopierProfil, t))
        .map((t) => this._kopierziel(z.kopierProfil, t));
      const alleAn = schluessel.every((s) => z.kopierziele.has(s));
      schluessel.forEach((s) => (alleAn ? z.kopierziele.delete(s) : z.kopierziele.add(s)));
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
      z.kopierziele = new Set();
      z.kopierProfil = z.profil;
      z.ansicht = "kopieren";
    } else if (d.aktion === "kopieren-ausfuehren") this._kopierenAusfuehren();
    else if (d.aktion === "zurueck") z.ansicht = "tag";
    else if (d.aktion === "neu-laden") this._profilLaden(z.profil);
    else if (d.aktion === "ziel-neu-laden") this._profilLaden(z.kopierProfil);
    else if (d.aktion === "speichern") {
      this._speichern();
      return;
    } else if (d.aktion === "schliessen") {
      this._schliessenAnfragen();
      return;
    } else if (d.zeile !== undefined) z.gewaehlt = z.gewaehlt === Number(d.zeile) ? null : Number(d.zeile);
    else return;
    this._zeichnen();
    if (d.aktion === "hinzufuegen") {
      const zeile = this._blatt.querySelector(`[data-zeile="${z.gewaehlt}"]`);
      if (zeile) zeile.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}
