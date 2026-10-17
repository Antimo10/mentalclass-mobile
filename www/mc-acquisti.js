/* =====================================================================
   MENTALCLASS · ACQUISTI IN-APP (App Store e Google Play) con RevenueCat
   Solo nell'app da telefono. Sul sito e nella webapp si paga con Stripe.

   PRIMA DI PUBBLICARE incolla qui sotto le chiavi pubbliche di RevenueCat
   (RevenueCat → Project settings → API keys → "Public app-specific key").
   Sono chiavi pubbliche: possono stare nel codice.
   ===================================================================== */
(function(){
  var CHIAVE_IOS     = '';   // inizia con appl_
  var CHIAVE_ANDROID = '';   // inizia con goog_
  var ENTITLEMENT    = 'premium';

  var pronto = false, utenteCollegato = null, offerte = null;

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
      if(!pronto){
        await P.configure({ apiKey: chiave(), appUserID: userId });
        pronto = true; utenteCollegato = userId;
      } else if(utenteCollegato !== userId){
        await P.logIn({ appUserID: userId });
        utenteCollegato = userId;
      }
      return true;
    }catch(e){ console.warn('Acquisti:', e && e.message); return false; }
  }

  async function esci(){
    var P = plugin();
    if(!P || !pronto) return;
    try{ await P.logOut(); }catch(e){}
    utenteCollegato = null;
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
        var tipo = String(p.packageType || p.identifier || '').toUpperCase();
        if(tipo.indexOf('ANNUAL') !== -1) out.annuale = p;
        else if(tipo.indexOf('MONTHLY') !== -1) out.mensile = p;
      });
      offerte = out;
      return out;
    }catch(e){ console.warn('Offerte:', e && e.message); return null; }
  }

  function attivo(info){
    try{ return !!(info && info.entitlements && info.entitlements.active && info.entitlements.active[ENTITLEMENT]); }
    catch(e){ return false; }
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
      return attivo(r && r.customerInfo);
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
    return attivo(r && r.customerInfo);
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

  window.MCI = { avvia: avvia, esci: esci, disponibile: disponibile, piani: piani,
                 compra: compra, ripristina: ripristina, gestisci: gestisci };
})();
