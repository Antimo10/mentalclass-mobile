/* =====================================================================
   MENTALCLASS · ACQUISTI IN-APP (App Store e Google Play) con RevenueCat
   Solo nell'app da telefono. Sul sito e nella webapp si paga con Stripe.

   PRIMA DI PUBBLICARE incolla qui sotto le chiavi pubbliche di RevenueCat
   (RevenueCat → Project settings → API keys → "Public app-specific key").
   Sono chiavi pubbliche: possono stare nel codice.
   ===================================================================== */
(function(){
  var CHIAVE_IOS     = 'appl_HgEenTknhyoTCFByeDLfvvKfZmC';   // chiave pubblica iOS di RevenueCat
  var CHIAVE_ANDROID = '';   // inizia con goog_
  var ENTITLEMENT    = 'mentalclass_pro';   /* identificativo dell'entitlement su RevenueCat */

  var pronto = false, utenteCollegato = null, offerte = null;
  var premiumStore = false;   /* Premium confermato da Apple/RevenueCat su questo telefono */

  /* Chiede al server di leggere lo stato da RevenueCat e aggiornare il profilo */
  async function sincronizza(){
    try{
      var sb = window.MC && MC.client && MC.client();
      if(!sb || !sb.functions) return null;
      var r = await sb.functions.invoke('sincronizza-abbonamento', { body: {} });
      try{ if(window.MC && MC.caricaProfilo) await MC.caricaProfilo(); }catch(e){}
      return r && r.data;
    }catch(e){ console.warn('Sincronizzazione abbonamento:', e && e.message); return null; }
  }
  function aggiornaSchermate(){
    try{ if(typeof window.applicaProfilo === 'function') window.applicaProfilo(); }catch(e){}
  }
  function premiumLocale(){ return premiumStore && !!utenteCollegato; }
  async function leggiStato(){
    var P = plugin();
    if(!P || !pronto) return false;
    try{ var r = await P.getCustomerInfo(); premiumStore = attivo(r && r.customerInfo); }catch(e){}
    return premiumStore;
  }

  function plugin(){
    var C = window.Capacitor;
    if(!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    if(C.Plugins && C.Plugins.Purchases) return C.Plugins.Purchases;
    try{ return C.registerPlugin ? C.registerPlugin('Purchases') : null; }catch(e){ return null; }
  }
  function piattaforma(){
    try{ return window.Capacitor.getPlatform(); }catch(e){ return 'ios'; }
  }
  function chiave(){ return piattaforma() === 'android' ? CHIAVE_ANDROID : CHIAVE_IOS; }

  /* Avvio: collega gli acquisti all'utente MentalClass (id Supabase),
     così il server sa a chi attivare il Premium. */
  async function avvia(userId){
    var P = plugin();
    if(!P || !chiave() || !userId) return false;
    try{
      var nuovo = false;
      if(!pronto){
        await P.configure({ apiKey: chiave(), appUserID: userId });
        pronto = true; utenteCollegato = userId; nuovo = true;
      } else if(utenteCollegato !== userId){
        await P.logIn({ appUserID: userId });
        utenteCollegato = userId; nuovo = true;
      }
      /* solo al primo collegamento: leggo lo stato dallo store e allineo il profilo */
      if(nuovo) leggiStato().then(function(ok){ if(ok) sincronizza().then(aggiornaSchermate); });
      return true;
    }catch(e){ console.warn('Acquisti:', e && e.message); return false; }
  }

  async function esci(){
    var P = plugin();
    if(!P || !pronto) return;
    try{ await P.logOut(); }catch(e){}
    utenteCollegato = null; premiumStore = false;
  }

  function disponibile(){ return !!plugin() && !!chiave(); }

  /* I due piani con il prezzo vero dello store (in euro, già localizzato) */
  async function piani(){
    var P = plugin();
    if(!P || !pronto) return null;
    try{
      var r = await P.getOfferings();
      var cur = r && (r.current || (r.all && r.all['default']));
      if(!cur || !cur.availablePackages) return null;
      var out = { mensile:null, annuale:null };
      cur.availablePackages.forEach(function(p){
        /* riconosco il piano dal tipo di pacchetto, dal suo nome o dal prodotto Apple */
        var tipo = [p.packageType, p.identifier, p.product && p.product.identifier].join(' ').toUpperCase();
        if(/ANNUAL|ANNUALE|YEAR/.test(tipo)) out.annuale = out.annuale || p;
        else if(/MONTHLY|MENSILE|MONTH/.test(tipo)) out.mensile = out.mensile || p;
      });
      offerte = out;
      return out;
    }catch(e){ console.warn('Offerte:', e && e.message); return null; }
  }

  /* Premium attivo: l'entitlement MentalClass, oppure qualsiasi entitlement attivo
     (cosi' un cambio di nome su RevenueCat non blocca chi ha pagato) */
  function attivo(info){
    try{
      var att = info && info.entitlements && info.entitlements.active;
      if(!att) return false;
      return !!(att[ENTITLEMENT] || att.premium || Object.keys(att).length > 0);
    }catch(e){ return false; }
  }

  /* Acquisto: true = Premium attivo, false = annullato dalla persona */
  async function compra(codicePiano){
    var P = plugin();
    if(!P || !pronto) throw new Error('Acquisti non disponibili in questo momento.');
    if(!offerte) await piani();
    var pk = offerte && offerte[codicePiano];
    if(!pk) throw new Error('Questo piano non è disponibile in questo momento.');
    try{
      var r = await P.purchasePackage({ aPackage: pk });
      premiumStore = attivo(r && r.customerInfo);
      if(premiumStore) await sincronizza();
      return premiumStore;
    }catch(e){
      if(e && (e.userCancelled || (e.data && e.data.userCancelled) || String(e.code) === '1' || /cancel/i.test(String(e.message || '')))) return false;
      throw new Error((e && e.message) || 'Acquisto non riuscito.');
    }
  }

  /* "Ripristina acquisti" (obbligatorio per Apple) */
  async function ripristina(){
    var P = plugin();
    if(!P || !pronto) throw new Error('Acquisti non disponibili in questo momento.');
    var r = await P.restorePurchases();
    premiumStore = attivo(r && r.customerInfo);
    await sincronizza();
    return premiumStore;
  }

  /* Pagina dello store per gestire o disdire l'abbonamento */
  async function gestisci(){
    var url = piattaforma() === 'android'
      ? 'https://play.google.com/store/account/subscriptions'
      : 'https://apps.apple.com/account/subscriptions';
    var P = plugin();
    try{
      if(P && pronto){
        var r = await P.getCustomerInfo();
        if(r && r.customerInfo && r.customerInfo.managementURL) url = r.customerInfo.managementURL;
      }
    }catch(e){}
    try{ var w = window.open(url, '_blank'); if(!w) window.location.href = url; }catch(e){ window.location.href = url; }
  }

  /* Codici promozionali di Apple (creati in App Store Connect → Codici offerta) */
  async function riscattaCodice(){
    var P = plugin();
    if(!P || !pronto) throw new Error('Acquisti non disponibili in questo momento.');
    if(piattaforma() !== 'ios' || !P.presentCodeRedemptionSheet) throw new Error('Disponibile su iPhone.');
    await P.presentCodeRedemptionSheet();
    return true;
  }

  window.MCI = { avvia: avvia, esci: esci, disponibile: disponibile, piani: piani,
                 compra: compra, ripristina: ripristina, gestisci: gestisci, riscattaCodice: riscattaCodice,
                 sincronizza: sincronizza, premiumLocale: premiumLocale };
})();
