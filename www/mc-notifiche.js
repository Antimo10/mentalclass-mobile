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

  /* ---- Orari sempre sul fuso di Roma, qualunque sia il fuso del telefono ---- */
  function partiRoma(d){
    var f = new Intl.DateTimeFormat("en-US", { timeZone:"Europe/Rome", year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
    var o = {};
    f.formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
    return { y:+o.year, mo:+o.month - 1, d:+o.day, h:(+o.hour) % 24, mi:+o.minute, s:+o.second };
  }
  /* l'istante esatto in cui a Roma sono le h:mi del giorno indicato */
  function dataRoma(y, mo, d, h, mi) {
    var voluto = Date.UTC(y, mo, d, h, mi, 0), t = voluto;
    for (var k = 0; k < 2; k++) {
      var p = partiRoma(new Date(t));
      t -= Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s) - voluto;
    }
    return new Date(t);
  }
  function dataRomaDaStringa(ds, h, mi) {
    var x = String(ds).slice(0, 10).split("-");
    return dataRoma(+x[0], +x[1] - 1, +x[2], h, mi);
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
      /* cancello solo le frasi (id 1000-1999): promemoria sfide, riepilogo e novita' restano */
      try {
        var inCoda = await p.getPending();
        var mie = (inCoda && inCoda.notifications || []).filter(function (n) { return n.id >= 1000 && n.id < 2000; });
        if (mie.length) await p.cancel({ notifications: mie });
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
      var R = partiRoma(oggi);
      var idx = 0;

      for (var g = 0; g < giorni; g++) {
        for (var k = 0; k < perDay; k++) {
          /* distribuisco gli orari nella fascia: k-esimo slot */
          var minuto = (perDay === 1)
            ? minInizio
            : Math.round(minInizio + (minFine - minInizio) * (k / (perDay - 1)));
          var h = Math.floor(minuto / 60), m = minuto % 60;

          var quando = dataRoma(R.y, R.mo, R.d + g, h, m);
          if (quando.getTime() < Date.now() + 60000) continue;   /* orario già passato */

          var delGiorno = (contenuti && contenuti.giorni && contenuti.giorni[g] && contenuti.giorni[g].length) ? contenuti.giorni[g] : null;
          var f = delGiorno ? delGiorno[k % delGiorno.length] : frasi[idx % frasi.length]; idx++;
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

    /* Novità programmate: contenuti (rivista/audio/percorso) con data di uscita
       futura. Notifica alle 09:00 del giorno di uscita. Max 8. */
    programmaNovita: async function (items) {
      var p = plugin();
      if (!p || !eApp()) return;
      var validi = (items || [])
        .filter(function (x) { return x && x.data_uscita; })
        .map(function (x) {
          return { x: x, when: dataRomaDaStringa(x.data_uscita, 9, 0) };
        })
        .filter(function (o) { return o.when.getTime() > Date.now() + 60000; })
        .sort(function (a, b) { return a.when - b.when; })
        .slice(0, 8);
      var nuove = validi.map(function (o, i) {
        var t = o.x.tipo === 'rivista' ? 'Nuovo numero del Magazine'
              : o.x.tipo === 'percorso' ? 'Nuovo percorso audio'
              : 'Nuovo audio';
        return {
          id: 4000 + i,
          title: t,
          body: '"' + (o.x.titolo || '') + '" è disponibile da oggi. Aprilo ora.',
          schedule: { at: o.when, allowWhileIdle: true },
          channelId: CANALE,
          smallIcon: 'ic_stat_icon',
          extra: { tipo: 'novita' }
        };
      });
      if (nuove.length) { try { await p.schedule({ notifications: nuove }); } catch (e) {} }
    },

    /* Promemoria sfide: 1 giorno prima della chiusura iscrizioni, alle 10:00.
       Programma al massimo le 5 sfide con chiusura futura più vicina. */
    programmaSfide: async function (sfide) {
      var p = plugin();
      if (!p || !eApp()) return;
      var validi = (sfide || [])
        .filter(function (sf) { return sf && sf.data_chiusura; })
        .map(function (sf) {
          var ch = dataRomaDaStringa(sf.data_chiusura, 10, 0);
          var when = new Date(ch.getTime() - 24 * 60 * 60 * 1000); /* 1 giorno prima */
          return { sf: sf, when: when };
        })
        .filter(function (x) { return x.when.getTime() > Date.now() + 60000; })
        .sort(function (a, b) { return a.when - b.when; })
        .slice(0, 5);
      var nuove = validi.map(function (x, i) {
        return {
          id: 3000 + i,
          title: 'Ultimo giorno per iscriverti',
          body: '"' + (x.sf.titolo || 'Una sfida') + '": le iscrizioni chiudono domani. Entra ora.',
          schedule: { at: x.when, allowWhileIdle: true },
          channelId: CANALE,
          smallIcon: 'ic_stat_icon',
          extra: { tipo: 'sfida' }
        };
      });
      if (nuove.length) { try { await p.schedule({ notifications: nuove }); } catch (e) {} }
    },

    /* Riepilogo settimanale: una notifica la domenica sera (prossime 4 domeniche). */
    programmaRiepilogo: async function () {
      var p = plugin();
      if (!p || !eApp()) return;
      var nuove = [];
      var oggi = new Date();
      var count = 0;
      for (var g = 0; g < 30 && count < 4; g++) {
        var R2 = partiRoma(oggi);
        if (new Date(Date.UTC(R2.y, R2.mo, R2.d + g)).getUTCDay() !== 0) continue;   /* 0 = domenica */
        var d = dataRoma(R2.y, R2.mo, R2.d + g, 19, 0);
        if (d.getTime() < Date.now() + 60000) continue;
        nuove.push({
          id: 2000 + count,
          title: 'MentalClass',
          body: 'La tua settimana è pronta: guarda quanto hai allenato la mente. 💪',
          schedule: { at: d, allowWhileIdle: true },
          channelId: CANALE,
          smallIcon: 'ic_stat_icon',
          extra: { tipo: 'riepilogo' }
        });
        count++;
      }
      if (nuove.length) { try { await p.schedule({ notifications: nuove }); } catch (e) {} }
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
