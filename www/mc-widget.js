/* =====================================================================
   MentalClass · Widget (solo versione app da store)
   Scrive le frasi nella "cassetta condivisa" (App Group) che il widget
   nativo legge, poi chiede a iOS di ridisegnarlo. Nel browser non fa nulla.
   Include una DIAGNOSTICA che mostra a schermo dove si blocca la catena.
   ===================================================================== */
(function () {
  "use strict";

  var APP_GROUP     = "group.it.mentalclass.mentalclass"; /* = FraseWidget.swift */
  var CHIAVE_FRASE  = "frase_del_giorno";
  var CHIAVE_AUTORE = "autore_del_giorno";
  var CHIAVE_LISTA  = "frasi_widget";

  function eApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  /* Trova il plugin: prima tra quelli gia' esposti, poi registrandolo per nome. */
  function plugin() {
    try {
      var C = window.Capacitor;
      if (!C) return null;
      var P = C.Plugins || {};
      if (P.WidgetBridgePlugin) return P.WidgetBridgePlugin;
      if (typeof C.registerPlugin === "function") {
        if (!window.__mcWBP) window.__mcWBP = C.registerPlugin("WidgetBridgePlugin");
        return window.__mcWBP;
      }
      return null;
    } catch (e) { return null; }
  }

  function pulisci(frasi) {
    return (frasi || []).slice(0, 12).map(function (f) {
      return {
        q: String(f.q || f.testo || "").replace(/^["“]|["”]$/g, "").trim(),
        a: String(f.a || f.autore || "MentalClass")
      };
    }).filter(function (x) { return x.q; });
  }

  var MCW = {
    ultimoErrore: null,
    ultimaScrittura: null,

    aggiorna: async function (frase, autore) {
      if (!frase) return false;
      return MCW.aggiornaLista([{ q: frase, a: autore }]);
    },

    aggiornaLista: async function (frasi) {
      var p = plugin();
      if (!p || !eApp()) { MCW.ultimoErrore = "plugin non disponibile"; return false; }
      var lista = pulisci(frasi);
      if (!lista.length) { MCW.ultimoErrore = "nessuna frase da scrivere"; return false; }
      try {
        await p.setItem({ group: APP_GROUP, key: CHIAVE_LISTA,  value: JSON.stringify(lista) });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_FRASE,  value: lista[0].q });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_AUTORE, value: lista[0].a });
        try { await p.reloadAllTimelines(); } catch (e) {}
        MCW.ultimoErrore = null;
        MCW.ultimaScrittura = new Date().toISOString();
        return true;
      } catch (e) {
        MCW.ultimoErrore = (e && e.message) ? e.message : String(e);
        return false;
      }
    },

    /* Programma completo: stessi contenuti e stessi orari delle notifiche.
       Ogni voce: { t: secondi, tipo, k: intestazione, q: testo, a, w: parola,
       pf/pd: punto forte/debole, c: consiglio }. Il widget cambia da solo
       all'orario di ogni voce, anche ad app chiusa. */
    aggiornaProgramma: async function (voci) {
      var p = plugin();
      if (!p || !eApp()) { MCW.ultimoErrore = "plugin non disponibile"; return false; }
      var lista = (voci || []).filter(function (v) { return v && v.q; }).slice(0, 160).map(function (v) {
        var o = { q: String(v.q).replace(/^["“]|["”]$/g, "").trim(), a: String(v.a || "MentalClass"), t: v.t || 0, tipo: v.tipo || "frase", k: v.k || "" };
        if (v.w) o.w = v.w; if (v.pf) o.pf = v.pf; if (v.pd) o.pd = v.pd; if (v.c) o.c = v.c;
        return o;
      });
      if (!lista.length) return false;
      var ora = Date.now() / 1000, adesso = lista[0];
      lista.forEach(function (v) { if (v.t && v.t <= ora) adesso = v; });
      try {
        await p.setItem({ group: APP_GROUP, key: CHIAVE_LISTA,  value: JSON.stringify(lista) });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_FRASE,  value: adesso.q });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_AUTORE, value: adesso.a });
        try { await p.reloadAllTimelines(); } catch (e) {}
        MCW.ultimoErrore = null;
        MCW.ultimaScrittura = new Date().toISOString();
        return true;
      } catch (e) {
        MCW.ultimoErrore = (e && e.message) ? e.message : String(e);
        return false;
      }
    },

    /* Esegue ogni passaggio e restituisce un resoconto leggibile */
    diagnostica: async function (frasiAttuali) {
      var r = [];
      r.push("App nativa: " + (eApp() ? "SI" : "NO"));
      var C = window.Capacitor;
      var nomi = [];
      try { nomi = Object.keys((C && C.Plugins) || {}); } catch (e) {}
      r.push("Plugin esposti: " + (nomi.length ? nomi.join(", ") : "nessuno"));
      var p = plugin();
      r.push("WidgetBridgePlugin: " + (p ? "TROVATO" : "NON TROVATO"));
      if (!p) return r.join("\n");

      var lista = pulisci(frasiAttuali);
      r.push("Frasi disponibili nell'app: " + lista.length);

      try {
        var prova = "ok-" + Date.now();
        await p.setItem({ group: APP_GROUP, key: "mc_test", value: prova });
        r.push("Scrittura cassetta: OK");
        try {
          var letto = await p.getItem({ group: APP_GROUP, key: "mc_test" });
          var val = letto && (letto.results !== undefined ? letto.results : letto.value);
          r.push("Rilettura: " + (String(val) === prova ? "OK" : "DIVERSA (" + JSON.stringify(letto) + ")"));
        } catch (e) { r.push("Rilettura: ERRORE " + (e && e.message ? e.message : e)); }
      } catch (e) {
        r.push("Scrittura cassetta: ERRORE " + (e && e.message ? e.message : e));
        return r.join("\n");
      }

      var ok = await MCW.aggiornaLista(frasiAttuali);
      r.push("Invio frasi al widget: " + (ok ? "OK (" + lista.length + ")" : "ERRORE " + MCW.ultimoErrore));
      r.push("Gruppo usato: " + APP_GROUP);
      return r.join("\n");
    }
  };

  window.MCW = MCW;
})();
