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

  function minutiDa(str, deflt){
    if(!str) return deflt;
    var pz = String(str).split(':');
    var h = parseInt(pz[0],10), m = parseInt(pz[1]||'0',10);
    if(isNaN(h)) return deflt;
    return h*60 + (isNaN(m)?0:m);
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
    riprogramma: async function (contenuti, oraInizio, oraFine, perGiorno) {
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

      /* quante al giorno (impostate dall'utente, 1..5) e fascia oraria */
      var perDay = Math.max(1, Math.min(parseInt(perGiorno, 10) || 1, 5));
      var minInizio = minutiDa(oraInizio, 8 * 60);          /* default 08:00 */
      var minFine   = minutiDa(oraFine, 21 * 60);           /* default 21:00 */
      if (minFine <= minInizio) { minFine = minInizio + 60; }

      /* iOS accetta al massimo ~64 notifiche in coda: bilancio giorni × quantità */
      var giorni = GIORNI_DA_PROGRAMMARE;
      if (giorni * perDay > 60) { giorni = Math.floor(60 / perDay); }
      if (giorni < 1) giorni = 1;

      var nuove = [];
      var oggi = new Date();
      var idx = 0;

      for (var g = 0; g < giorni; g++) {
        for (var k = 0; k < perDay; k++) {
          /* distribuisco gli orari nella fascia: k-esimo slot */
          var minuto = (perDay === 1)
            ? minInizio
            : Math.round(minInizio + (minFine - minInizio) * (k / (perDay - 1)));
          var h = Math.floor(minuto / 60), m = minuto % 60;

          var quando = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + g, h, m, 0);
          if (quando.getTime() < Date.now() + 60000) continue;   /* orario già passato */

          var f = frasi[idx % frasi.length]; idx++;
          var testo = (f && (f.testo || f.q)) || "";
          var autore = (f && (f.autore || f.a)) || "";
          if (!testo) continue;

          nuove.push({
            id: 1000 + g * 10 + k,          /* id univoco e stabile per giorno+slot */
            title: "MentalClass",
            body: autore ? (testo + " — " + autore) : testo,
            schedule: { at: quando, allowWhileIdle: true },
            channelId: CANALE,
            smallIcon: "ic_stat_icon",
            extra: { tipo: "frase" }
          });
        }
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
    },

    /* Notifica di PROVA: la manda tra ~8 secondi, per verificare subito che
       permesso e consegna funzionino. Restituisce un messaggio da mostrare. */
    provaSubito: async function () {
      var p = plugin();
      if (!p || !eApp()) return { ok:false, msg:'Le notifiche funzionano solo nell\'app installata.' };
      try {
        var ok = await MCN.chiediPermesso();
        if (!ok) return { ok:false, msg:'Permesso notifiche negato. Vai su Impostazioni iPhone → MentalClass → Notifiche e attivale.' };
        var quando = new Date(Date.now() + 8000);
        await p.schedule({ notifications: [{
          id: 999,
          title: 'MentalClass',
          body: 'Se leggi questo, le notifiche funzionano. Blocca il telefono per vederle arrivare.',
          schedule: { at: quando, allowWhileIdle: true },
          channelId: CANALE,
          extra: { tipo:'prova' }
        }]});
        return { ok:true, msg:'Notifica di prova inviata. Blocca lo schermo: arriva tra qualche secondo.' };
      } catch (e) {
        return { ok:false, msg:'Errore: ' + (e && e.message ? e.message : 'imprevisto') };
      }
    }
  };

  window.MCN = MCN;
})();
