import { BEWEGUNGSSCHWELLE_PX, HALTEDAUER_MS, RAND_BEARBEITEN_PX } from "../konstanten.js";

/** Gesten, Bearbeitungsmodus und Einstieg ins Heizprofil; wird in die Karte eingebaut. */
export class BedienungTeil {
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
    void balken.offsetWidth; // Neuberechnung erzwingen, sonst startet die Animation nicht
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
}
