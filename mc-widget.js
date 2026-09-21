/* =====================================================================
   MentalClass · Widget (solo versione app da store)
   Parte WEB del widget: scrive le frasi nella "cassetta condivisa"
   (App Group) che il widget nativo legge, e gli dice di aggiornarsi.
   Nel browser non fa nulla.
   ===================================================================== */
(function () {
  "use strict";

  /* DEVE combaciare col codice nativo (FraseWidget.swift) e con
     l'App Group impostato in Xcode. */
  var APP_GROUP     = "group.it.mentalclass.mentalclass";
  var CHIAVE_FRASE  = "frase_del_giorno";
  var CHIAVE_AUTORE = "autore_del_giorno";
  var CHIAVE_LISTA  = "frasi_widget";   /* JSON array [{q,a}] per la rotazione */

  function plugin() {
    try {
      var P = window.Capacitor && window.Capacitor.Plugins;
      if (!P) return null;
      /* Il nome registrato dal plugin capacitor-widget-bridge e' WidgetBridgePlugin.
         Provo quello, poi eventuali varianti, per sicurezza. */
      return P.WidgetBridgePlugin || P.WidgetsBridgePlugin || P.WidgetBridge || null;
    } catch (e) { return null; }
  }
  function eApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  var MCW = {
    /* frase singola (compatibilità) */
    aggiorna: async function (frase, autore) {
      var p = plugin();
      if (!p || !eApp() || !frase) return;
      try {
        await p.setItem({ group: APP_GROUP, key: CHIAVE_FRASE,  value: String(frase) });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_AUTORE, value: String(autore || "MentalClass") });
        await p.reloadAllTimelines();
      } catch (e) {}
    },

    /* LISTA di frasi che il widget fa ruotare durante il giorno */
    aggiornaLista: async function (frasi) {
      var p = plugin();
      if (!p || !eApp() || !frasi || !frasi.length) return;
      try {
        /* normalizzo e limito a 12 per non appesantire la cassetta */
        var puliti = frasi.slice(0, 12).map(function (f) {
          return {
            q: String((f.q || f.testo || "")).replace(/^["“]|["”]$/g, ""),
            a: String(f.a || f.autore || "MentalClass")
          };
        }).filter(function (x) { return x.q; });
        if (!puliti.length) return;
        await p.setItem({ group: APP_GROUP, key: CHIAVE_LISTA, value: JSON.stringify(puliti) });
        /* scrivo anche la prima come singola, per i widget che leggono quella */
        await p.setItem({ group: APP_GROUP, key: CHIAVE_FRASE,  value: puliti[0].q });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_AUTORE, value: puliti[0].a });
        await p.reloadAllTimelines();
      } catch (e) {}
    }
  };

  window.MCW = MCW;
})();
