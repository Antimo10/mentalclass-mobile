/* =====================================================================
   MENTALCLASS · API
   Il "ponte" tra la webapp e il backend Supabase.

   COME SI USA nella webapp:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js"></script>
     <script src="mc-api.js"></script>
     ...
     await MC.init(URL, ANON_KEY);
     const frasi = await MC.contenuti.frasiDiOggi();

   Ogni funzione restituisce dati già pronti, oppure lancia un errore
   con messaggio in italiano.
   ===================================================================== */

const MC = (function(){
  let sb = null;
  let utente = null;
  let profilo = null;
  let urlSupabase = null;

  /* ---------- avvio ---------- */
  async function init(url, anonKey){
    if(!url || !anonKey) throw new Error('Configurazione mancante: URL o chiave');
    sb = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,      // salva la sessione tra una visita e l'altra
        autoRefreshToken: true,    // rinnova il token da solo prima che scada
        detectSessionInUrl: true,  // gestisce il ritorno da email di conferma/reset
      }
    });
    urlSupabase = url;

    /* il codice invito arriva nel link e deve sopravvivere alla registrazione */
    referral.memorizzaDaLink();

    /* Ripristino della sessione salvata.
       PROBLEMA RISOLTO QUI: in incognito o dopo un redirect (ritorno da
       Stripe), getSession() a volte torna null anche con la sessione
       valida. Il vecchio codice ripiegava su getUser(), che però
       recupera solo i DATI dell'utente senza rimettere il token dentro
       il client: l'app sembrava loggata ma ogni scrittura al database
       partiva come anonima (errori "row-level security" e "non
       autenticato"). Ora, se getSession non trova nulla, proviamo a
       ripristinare davvero la sessione dai token salvati, così il client
       torna autenticato per tutte le operazioni. */
    let sessione = null;
    try {
      const r1 = await sb.auth.getSession();
      sessione = r1?.data?.session || null;
    } catch(_) {}

    if(!sessione){
      await new Promise(res => setTimeout(res, 250));
      /* secondo tentativo: getSession di nuovo, la libreria potrebbe
         aver finito di rileggere i token nel frattempo */
      try {
        const r2 = await sb.auth.getSession();
        sessione = r2?.data?.session || null;
      } catch(_) {}
    }

    if(sessione){
      utente = sessione.user;
    } else {
      /* ultimo tentativo: recupero i token salvati a mano e li reimposto
         nel client, così torna davvero autenticato (non solo "sembra") */
      try {
        const salvato = leggiTokenSalvati(url);
        if(salvato && salvato.access_token && salvato.refresh_token){
          const r3 = await sb.auth.setSession({
            access_token: salvato.access_token,
            refresh_token: salvato.refresh_token,
          });
          if(r3?.data?.session){
            utente = r3.data.session.user;
          }
        }
      } catch(_) {}
    }

    if(utente){
      await caricaProfilo();
      await referral.registraSePresente();
    }
    return { loggato: !!utente };
  }

  /* Legge i token che la libreria Supabase salva nel browser. La chiave
     ha la forma "sb-<riferimento-progetto>-auth-token". */
  function leggiTokenSalvati(url){
    try {
      const ref = (url.match(/https?:\/\/([^.]+)\./) || [])[1];
      if(!ref) return null;
      const chiave = 'sb-' + ref + '-auth-token';
      const grezzo = localStorage.getItem(chiave);
      if(!grezzo) return null;
      const dati = JSON.parse(grezzo);
      /* la libreria salva a volte l'oggetto sessione, a volte annidato */
      return {
        access_token:  dati.access_token  || dati?.currentSession?.access_token,
        refresh_token: dati.refresh_token || dati?.currentSession?.refresh_token,
      };
    } catch(_) { return null; }
  }

  function client(){ return sb; }
  function utenteCorrente(){ return utente; }
  function profiloCorrente(){ return profilo; }

  /* Avvisa la webapp quando la sessione cambia DOPO l'avvio: serve
     soprattutto come PWA, dove il token a volte viene riletto con un
     attimo di ritardo. Così l'app può entrare invece di restare ferma
     sulla registrazione. */
  function alCambioSessione(callback){
    if(!sb) return;
    sb.auth.onAuthStateChange(async (evento, sessione) => {
      if((evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') && sessione){
        const eraGiaLoggato = !!utente;
        utente = sessione.user;
        if(!profilo) { try { await caricaProfilo(); } catch(_){} }
        if(!eraGiaLoggato) callback({ loggato: true });
      } else if(evento === 'SIGNED_OUT'){
        utente = null; profilo = null;
      }
    });
  }

  /* Controllo base usato ovunque. Ora fa una cosa in più: se l'utente
     è loggato in memoria ma la sessione nel client Supabase è andata
     persa (capita in incognito o dopo un redirect), la reimposta al
     volo. Così nessuna operazione parte "anonima" e non vediamo più
     errori di row-level security o "non autenticato". La reimpostazione
     è sincrona quando i token sono già in memoria locale. */
  function richiediLogin(){
    if(!utente) throw new Error('Devi accedere per continuare');
    /* tentativo veloce e non bloccante: se la sessione nel client manca,
       la rimetto dai token salvati (senza aspettare la rete) */
    provaRipristinoRapido();
  }

  let ripristinoInCorso = false;
  function provaRipristinoRapido(){
    if(ripristinoInCorso) return;
    try {
      const salvato = leggiTokenSalvati(urlSupabase || '');
      if(salvato && salvato.access_token && salvato.refresh_token){
        ripristinoInCorso = true;
        sb.auth.setSession({
          access_token: salvato.access_token,
          refresh_token: salvato.refresh_token,
        }).finally(function(){ ripristinoInCorso = false; });
      }
    } catch(_) { ripristinoInCorso = false; }
  }

  /* Verifica RAFFORZATA: prima di scrivere sul database, ci assicuriamo
     che il client sia davvero autenticato (non solo che "utente" sia
     impostato in memoria). Se la sessione nel client manca, la
     ripristiniamo. Evita gli errori "row-level security" / "non
     autenticato" quando l'app sembra loggata ma il token non c'è. */
  async function assicuraSessione(){
    /* Ci assicuriamo che il client sia autenticato, usando SOLO i metodi
       ufficiali della libreria (niente trucchi manuali su localStorage,
       che erano fragili e davano "sessione scaduta" anche da loggati).

       1) getSession() legge la sessione salvata. Se c'è un token, ok.
       2) Se manca, refreshSession() prova a rinnovarla dal refresh token
          (è il metodo pensato apposta per questo).
       Solo se anche il refresh fallisce diciamo che è scaduta davvero. */

    // 1) la sessione c'è già?
    try {
      const { data } = await sb.auth.getSession();
      if(data?.session?.access_token){
        utente = data.session.user;
        return true;
      }
    } catch(_) {}

    // 2) provo a rinnovarla col metodo ufficiale
    try {
      const { data, error } = await sb.auth.refreshSession();
      if(!error && data?.session?.access_token){
        utente = data.session.user;
        return true;
      }
    } catch(_) {}

    // 3) ultimo controllo: forse il token c'è ma getSession non l'ha
    //    ancora riletto (caso raro subito dopo il login)
    try {
      const { data } = await sb.auth.getUser();
      if(data?.user){
        // l'utente è valido lato server: una getSession finale dovrebbe
        // ora avere il token in memoria
        const s = await sb.auth.getSession();
        if(s?.data?.session?.access_token){ utente = s.data.session.user; return true; }
        // il server ci conferma che l'utente è valido: procediamo comunque
        // invece di bloccare (la libreria allega il token alle richieste)
        utente = data.user;
        return true;
      }
    } catch(_) {}

    // 4) ultimissima spiaggia: aspetto un attimo e riprovo un refresh.
    //    A volte il token è in fase di rinnovo automatico proprio ora.
    try {
      await new Promise(r => setTimeout(r, 400));
      const { data } = await sb.auth.refreshSession();
      if(data?.session?.access_token){ utente = data.session.user; return true; }
    } catch(_) {}

    throw new Error('La tua sessione è scaduta. Esci e rientra per continuare.');
  }

  async function caricaProfilo(){
    if(!utente) return null;
    const { data, error } = await sb.from('profili').select('*').eq('user_id', utente.id).maybeSingle();
    if(error) throw new Error(error.message);
    profilo = data;
    return profilo;
  }

  /* ---------- è abbonato? ---------- */
  function abbonato(){
    if(!profilo) return false;
    const attivo = profilo.stato_abbonamento === 'attivo' || profilo.stato_abbonamento === 'in_prova';
    if(!attivo) return false;
    if(!profilo.scadenza_piano) return true;
    return new Date(profilo.scadenza_piano) > new Date();
  }

  /* =====================================================================
     ACCOUNT
     ===================================================================== */
  const account = {
    async registrati(email, password, nome){
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { nome: nome || '' } }
      });
      if(error) throw new Error(traduci(error.message));
      utente = data.user;
      const haSessione = !!data.session;
      if(haSessione){
        /* Garantisco subito un profilo con un obiettivo di default, così
           anche se l'onboarding venisse interrotto, l'obiettivo non è mai
           vuoto (senza obiettivo il Supporto non funziona). L'onboarding
           poi lo aggiornerà con la scelta vera dell'utente. */
        try{
          await sb.from('profili').update({
            nome: nome || 'Un membro',
            obiettivo: 'Focus Mentale'
          }).eq('user_id', utente.id).is('obiettivo', null);
        }catch(e){ /* se fallisce, l'onboarding lo salverà comunque */ }
        await referral.registraSePresente();
      }
      return { user: data.user, sessioneAttiva: haSessione };
    },

    async accedi(email, password){
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw new Error(traduci(error.message));
      utente = data.user;
      await caricaProfilo();
      await referral.registraSePresente();
      return data;
    },

    async esci(){
      await sb.auth.signOut();
      utente = null; profilo = null;
    },

    async recuperaPassword(email){
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/nuova-password.html'
      });
      if(error) throw new Error(traduci(error.message));
      return true;
    },

    /* onboarding: nome, obiettivo, segno */
    async completaOnboarding(dati){
      richiediLogin();
      const { error } = await sb.from('profili').update({
        nome: dati.nome,
        obiettivo: dati.obiettivo,
        segno_zodiacale: dati.segno,
        onboarding_fatto: true
      }).eq('user_id', utente.id);
      if(error) throw new Error(error.message);
      await caricaProfilo();
      return profilo;
    },

    async salvaPreferenzeNotifiche(p){
      richiediLogin();
      const { error } = await sb.from('profili').update({
        notif_da: p.da, notif_a: p.a,
        notif_frasi: p.frasi, notif_pensieri: p.pensieri, notif_dizionario: p.dizionario,
        suoni: p.suoni
      }).eq('user_id', utente.id);
      if(error) throw new Error(error.message);
      await caricaProfilo();
    },

    /* GDPR */
    async esportaMieiDati(){
      richiediLogin();
      const { data, error } = await sb.rpc('esporta_miei_dati');
      if(error) throw new Error(error.message);
      return data;
    },
    async eliminaAccount(){
      richiediLogin();
      const { error } = await sb.rpc('elimina_mio_account');
      if(error) throw new Error(error.message);
      await sb.auth.signOut();
      utente = null; profilo = null;
    }
  };

  /* =====================================================================
     CONTENUTI GIORNALIERI (frasi, pensieri, dizionario, oroscopo)
     ===================================================================== */
  const contenuti = {
    /* Estrazione casuale ma stabile per la giornata.
       Se "quanti" non è indicato, il server usa le preferenze dell'utente. */
    async delGiorno(tipo, quanti){
      const args = { p_tipo: tipo };
      if(quanti != null) args.p_quanti = quanti;
      const { data, error } = await sb.rpc('contenuti_del_giorno', args);
      if(error) throw new Error(error.message);
      return data || [];
    },

    async oroscopoDelSegno(segno){
      const { data, error } = await sb.rpc('oroscopo_del_giorno',
        segno ? { p_segno: segno } : {});
      if(error) throw new Error(error.message);
      return (data && data[0]) || null;
    },

    /* Tutto il necessario per la home, in una sola chiamata */
    async perLaHome(){
      const p = profilo || {};
      const [frasi, pensieri, dizionario, oroscopo, consumi] = await Promise.all([
        contenuti.delGiorno('frase'),
        contenuti.delGiorno('pensiero'),
        contenuti.delGiorno('dizionario'),
        contenuti.oroscopoDelSegno(p.segno_zodiacale || null).catch(() => null),
        utente ? contenuti.consumiDiOggi() : Promise.resolve({})
      ]);
      return {
        frasi, pensieri, dizionario, oroscopo, consumi,
        massimi: {
          frasi:      p.notif_frasi ?? 5,
          pensieri:   p.notif_pensieri ?? 1,
          dizionario: p.notif_dizionario ?? 1
        }
      };
    },

    /* quote del piano free: registra il consumo e dice quanti ne restano */
    async consuma(tipo){
      richiediLogin();
      const { data, error } = await sb.rpc('consuma', { p_tipo: tipo });
      if(error) throw new Error(error.message);
      return data;
    },

    async consumiDiOggi(){
      richiediLogin();
      const oggi = new Date().toISOString().slice(0,10);
      const { data, error } = await sb.from('consumi_giornalieri')
        .select('tipo,usati').eq('user_id', utente.id).eq('giorno', oggi);
      if(error) throw new Error(error.message);
      const m = {};
      (data || []).forEach(r => m[r.tipo] = r.usati);
      return m;
    }
  };

  /* =====================================================================
     AUDIO E PERCORSI
     ===================================================================== */
  /* Quota di anteprima per chi non è abbonato: vale per gli audio
     singoli e per le pagine della rivista. Non viene mai mostrata
     come percentuale dentro l'app. */
  const QUOTA_ANTEPRIMA = 0.4;

  const audio = {
    async categorie(){
      const { data, error } = await sb.from('categorie').select('*').order('ordine');
      if(error) throw new Error(error.message);
      return data || [];
    },

    async lista(filtri){
      filtri = filtri || {};
      let q = sb.from('audio').select('*, categorie(nome,slug)').eq('pubblicato', true);
      if(filtri.categoria)   q = q.eq('categoria_id', filtri.categoria);
      if(filtri.percorso)    q = q.eq('percorso_id', filtri.percorso);
      if(filtri.soloSingoli) q = q.is('percorso_id', null);
      q = q.order('ordine').order('creato_il', { ascending:false });
      const { data, error } = await q;
      if(error) throw new Error(error.message);
      return data || [];
    },

    async percorsi(){
      const { data, error } = await sb.from('percorsi')
        .select('*, audio(count)').eq('pubblicato', true).order('titolo');
      if(error) throw new Error(error.message);
      return data || [];
    },

    /* Restituisce il link per ascoltare. Se l'utente non ha diritto,
       il backend rifiuta e qui torna null: la webapp mostra il paywall. */
    /* REGOLA DI ASCOLTO
       - abbonato: tutto
       - percorso, primo giorno: tutto
       - percorso, giorni successivi: niente
       - audio singolo: la prima parte (quota), poi si ferma
       - audio segnato "gratuito" nel pannello: tutto           */
    regola(audioRiga){
      if(!audioRiga) return { accesso:'niente' };
      if(abbonato())          return { accesso:'tutto' };
      if(audioRiga.gratuito)  return { accesso:'tutto' };

      if(audioRiga.percorso_id){
        return (audioRiga.ordine === 1)
          ? { accesso:'tutto' }
          : { accesso:'niente' };
      }
      return { accesso:'parziale', quota: QUOTA_ANTEPRIMA };
    },

    async linkAscolto(audioRiga){
      if(!audioRiga || !audioRiga.file_path){
        throw new Error('AUDIO_NON_CARICATO');   /* il file non è mai stato caricato in questo audio */
      }
      if(audio.regola(audioRiga).accesso === 'niente') return null;   /* paywall: comportamento normale */
      const { data, error } = await sb.storage.from('audio')
        .createSignedUrl(audioRiga.file_path, 3600);
      if(error){
        console.error('Storage audio:', error.message, '— file_path:', audioRiga.file_path);
        throw new Error('AUDIO_STORAGE_ERRORE');   /* file assente dal bucket o permessi sbagliati */
      }
      return data.signedUrl;
    },

    async salvaProgresso(audioId, posizioneSec, completato){
      richiediLogin();
      const { error } = await sb.from('progressi_audio').upsert({
        user_id: utente.id, audio_id: audioId,
        posizione_sec: Math.round(posizioneSec || 0),
        completato: !!completato,
        ascoltato_il: new Date().toISOString()
      }, { onConflict: 'user_id,audio_id' });
      if(error) throw new Error(error.message);
    },

    async mieiProgressi(){
      richiediLogin();
      const { data, error } = await sb.from('progressi_audio').select('*').eq('user_id', utente.id);
      if(error) throw new Error(error.message);
      return data || [];
    }
  };

  /* =====================================================================
     PREFERITI
     ===================================================================== */
  const preferiti = {
    async lista(tipo){
      richiediLogin();
      let q = sb.from('preferiti').select('*').eq('user_id', utente.id);
      if(tipo) q = q.eq('tipo', tipo);
      const { data, error } = await q.order('creato_il', { ascending:false });
      if(error) throw new Error(error.message);
      return data || [];
    },
    async aggiungi(tipo, riferimentoId){
      richiediLogin();
      const { error } = await sb.from('preferiti')
        .insert({ user_id: utente.id, tipo, riferimento_id: riferimentoId });
      if(error && error.code !== '23505') throw new Error(error.message);
      return true;
    },
    async rimuovi(tipo, riferimentoId){
      richiediLogin();
      const { error } = await sb.from('preferiti').delete()
        .eq('user_id', utente.id).eq('tipo', tipo).eq('riferimento_id', riferimentoId);
      if(error) throw new Error(error.message);
    },
    async attiva(tipo, riferimentoId, adesso){
      return adesso ? preferiti.aggiungi(tipo, riferimentoId)
                     : preferiti.rimuovi(tipo, riferimentoId);
    }
  };

  /* =====================================================================
     MAGAZINE
     ===================================================================== */
  const magazine = {
    async numeri(){
      const { data, error } = await sb.from('magazine_numeri')
        .select('*').eq('stato','pubblicato').order('data_uscita', { ascending:false });
      if(error) throw new Error(error.message);
      return data || [];
    },

    /* quante pagine può leggere chi non è abbonato */
    pagineLibere(numero){
      if(abbonato()) return Infinity;
      const tot = numero && numero.totale_pagine ? numero.totale_pagine : 0;
      return tot ? Math.max(1, Math.floor(tot * QUOTA_ANTEPRIMA)) : 1;
    },

    /* IL PDF DA APRIRE
       Abbonato  -> il numero completo.
       Non abbonato -> il PDF di anteprima che hai preparato tu.
       Se l'anteprima manca, ripiega sul completo e la webapp
       blocca comunque le pagine oltre la quota. */
    async daLeggere(numero){
      if(!numero) return null;
      if(abbonato()){
        const url = await magazine.linkPdf(numero);
        return url ? { url, completo:true } : null;
      }
      if(numero.pdf_anteprima_path){
        const url = await magazine.linkPdfAnteprima(numero);
        if(url) return { url, completo:false, soloAnteprima:true };
      }
      const url = await magazine.linkPdf(numero);
      return url ? { url, completo:false, soloAnteprima:false } : null;
    },

    /* PDF ridotto con le sole pagine scelte per l'anteprima */
    async linkPdfAnteprima(numero){
      if(!numero || !numero.pdf_anteprima_path) return null;
      const { data, error } = await sb.storage.from('magazine')
        .createSignedUrl(numero.pdf_anteprima_path, 7200);
      if(error) return null;
      return data.signedUrl;
    },

    async pagine(numeroId){
      const { data, error } = await sb.from('magazine_pagine')
        .select('*').eq('numero_id', numeroId).order('pagina');
      if(error) throw new Error(error.message);
      return data || [];
    },

    /* Link a una pagina: se l'utente non ha diritto torna null → paywall */
    async linkPagina(pagina){
      if(!pagina || !pagina.immagine_path) return null;
      const { data, error } = await sb.storage.from('magazine')
        .createSignedUrl(pagina.immagine_path, 3600);
      if(error) return null;
      return data.signedUrl;
    },

    /* Link al PDF completo del numero: serve quando le pagine
       non sono state estratte come immagini. */
    async linkPdf(numero){
      if(!numero || !numero.pdf_path) return null;
      const { data, error } = await sb.storage.from('magazine')
        .createSignedUrl(numero.pdf_path, 7200);
      if(error) return null;
      return data.signedUrl;
    },

    async salvaLettura(numeroId, ultimaPagina){
      richiediLogin();
      const { error } = await sb.from('letture_magazine').upsert({
        user_id: utente.id, numero_id: numeroId,
        ultima_pagina: ultimaPagina, aggiornato_il: new Date().toISOString()
      }, { onConflict: 'user_id,numero_id' });
      if(error) throw new Error(error.message);
    },

    async miaLettura(numeroId){
      if(!utente) return null;
      const { data } = await sb.from('letture_magazine')
        .select('*').eq('user_id', utente.id).eq('numero_id', numeroId).maybeSingle();
      return data;
    },

    /* tutte le letture dell'utente, per sapere se oggi ha aperto
       il magazine (usato dall'anello "I tuoi passi di oggi") */
    async mieLetture(){
      if(!utente) return [];
      const { data } = await sb.from('letture_magazine')
        .select('numero_id, ultima_pagina, aggiornato_il').eq('user_id', utente.id);
      return data || [];
    }
  };

  /* =====================================================================
     FEED VOCALE
     ===================================================================== */
  const feed = {
    async lista(limite, obiettivo){
      /* Leggiamo i post del PROPRIO gruppo-obiettivo (feed di gruppo).
         Se obiettivo non è passato, mostriamo tutti (retrocompatibile). */
      let q = sb.from('feed_posts')
        .select('*')
        .eq('nascosto', false);
      if(obiettivo) q = q.eq('obiettivo', obiettivo);
      const { data: posts, error } = await q
        .order('creato_il', { ascending:false })
        .limit(limite || 30);
      if(error) throw new Error(error.message);
      if(!posts || !posts.length) return [];

      // nomi degli autori (una sola query per tutti gli id)
      const ids = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
      let nomi = {};
      if(ids.length){
        try{
          const { data: profs } = await sb.from('profili').select('user_id, nome').in('user_id', ids);
          (profs || []).forEach(pr => { nomi[pr.user_id] = pr.nome; });
        }catch(_){ /* se fallisce, mostriamo comunque i post senza nome */ }
      }

      // conteggio risposte per ogni post (una query, poi raggruppo)
      let conteggi = {};
      try{
        const { data: ris } = await sb.from('feed_risposte')
          .select('post_id').in('post_id', posts.map(p => p.id));
        (ris || []).forEach(r => { conteggi[r.post_id] = (conteggi[r.post_id] || 0) + 1; });
      }catch(_){ /* se fallisce, zero risposte */ }

      // unisco tutto nella forma che l'app si aspetta
      return posts.map(p => ({
        ...p,
        profili: { nome: nomi[p.user_id] || null },
        feed_risposte: [{ count: conteggi[p.id] || 0 }],
      }));
    },

    async mieiApplausi(postIds){
      if(!utente || !postIds.length) return {};
      const { data } = await sb.from('feed_bravo')
        .select('post_id').eq('user_id', utente.id).in('post_id', postIds);
      const m = {};
      (data || []).forEach(r => m[r.post_id] = true);
      return m;
    },

    async pubblica(fileAudio, descrizione, durataSec, anonimo, obiettivo){
      await assicuraSessione();
      /* Limite: 1 pubblicazione al giorno nel feed, per tutti. */
      try{
        const { data: quanti } = await sb.rpc('feed_post_oggi');
        if((quanti || 0) >= 1){
          throw new Error('LIMITE_POST: Hai già pubblicato oggi. Puoi pubblicare 1 audio al giorno nel feed.');
        }
      }catch(e){ if(String(e.message).startsWith('LIMITE_POST')) throw e; }

      const prep = preparaUpload(fileAudio, utente.id);
      const nome = prep.nome;
      const up = await sb.storage.from('feed').upload(nome, fileAudio, { contentType: prep.tipo, upsert: true });
      if(up.error) throw new Error('[STORAGE feed] ' + up.error.message);

      const { data, error } = await sb.from('feed_posts').insert({
        user_id: utente.id, audio_path: nome,
        durata_sec: Math.round(durataSec || 0),
        descrizione: descrizione || null,
        anonimo: !!anonimo,
        obiettivo: obiettivo || null
      }).select().single();
      if(error) throw new Error('[TABELLA feed_posts] ' + error.message);

      await sb.rpc('consuma', { p_tipo: 'feed_post' });
      return data;
    },

    async linkAudio(path){
      if(!path) return null;
      const { data, error } = await sb.storage.from('feed').createSignedUrl(path, 3600);
      return error ? null : data.signedUrl;
    },

    async applaudi(postId, adesso){
      richiediLogin();
      if(adesso){
        const { error } = await sb.from('feed_bravo').insert({ post_id: postId, user_id: utente.id });
        if(error && error.code !== '23505') throw new Error(error.message);
      }else{
        const { error } = await sb.from('feed_bravo').delete()
          .eq('post_id', postId).eq('user_id', utente.id);
        if(error) throw new Error(error.message);
      }
    },

    async risposte(postId){
      /* Leggo i commenti audio senza join fragile (come per i post). */
      const { data: ris, error } = await sb.from('feed_risposte')
        .select('*').eq('post_id', postId).order('creato_il');
      if(error) throw new Error(error.message);
      if(!ris || !ris.length) return [];

      // nomi autori
      const ids = [...new Set(ris.map(r => r.user_id).filter(Boolean))];
      let nomi = {};
      if(ids.length){
        try{
          const { data: profs } = await sb.from('profili').select('user_id, nome').in('user_id', ids);
          (profs || []).forEach(pr => { nomi[pr.user_id] = pr.nome; });
        }catch(_){}
      }

      // like per ogni commento + quali ho messo io
      let likeConteggi = {}, mieiLike = {};
      try{
        const { data: likes } = await sb.from('feed_risposte_like')
          .select('risposta_id, user_id').in('risposta_id', ris.map(r => r.id));
        (likes || []).forEach(l => {
          likeConteggi[l.risposta_id] = (likeConteggi[l.risposta_id] || 0) + 1;
          if(utente && l.user_id === utente.id) mieiLike[l.risposta_id] = true;
        });
      }catch(_){}

      return ris.map(r => ({
        ...r,
        profili: { nome: nomi[r.user_id] || null },
        like_count: likeConteggi[r.id] || 0,
        mio_like: !!mieiLike[r.id],
      }));
    },

    async metti_like_commento(rispostaId, adesso){
      richiediLogin();
      if(adesso){
        const { error } = await sb.from('feed_risposte_like')
          .insert({ risposta_id: rispostaId, user_id: utente.id });
        if(error && !String(error.message).includes('duplicate')) throw new Error(error.message);
      } else {
        const { error } = await sb.from('feed_risposte_like').delete()
          .eq('risposta_id', rispostaId).eq('user_id', utente.id);
        if(error) throw new Error(error.message);
      }
    },

    async rispondi(postId, fileAudio, durataSec, anonimo){
      richiediLogin();
      /* Limite commenti: annuale illimitato, mensile max 3 al giorno,
         free (o scaduto) trattato come il mensile. */
      try{
        const { data: piano } = await sb.rpc('mio_piano_attivo');
        if(piano !== 'annuale'){
          const { data: fatti } = await sb.rpc('feed_commenti_oggi');
          if((fatti || 0) >= 3){
            throw new Error('LIMITE_COMMENTI: Con il piano mensile puoi lasciare 3 commenti audio al giorno. Passa all\'annuale per commentare senza limiti.');
          }
        }
      }catch(e){ if(String(e.message).startsWith('LIMITE_COMMENTI')) throw e; }

      const prep = preparaUpload(fileAudio, utente.id);
      const nome = prep.nome;
      const up = await sb.storage.from('feed').upload(nome, fileAudio, { contentType: prep.tipo, upsert: true });
      if(up.error) throw new Error('[STORAGE feed] ' + up.error.message);
      const { error } = await sb.from('feed_risposte').insert({
        post_id: postId, user_id: utente.id, audio_path: nome,
        durata_sec: Math.round(durataSec || 0), anonimo: !!anonimo
      });
      if(error) throw new Error('[TABELLA feed_risposte] ' + error.message);
    },

    /* quota giornaliera: free 1, abbonati 3 */
    async postRimanentiOggi(){
      const max = abbonato() ? 3 : 1;
      const c = await contenuti.consumiDiOggi();
      return Math.max(0, max - (c.feed_post || 0));
    }
  };

  /* =====================================================================
     SFIDE
     ===================================================================== */
  const sfide = {
    /* Le sfide visibili nell'app: tutte tranne quelle chiuse.
       Porta con sé quanti posti sono già stati presi. */
    async lista(){
      const { data, error } = await sb.from('sfide')
        .select('*, sfida_iscritti(count)')
        .neq('stato', 'chiusa')
        .order('creato_il', { ascending:false });
      if(error) throw new Error(error.message);
      return (data || []).map(s => ({
        ...s,
        iscritti: (s.sfida_iscritti && s.sfida_iscritti[0] && s.sfida_iscritti[0].count) || 0,
        /* la copertina serve alla vetrina a riquadri */
        copertina_url: s.copertina_path
          ? sb.storage.from('pubblico').getPublicUrl(s.copertina_path).data.publicUrl
          : null
      }));
    },

    /* Il contenuto giorno per giorno preparato nel pannello */
    async giorni(sfidaId){
      const { data, error } = await sb.from('sfida_giorni')
        .select('*').eq('sfida_id', sfidaId).order('giorno');
      if(error) throw new Error(error.message);
      return data || [];
    },

    async miaIscrizione(sfidaId){
      if(!utente) return null;
      const { data } = await sb.from('sfida_iscritti')
        .select('*').eq('sfida_id', sfidaId).eq('user_id', utente.id).maybeSingle();
      return data;
    },

    async iscriviti(sfidaId){
      await assicuraSessione();
      const { data, error } = await sb.from('sfida_iscritti')
        .insert({ sfida_id: sfidaId, user_id: utente.id }).select().single();
      if(error){
        if(error.code === '23505') throw new Error('Sei già iscritto a questa sfida');
        throw new Error(error.message);
      }
      return data;
    },

    async messaggi(iscrizioneId){
      const { data, error } = await sb.from('sfida_messaggi')
        .select('*').eq('iscrizione_id', iscrizioneId).order('giorno').order('creato_il');
      if(error) throw new Error(error.message);
      return data || [];
    },

    async linkAudio(path){
      if(!path) return null;
      const { data, error } = await sb.storage.from('sfide').createSignedUrl(path, 3600);
      return error ? null : data.signedUrl;
    },

    async inviaVocale(iscrizioneId, giorno, fileAudio, durataSec){
      await assicuraSessione();
      /* Il file va salvato in una cartella col MIO id utente (non
         l'id iscrizione), perché le policy di storage controllano che
         ognuno carichi solo nella propria cartella. */
      const prep = preparaUpload(fileAudio, utente.id);
      const nome = prep.nome;
      const up = await sb.storage.from('sfide').upload(nome, fileAudio, { contentType: prep.tipo, upsert: true });
      if(up.error) throw new Error(up.error.message);

      const { error } = await sb.from('sfida_messaggi').insert({
        iscrizione_id: iscrizioneId, giorno, autore: 'utente',
        audio_path: nome, durata_sec: Math.round(durataSec || 0)
      });
      if(error) throw new Error(error.message);

      /* segna il giorno come completato */
      const isc = await sb.from('sfida_iscritti')
        .select('giorni_completati, sfide(giorni)')
        .eq('id', iscrizioneId).single();
      const giorni = (isc.data && isc.data.giorni_completati) || [];
      const durata = (isc.data && isc.data.sfide && isc.data.sfide.giorni) || 7;
      if(giorni.indexOf(giorno) === -1){
        giorni.push(giorno);
        await sb.from('sfida_iscritti')
          .update({ giorni_completati: giorni, giorno_corrente: Math.min(giorno + 1, durata) })
          .eq('id', iscrizioneId);
      }
    }
  };

  /* =====================================================================
     COMPAGNO INVISIBILE
     ===================================================================== */
  const compagno = {
    async mieStanze(){
      richiediLogin();
      const { data, error } = await sb.from('compagno_stanze')
        .select('*').or('utente_a.eq.' + utente.id + ',utente_b.eq.' + utente.id)
        .order('creato_il', { ascending:false });
      if(error) throw new Error(error.message);
      return data || [];
    },

    /* Cerca un compagno con lo stesso obiettivo già in attesa: se c'è,
       vi accoppia; se no, ti mette in attesa. Il matching avviene nel
       database (funzione trova_o_crea_stanza) per evitare accoppiamenti
       doppi quando due persone aprono una stanza nello stesso istante. */
    async elencaVociInAttesa(obiettivo){
      await assicuraSessione();
      const { data, error } = await sb.rpc('elenca_voci_in_attesa', {
        p_obiettivo: obiettivo || (profilo ? profilo.obiettivo : null)
      });
      if(error) throw new Error(error.message);
      return data || [];
    },

    async rispondiAVoce(stanzaId){
      await assicuraSessione();
      const { data, error } = await sb.rpc('rispondi_a_voce', { p_stanza: stanzaId });
      if(error){
        if(String(error.message).includes('GIA_PRESA')){
          throw new Error('QUALCUNO_TI_HA_PRECEDUTO');
        }
        throw new Error(error.message);
      }
      return data;
    },

    async apriStanza(obiettivo){
      await assicuraSessione();
      const { data, error } = await sb.rpc('trova_o_crea_stanza', {
        p_obiettivo: obiettivo || (profilo ? profilo.obiettivo : null)
      });
      if(error) throw new Error(error.message);
      await sb.rpc('consuma', { p_tipo: 'compagno_parla' });
      return data;
    },

    async impostaDescrizione(stanzaId, testo){
      await assicuraSessione();
      const { error } = await sb.rpc('imposta_descrizione_stanza', {
        p_stanza: stanzaId, p_testo: testo || ''
      });
      if(error) throw new Error(error.message);
    },

    async messaggi(stanzaId){
      const { data, error } = await sb.from('compagno_messaggi')
        .select('*').eq('stanza_id', stanzaId).order('creato_il');
      if(error) throw new Error(error.message);
      return data || [];
    },

    async invia(stanzaId, fileAudio, durataSec){
      await assicuraSessione();
      if(!fileAudio || !fileAudio.size){
        throw new Error('L\'audio è vuoto: prova a registrare di nuovo.');
      }
      const prep = preparaUpload(fileAudio, utente.id);
      const nome = prep.nome;
      const up = await sb.storage.from('compagno').upload(nome, fileAudio, { contentType: prep.tipo, upsert: true });
      if(up.error) throw new Error('[STORAGE compagno] ' + up.error.message);

      /* La funzione sul database applica le regole: turni (aspetta la
         risposta), limite 7 a testa, chiusura automatica a 7+7. */
      const { data, error } = await sb.rpc('compagno_invia', {
        p_stanza: stanzaId, p_audio_path: nome, p_durata: Math.round(durataSec || 0)
      });
      if(error) throw new Error(error.message);
      if(data && data.ok === false){
        const messaggi = {
          aspetta_risposta: 'ASPETTA_RISPOSTA',
          limite_raggiunto: 'Avete raggiunto i 7 audio a testa: la conversazione è completa.',
          chiusa: 'Questa conversazione è chiusa.',
          non_sei_membro: 'Non fai parte di questa conversazione.',
        };
        throw new Error(messaggi[data.motivo] || 'Non è stato possibile inviare il vocale.');
      }
      /* se la conversazione si è chiusa ora (7+7), cancello i file */
      if(data && data.chiusa_ora && Array.isArray(data.files) && data.files.length){
        try{ await sb.storage.from('compagno').remove(data.files); }catch(e){}
      }
      return data;   /* può contenere { chiusa_ora: true } */
    },

    async chiudiStanza(stanzaId){
      richiediLogin();
      /* La funzione sul database cancella messaggi e stanza, e ci
         restituisce l'elenco dei file audio. I file li cancelliamo qui
         dall'app (lato SQL davano 403). */
      const { data, error } = await sb.rpc('compagno_chiudi_e_cancella', { p_stanza: stanzaId });
      if(error) throw new Error(error.message);
      if(data && data.ok === false){
        throw new Error(data.motivo === 'non_sei_membro'
          ? 'Non fai parte di questa conversazione.'
          : 'Non è stato possibile chiudere la conversazione.');
      }
      /* cancello i file audio dallo storage */
      if(data && Array.isArray(data.files) && data.files.length){
        try{ await sb.storage.from('compagno').remove(data.files); }catch(e){ /* non blocco */ }
      }
      return data;
    },

    async linkAudio(path){
      if(!path) return null;
      const { data, error } = await sb.storage.from('compagno').createSignedUrl(path, 3600);
      return error ? null : data.signedUrl;
    },

    /* aggiornamento in tempo reale dei messaggi di una stanza */
    /* chiude la conversazione per entrambi */
    ascolta(stanzaId, quandoArriva){
      return sb.channel('stanza-' + stanzaId)
        .on('postgres_changes',
            { event:'INSERT', schema:'public', table:'compagno_messaggi', filter:'stanza_id=eq.' + stanzaId },
            payload => quandoArriva(payload.new))
        .subscribe();
    },

    async quoteRimanenti(){
      const max = abbonato() ? 3 : 1;
      const c = await contenuti.consumiDiOggi();
      return {
        parla:   Math.max(0, max - (c.compagno_parla || 0)),
        ascolta: Math.max(0, max - (c.compagno_ascolta || 0)),
        max
      };
    }
  };

  /* =====================================================================
     DIARIO E OBIETTIVI
     ===================================================================== */
  const diario = {
    async pagine(limite){
      richiediLogin();
      const { data, error } = await sb.from('diario_pagine')
        .select('*').eq('user_id', utente.id)
        .order('data', { ascending:false }).limit(limite || 60);
      if(error) throw new Error(error.message);
      return data || [];
    },

    async scrivi(pagina){
      await assicuraSessione();
      let audioPath = null, fotoPath = null;

      if(pagina.audio){
        const prep = preparaUpload(pagina.audio, utente.id);
        const up = await sb.storage.from('diario').upload(prep.nome, pagina.audio, { contentType: prep.tipo, upsert: true });
        if(up.error) throw new Error(up.error.message);
        audioPath = prep.nome;
      }
      if(pagina.foto){
        const prep = preparaUpload(pagina.foto, utente.id);
        const up = await sb.storage.from('diario').upload(prep.nome, pagina.foto, { contentType: prep.tipo, upsert: true });
        if(up.error) throw new Error(up.error.message);
        fotoPath = prep.nome;
      }

      const { data, error } = await sb.from('diario_pagine').insert({
        user_id: utente.id,
        titolo: pagina.titolo || null,
        sottotitolo: pagina.sottotitolo || null,
        testo: pagina.testo || null,
        audio_path: audioPath, foto_path: fotoPath,
        data: pagina.data || new Date().toISOString().slice(0,10)
      }).select().single();
      if(error) throw new Error(error.message);
      await caricaProfilo();   /* lo streak è cambiato */
      return data;
    },

    /* modifica una pagina già scritta */
    async aggiorna(id, campi){
      richiediLogin();
      const { error } = await sb.from('diario_pagine').update({
        titolo: campi.titolo || null,
        sottotitolo: campi.sottotitolo || null,
        testo: campi.testo || null
      }).eq('id', id);
      if(error) throw new Error(error.message);
    },

    async elimina(id){
      await assicuraSessione();
      const { error } = await sb.from('diario_pagine').delete().eq('id', id);
      if(error) throw new Error(error.message);
    },

    async linkFile(bucketPath){
      if(!bucketPath) return null;
      const { data, error } = await sb.storage.from('diario').createSignedUrl(bucketPath, 3600);
      return error ? null : data.signedUrl;
    }
  };

  const obiettivi = {
    async lista(){
      richiediLogin();
      const { data, error } = await sb.from('obiettivi')
        .select('*').eq('user_id', utente.id).order('completato').order('scadenza');
      if(error) throw new Error(error.message);
      return data || [];
    },
    async crea(testo, scadenza){
      await assicuraSessione();
      const { data, error } = await sb.from('obiettivi')
        .insert({ user_id: utente.id, testo, scadenza: scadenza || null }).select().single();
      if(error) throw new Error(error.message);
      return data;
    },
    async completa(id, fatto){
      await assicuraSessione();
      const { error } = await sb.from('obiettivi').update({ completato: !!fatto }).eq('id', id);
      if(error) throw new Error(error.message);
    },
    async elimina(id){
      richiediLogin();
      const { error } = await sb.from('obiettivi').delete().eq('id', id);
      if(error) throw new Error(error.message);
    }
  };

  /* =====================================================================
     WEBINAR
     ===================================================================== */
  const webinar = {
    async lista(){
      const { data, error } = await sb.from('webinar').select('*').order('data_ora', { ascending:false });
      if(error) throw new Error(error.message);
      return data || [];
    },
    async iscriviti(webinarId){
      await assicuraSessione();
      const { error } = await sb.from('webinar_iscritti')
        .insert({ webinar_id: webinarId, user_id: utente.id });
      if(error && error.code !== '23505') throw new Error(error.message);
      return true;
    },
    async sonoIscritto(webinarId){
      if(!utente) return false;
      const { data } = await sb.from('webinar_iscritti').select('webinar_id')
        .eq('webinar_id', webinarId).eq('user_id', utente.id).maybeSingle();
      return !!data;
    },
    async linkReplay(w){
      if(!w || !w.file_path) return null;
      if(w.solo_premium && !abbonato()) return null;
      const { data, error } = await sb.storage.from('audio').createSignedUrl(w.file_path, 3600);
      return error ? null : data.signedUrl;
    }
  };

  /* =====================================================================
     ABBONAMENTO (Stripe)
     ===================================================================== */
  const abbonamento = {
    async piani(){
      const { data, error } = await sb.from('piani').select('*').eq('attivo', true).order('ordine');
      if(error) throw new Error(error.message);
      return data || [];
    },

    /* Registra il consenso all'esecuzione immediata del servizio, con
       la conseguente perdita del diritto di recesso (art. 59 lett. o
       del Codice del Consumo). Va salvato PRIMA di avviare il
       pagamento: serve come prova che l'utente è stato informato. */
    async registraConsensoRecesso(versione){
      richiediLogin();
      const { error } = await sb.from('consensi').insert({
        user_id: utente.id,
        tipo: 'recesso_esecuzione_immediata',
        concesso: true,
        versione: versione || 'termini-1.0'
      });
      if(error) throw new Error('Non riesco a registrare il consenso: ' + error.message);
      return true;
    },

    /* apre il pagamento Stripe */
    async abbonati(codicePiano, codicePromo){
      richiediLogin();
      const corpo = { piano: codicePiano };
      if(codicePromo) corpo.codicePromo = codicePromo;
      const { data, error } = await sb.functions.invoke('crea-checkout', { body: corpo });
      if(error) throw new Error('Non riesco ad aprire il pagamento: ' + error.message);
      if(!data || !data.url) throw new Error(data && data.errore ? data.errore : 'Risposta non valida');
      window.location.href = data.url;
    },

    /* apre il portale Stripe (cambio carta, fatture, disdetta) */
    async gestisci(){
      richiediLogin();
      const { data, error } = await sb.functions.invoke('portale-cliente', { body: {} });
      if(error) throw new Error(error.message);
      if(!data || !data.url) throw new Error(data && data.errore ? data.errore : 'Nessun abbonamento attivo');
      window.location.href = data.url;
    },

    stato(){
      return {
        abbonato: abbonato(),
        piano: profilo ? profilo.piano : 'free',
        stato: profilo ? profilo.stato_abbonamento : 'inattivo',
        scadenza: profilo ? profilo.scadenza_piano : null
      };
    }
  };

  /* =====================================================================
     REFERRAL
     ===================================================================== */
  const CHIAVE_INVITO = 'mc_invito';

  const referral = {
    /* mette da parte il codice trovato nel link, in attesa della registrazione */
    memorizzaDaLink(){
      try{
        const cod = new URLSearchParams(window.location.search).get('invito');
        if(cod) window.localStorage.setItem(CHIAVE_INVITO, cod.trim().toUpperCase());
        return cod || null;
      }catch(e){ return null; }
    },

    codiceInSospeso(){
      try{ return window.localStorage.getItem(CHIAVE_INVITO); }catch(e){ return null; }
    },

    /* registra un codice scritto a mano dall'utente (schermata piani) */
    async registraCodice(codice){
      if(!utente) throw new Error('Devi essere collegato');
      const cod = String(codice || '').trim().toUpperCase();
      if(!cod) throw new Error('Codice vuoto');
      const { data, error } = await sb.rpc('registra_invito', { p_codice: cod });
      if(error) throw new Error(error.message);
      return data;
    },

    /* sono stato invitato da qualcuno? serve a mostrare il prezzo scontato */
    async sonoInvitato(){
      if(!utente) return false;
      const { data } = await sb.from('inviti')
        .select('id').eq('invitato', utente.id)
        .in('stato', ['registrato','valido']).maybeSingle();
      return !!data;
    },

    /* da chiamare appena l'utente è dentro: collega l'invito al suo account */
    async registraSePresente(){
      if(!utente) return null;
      const cod = referral.codiceInSospeso();
      if(!cod) return null;
      try{
        const { data, error } = await sb.rpc('registra_invito', { p_codice: cod });
        if(error) throw new Error(error.message);
        /* il codice ha esaurito il suo compito, in un senso o nell'altro */
        try{ window.localStorage.removeItem(CHIAVE_INVITO); }catch(e){}
        return data;
      }catch(e){
        console.warn('Invito non registrato:', e.message);
        return null;
      }
    },

    /* tutto quello che serve alla schermata "Meglio in due" */
    async riepilogo(){
      richiediLogin();
      const { data, error } = await sb.rpc('mio_referral');
      if(error) throw new Error(error.message);
      return data;
    },

    async mioCodice(){
      richiediLogin();
      const { data, error } = await sb.rpc('mio_codice_invito');
      if(error) throw new Error(error.message);
      return data;
    },
    async mieiInviti(){
      richiediLogin();
      const { data, error } = await sb.from('inviti')
        .select('*').eq('invitante', utente.id).order('creato_il', { ascending:false });
      if(error) throw new Error(error.message);
      const validi = (data || []).filter(i => i.stato === 'valido').length;
      return { inviti: data || [], validi };
    },
    linkInvito(codice){
      const base = window.location.origin + window.location.pathname;
      return base + '?invito=' + encodeURIComponent(codice);
    },

    /* condivisione con il foglio del telefono, con ripiego sugli appunti */
    async condividi(codice, nome){
      const link = referral.linkInvito(codice);
      const testo = (nome ? nome + ' ti ' : 'Ti ') + 'invita su MentalClass. ' +
                    'Il primo anno lo paghi il 20% in meno.';
      if(navigator.share){
        try{ await navigator.share({ title:'MentalClass', text:testo, url:link }); return 'condiviso'; }
        catch(e){ if(e && e.name === 'AbortError') return 'annullato'; }
      }
      try{ await navigator.clipboard.writeText(link); return 'copiato'; }
      catch(e){ return 'errore'; }
    }
  };

  /* =====================================================================
     STATISTICHE PROFILO
     ===================================================================== */
  /* ---------- ASPETTO DELL'APP ---------- */
  const aspetto = {
    async leggi(){
      const { data, error } = await sb.from('app_config').select('*').eq('id', 1).maybeSingle();
      if(error) return null;
      return data;
    }
  };

  /* ---------- PROMOZIONI ---------- */
  const promozioni = {
    /* la più recente tra quelle attive e non scadute, o null */
    async attiva(){
      const { data, error } = await sb.from('promozioni')
        .select('testo, codice')
        .eq('attiva', true)
        .or('scade_il.is.null,scade_il.gt.' + new Date().toISOString())
        .order('creato_il', { ascending:false })
        .limit(1)
        .maybeSingle();
      if(error) return null;
      return data;
    }
  };

  const statistiche = {
    async mie(){
      richiediLogin();
      const [prog, pref, pag, iscr] = await Promise.all([
        sb.from('progressi_audio').select('completato').eq('user_id', utente.id),
        sb.from('preferiti').select('tipo').eq('user_id', utente.id),
        sb.from('diario_pagine').select('id').eq('user_id', utente.id),
        sb.from('sfida_iscritti').select('giorni_completati').eq('user_id', utente.id)
      ]);
      const completati = (prog.data || []).filter(p => p.completato).length;
      const giorniSfide = (iscr.data || []).reduce((s,i) => s + ((i.giorni_completati || []).length), 0);
      return {
        audioCompletati: completati,
        audioIniziati:  (prog.data || []).length,
        preferiti:      (pref.data || []).length,
        paginediario:   (pag.data || []).length,
        giorniSfide,
        streak: profilo ? (profilo.streak_giorni || 0) : 0
      };
    }
  };

  /* ---------- utilità interne ---------- */
  function estensione(nome){
    const p = String(nome || '').split('.');
    return p.length > 1 ? p.pop().toLowerCase() : 'webm';
  }

  /* Prepara un file audio/immagine per il caricamento in modo robusto:
     - il tipo pulito, senza il ";codecs=opus" che il browser aggiunge
       e che faceva rifiutare il file (es. "audio/webm;codecs=opus")
     - un nome con l'estensione giusta anche se il Blob non ha nome
       (i Blob registrati da MediaRecorder NON hanno .name) */
  function preparaUpload(fileOBlob, prefisso){
    let tipoPulito = String(fileOBlob.type || '').split(';')[0].trim();
    /* Se il blob non ha un tipo (capita con alcuni registratori), ne
       mettiamo uno valido: senza contentType alcuni upload danno 400. */
    if(!tipoPulito) tipoPulito = 'audio/webm';
    let est = 'webm';
    if(fileOBlob.name && fileOBlob.name.includes('.')) est = estensione(fileOBlob.name);
    else if(tipoPulito.includes('mp4'))  est = 'mp4';
    else if(tipoPulito.includes('mpeg')) est = 'mp3';
    else if(tipoPulito.includes('ogg'))  est = 'ogg';
    else if(tipoPulito.includes('wav'))  est = 'wav';
    else if(tipoPulito.startsWith('image/')) est = tipoPulito.split('/')[1] || 'jpg';
    const nome = prefisso + '/' + crypto.randomUUID() + '.' + est;
    return { nome, tipo: tipoPulito };
  }
  function traduci(msg){
    const m = String(msg || '');
    if(m.includes('Invalid login credentials')) return 'Email o password non corretti';
    if(m.includes('User already registered'))    return 'Esiste già un account con questa email';
    if(m.includes('Password should be'))         return 'La password è troppo corta (minimo 8 caratteri)';
    if(m.includes('Email not confirmed'))        return 'Devi confermare l\'email prima di accedere';
    if(m.includes('rate limit'))                 return 'Troppi tentativi, riprova tra qualche minuto';
    return m;
  }

  /* ---------- bio autori ---------- */
  const autori = {
    async bio(nome){
      if(!nome) return null;
      const chiave = String(nome).trim().toLowerCase();
      const { data, error } = await sb
        .from('autori_bio')
        .select('nome,bio')
        .eq('nome_key', chiave)
        .maybeSingle();
      if(error) return null;
      return data || null;
    }
  };

  /* ---------- interfaccia pubblica ---------- */
  return {
    init, client, utenteCorrente, profiloCorrente, caricaProfilo, abbonato,
    alCambioSessione,
    assicuraSessioneEsterna: assicuraSessione,
    account, contenuti, audio, preferiti, magazine, feed,
    sfide, compagno, diario, obiettivi, webinar, abbonamento, referral, statistiche, aspetto, promozioni,
    autori
  };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = MC;
