/* =====================================================================
   MentalClass · Notifiche giornaliere (solo versione app da store)
   ---------------------------------------------------------------------
   Programma sul telefono le notifiche con frasi, pensieri, dizionario e
   oroscopo, all'orario della fascia scelta dall'utente. Funzionano anche
   ad app chiusa, senza bisogno di un server (notifiche "locali").

   COME FUNZIONA
   Il telefono non può programmare notifiche all'infinito: iOS ne tiene
   al massimo ~64 in coda. Quindi programmiamo i PROSSIMI 14 GIORNI ogni
   volta che l'utente apre l'app. Alla riapertura successiva, ne
   programmiamo altri 14 con contenuti freschi. Così la coda resta sempre
   piena senza superare i limiti.

   Nel browser (sito) questo file non fa nulla: le notifiche locali sono
   una funzione del telefono, non del web.
   ===================================================================== */

(function () {
  "use strict";

  var GIORNI_DA_PROGRAMMARE = 14;
  var CANALE = "mentalclass-giornaliere";

  /* Il plugin arriva solo dentro l'app Capacitor. Nel browser è assente. */
  function plugin() {
    try {
      return window.Capacitor &&
             window.Capacitor.Plugins &&
             window.Capacitor.Plugins.LocalNotifications;
    } catch (e) { return null; }
  }

  function eApp() {
    return !!(window.Capacitor &&
              window.Capacitor.isNativePlatform &&
              window.Capacitor.isNativePlatform());
  }

  /* "08:00" -> 8 ; "18:30" -> 18 (prendiamo l'ora della fascia di inizio) */
  function oraDa(fascia) {
    var h = parseInt(String(fascia || "09:00").slice(0, 2), 10);
    return isNaN(h) ? 9 : h;
  }

  var MCN = {

    /* Chiede il permesso di inviare notifiche. Da chiamare una volta,
       tipicamente dopo che l'utente ha scelto la fascia oraria. */
    chiediPermesso: async function () {
      var p = plugin();
      if (!p) return false;
      try {
        var stato = await p.requestPermissions();
        return stato && stato.display === "granted";
      } catch (e) { return false; }
    },

    /* Cuore del sistema: cancella le notifiche vecchie e ne programma
       di nuove per i prossimi giorni.
       - contenuti: { frasi:[...], pensiero:{}, dizionario:{}, oroscopo:{} }
       - oraInizio: la fascia scelta, es. "08:00"
    */
    riprogramma: async function (contenuti, oraInizio) {
      var p = plugin();
      if (!p || !eApp()) return;

      /* 1. pulisco le notifiche già in coda (evito doppioni) */
      try {
        var inCoda = await p.getPending();
        if (inCoda && inCoda.notifications && inCoda.notifications.length) {
          await p.cancel({ notifications: inCoda.notifications });
        }
      } catch (e) {}

      /* 2. preparo la lista dei contenuti da ruotare */
      var frasi = (contenuti && contenuti.frasi) || [];
      if (!frasi.length) return;   /* senza frasi non programmo nulla */

      var ora = oraDa(oraInizio);
      var nuove = [];
      var oggi = new Date();

      for (var g = 0; g < GIORNI_DA_PROGRAMMARE; g++) {
        var quando = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + g, ora, 0, 0);
        /* se per oggi l'orario è già passato, salto al giorno dopo */
        if (quando.getTime() < Date.now() + 60000) continue;

        /* scelgo la frase ruotando nella lista */
        var f = frasi[g % frasi.length];
        var testo = (f && (f.testo || f.q)) || "";
        var autore = (f && (f.autore || f.a)) || "";
        if (!testo) continue;

        nuove.push({
          id: 1000 + g,                 /* id stabile per ogni giorno */
          title: "MentalClass",
          body: autore ? (testo + " — " + autore) : testo,
          schedule: { at: quando, allowWhileIdle: true },
          channelId: CANALE,
          smallIcon: "ic_stat_icon",
          extra: { tipo: "frase" }
        });
      }

      if (!nuove.length) return;
      try { await p.schedule({ notifications: nuove }); } catch (e) {}
    },

    /* Spegne tutte le notifiche (se l'utente le disattiva) */
    spegni: async function () {
      var p = plugin();
      if (!p) return;
      try {
        var inCoda = await p.getPending();
        if (inCoda && inCoda.notifications && inCoda.notifications.length) {
          await p.cancel({ notifications: inCoda.notifications });
        }
      } catch (e) {}
    }
  };

  window.MCN = MCN;
})();
