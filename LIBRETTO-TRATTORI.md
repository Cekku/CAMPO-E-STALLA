# Libretto dei trattori

Libretto di manutenzione digitale dei trattori dell'azienda, dentro Campo e Stalla (sezione **Macchinari**). Fa le stesse cose del Libretto Q5 dell'auto (https://github.com/Cekku/libretto-q5): stato di ogni pezzo, storico degli interventi con le fatture allegate, lettura delle fatture con Claude, modello 3D esploso. Le scadenze però si contano in **ore motore e mesi**, e i mezzi sono più di uno.

> **Per riprendere il lavoro in un'altra chat:** fai leggere questo file a Claude (`C:\Users\Marco\Desktop\PROGETTO CAMPO E STALLA\CAMPO-E-STALLA\LIBRETTO-TRATTORI.md`), insieme a `CLAUDE.md` per il resto dell'app.

---

## Indirizzi

| Cosa | Dove |
|---|---|
| App (telefono e PC) | **https://cekku.github.io/CAMPO-E-STALLA/** → menu **Macchinari** |
| Codice (pubblico: niente dati veri nei file) | https://github.com/Cekku/CAMPO-E-STALLA, copia in `C:\Users\Marco\Desktop\PROGETTO CAMPO E STALLA\CAMPO-E-STALLA` |
| Dati e fatture | Supabase, progetto `vamcoyvunyjqgzxujsal` (lo stesso del resto di Campo e Stalla): tabella `records` e spazio file `allegati` |
| Pagina ponte per leggere le fatture (claude.ai, privata) | https://claude.ai/artifact/SZB96LSws2JF7BGFakwn5h, sorgente in `strumenti/ponte-fatture-trattori.html` |
| Modello 3D originale | "John Deere 8360r" di Miamux02 su Sketchfab, **CC BY 4.0** (credito nell'app): `Desktop\PROGETTO CAMPO E STALLA\modello-trattore\john-deere-8360r.zip`, fuori dal repository |

**Niente Firebase.** Il libretto è nell'app che c'era già. Si usano lo stesso accesso, la stessa sincronizzazione Supabase e la stessa azienda condivisa con i collaboratori. Le ore dei lavori registrati in campo con un trattore fanno salire le sue ore motore da sole.

---

## Trattori dell'azienda (ottobre 2026)

Si aggiungono tutti insieme da **Macchinari → Trattori dell'azienda**. Anno, ore e numero di serie si completano dalla scheda di ogni trattore.

| Modello | Chiave (`mezzo.catalogo`) | Catalogo ricambi |
|---|---|---|
| John Deere 7530 Premium | `jd-7530p` | John Deere PC4579 (catalogo n. 12662) |
| John Deere 7810 | `jd-7810` | PC2540 fino al n. di serie 089999 (12724), PC2831 dal 090000 (12725): l'app sceglie dal numero di serie |
| John Deere 6420S | `jd-6420s` | PC4349 (12107) |
| John Deere 5080M | `jd-5080m` | PC4589 (4256) |
| John Deere 6800 / 6900 | `jd-6800`, `jd-6900` | PC4255 (12271 / 12306) |
| Fendt 724 Vario Profi Plus | `fendt-724` | AGCO Parts Books: le credenziali le dà il concessionario |

Catalogo John Deere: `https://partscatalog.deere.com/jdrc/navigation/equipment/<numero>`. È pubblico e gratuito, con le tavole esplose e i codici, che dipendono dal numero di serie. **Le tavole non sono copiate nell'app** (sono di Deere e il repository è pubblico): l'app apre il catalogo giusto del trattore, mostra la sezione di ogni pezzo e tiene i codici già usati.

---

## Come è fatto

```
Macchinari → scheda del trattore (js/views/libretto.js)
   Libretto · Interventi · Scadenze · Ricambi · 3D
        │ registrazioni: mezzi, manutenzioni  →  IndexedDB  ⇄  Supabase records (RLS per azienda)
        │ fatture e foto                      →  cache 'ces-allegati-1'  ⇄  Supabase Storage 'allegati/<azienda>/<id>'
"Leggi fattura" ──► pagina ponte su claude.ai (account Claude dell'utente, capability sample con immagini)
                    Claude legge la fattura → "Copia e torna all'app" (appunti: CAMPOSTALLA-FATTURA:{json})
                    l'app legge gli appunti al ritorno (o "Incolla") e compila l'intervento
```

| File | Contenuto |
|---|---|
| `js/trattori.js` | Catalogo di 32 pezzi (`CATALOGO`: gruppo, ore, mesi, sezione del catalogo John Deere, descrizione), modelli dell'azienda (`MODELLI`), stato di un pezzo (`stato`), riepilogo, indirizzo della pagina ponte |
| `js/views/libretto.js` | Scheda del trattore, fogli del pezzo, delle ore e delle scadenze, allegati nel modulo dell'intervento, ritorno dei dati dalla pagina ponte, azioni `lib-…` |
| `js/allegati.js` | File allegati: riduzione delle foto a 2200 px, copia sul dispositivo, coda di invio, scaricamento a richiesta, vista dentro l'app (i PDF con pdf.js) |
| `js/trattore3d.js` | Visore 3D (three.js r128 in `vendor/three`, caricato solo nella scheda 3D), esploso a fasi, tocco sui gruppi, pezzi del libretto ↔ gruppi del modello (`COMP3D`) |
| `modelli/trattore.glb` | Il modello lavorato (5,8 MB, 166 mila triangoli, 16 gruppi) |
| `strumenti/modello-trattore/` | Come è stato fatto il modello (sotto) |
| `strumenti/ponte-fatture-trattori.html` | Sorgente della pagina ponte |
| `supabase/aggiornamento-allegati.sql` | Spazio file `allegati` e regole di accesso (anche in fondo a `schema.sql`); `ces_schema_version()` = 4 |

Modifiche al resto dell'app:
- `domain.js`: `mezzoOre` tiene conto della lettura del contaore (`oreLettura`, `oreLetturaData`) più i lavori successivi; avvisi per i trattori; nuovi tipi di intervento Controllo e Ingrassaggio.
- `agenda.js`: altre scadenze del mezzo e pezzi che scadono a calendario.
- `forms.js`: scheda mezzo (modello del libretto, numero di serie); intervento con pezzi, voci della fattura, numero fattura e allegati.
- `ui.js`: nuovo campo `checks`, caselle a scelta multipla divise in gruppi.
- `mezzi.js`: elenco con lo stato del libretto; i trattori aprono la scheda nuova, gli altri mezzi quella di prima.

### Dati

| Dove | Campi nuovi |
|---|---|
| `mezzi/{id}` | `catalogo` (chiave di `MODELLI`), `serie`, `oreLettura`, `oreLetturaData`, `intervalli {pezzo: {ore, mesi}}` (solo quelli cambiati), `codici {pezzo: codice}`, `tolti [pezzi]`, `presenti [pezzi facoltativi]`, `scadenze [{titolo, data, mesi, note}]` |
| `manutenzioni/{id}` | `componenti [pezzi]`, `ricambi [{codice, descrizione, qta, importo}]`, `fattura`, `allegati [{id, nome, tipo, kb}]` |

**Stato di un pezzo** (`stato()` in `trattori.js`): l'ultimo intervento che contiene il pezzo, più l'intervallo in ore e in mesi (vale quello che arriva prima), le ore attuali e la data di oggi. Lo stato è "in scadenza" a ≤ 10% dell'intervallo (almeno 25 ore) o a ≤ 30 giorni. Un vecchio intervento "Tagliando" senza pezzi conta come olio motore, e così anche i vecchi campi "Tagliando ogni / Ultimo tagliando a".

**Intervalli:** valori indicativi uguali per tutti, poi quelli del modello (`MODELLI.int`: olio motore ogni 250 ore per 7810, 6800 e 6900; olio e filtri Vario per il Fendt), poi quelli cambiati a mano nella scheda del pezzo. **Vanno controllati sui manuali d'uso**: non ho trovato fonti affidabili modello per modello.

---

## Comandi

```bash
# provare in locale (dalla cartella PROGETTO CAMPO E STALLA)
python -m http.server 8765 --directory CAMPO-E-STALLA
# controllo della sintassi
node --input-type=module --check < js/views/libretto.js
# pubblicare: commit e push su main, GitHub Pages pubblica da solo
```

In locale l'app usa il Supabase vero, ma senza accesso i dati restano nel browser. Su `localhost` c'è `window.__trattore3d` (`posa(t)`, `scegli(gruppo)`) per provare l'esploso senza animazione.

Per un rilascio aggiorna `js/version.js` e `VERSION` in `sw.js`, e aggiungi i file nuovi alla lista `SHELL`. La cache degli allegati `ces-allegati-1` non va mai cancellata dal service worker.

### Archivio online delle fatture (una volta sola)

Finché non è attivo, le fatture restano sul dispositivo dove le hai caricate. Nella scheda Interventi compare l'avviso con il pulsante **Copia il codice**. Poi:
Supabase → **SQL Editor → New query** → incolla `supabase/aggiornamento-allegati.sql` → **Run**.

### Modello 3D (`strumenti/modello-trattore/`)

1. `0-dae-in-glb.mjs` (Node, three 0.160 + @xmldom/xmldom 0.8.10). Lo zip di Sketchfab contiene solo il Collada originale di SketchUp (29 MB), e Blender 5.2 non legge più il Collada: lo script lo converte in glb. Le texture mancano: le parti bianche si ricolorano dopo.
2. `1-blender-gruppi.py` (Blender 5.2): `blender -b --factory-startup --python 1-blender-gruppi.py -- jd8360r.glb trattore_gruppi.glb [anteprima]`. Lo script:
   - toglie la catena di traino (25 maglie, un quarto dei triangoli);
   - raddrizza il trattore, che nel file è girato di circa 12°, mettendo il davanti verso +X e la terra a 0;
   - divide le parti in gruppi per posizione e colore: ruote, cabina dai vetri, cofano, parafanghi, sollevatore, zavorra, serbatoio, scarico, telaio;
   - ricolora: verde John Deere, cerchi gialli, telaio scuro;
   - aggiunge la meccanica **schematica**: motore con filtri, turbo, batteria, radiatori, trasmissione, ponte, assale anteriore;
   - unisce le maglie per gruppo e colore.
3. `2-alleggerisci.mjs` (Node, @gltf-transform 4.1.1 + meshoptimizer 0.22.0) → `modelli/trattore.glb` con posizioni compresse. Il visore le riporta in decimali (`dequantizza`), altrimenti i tocchi non trovano i pezzi.

Nell'app i nodi si chiamano `<gruppo>__g` (quello che si sposta nell'esploso) e le maglie `<gruppo>__<colore>`. Movimenti e fasi stanno in `GRUPPI3D`, il collegamento tra pezzi e gruppi in `COMP3D` (`js/trattore3d.js`).

---

## Cose imparate

- **Indice del catalogo John Deere:** scaricarlo in automatico tramite le sue interfacce interne è stato bloccato, ed è giusto così. Si usano solo i collegamenti, che sono stabili: `navigation/equipment/<id>` e `sidebyside/equipment/<id>/referrer/navigation/pgId/<tavola>`.
- **Fendt:** il catalogo AGCO Parts Books richiede le credenziali del concessionario. In rete non ci sono tavole libere.
- **Modelli 3D liberi** dei trattori esatti dell'azienda non esistono su Sketchfab con licenza utilizzabile. Quelli John Deere "Free Standard" o NonCommercial non vanno bene; l'8360R CC BY sì.
- **Sul telefono Android i PDF non si aprono in una nuova scheda** (Chrome li scarica e basta): l'app li disegna da sola con pdf.js.
- **Appunti:** al ritorno dalla pagina ponte Chrome può non lasciar leggere gli appunti senza un tocco. Per questo nel modulo compare "Incolla i dati letti" e, a modulo chiuso, il foglio "Dati della fattura".
- **Prove nel riquadro del browser di Claude:** quando il riquadro è nascosto, `requestAnimationFrame` è rallentato e le schermate del 3D restano ferme. Per controllare l'esploso si usano `__trattore3d.posa()` e gli ingombri.
- **Moduli in cache:** `python -m http.server` non manda intestazioni di cache, quindi Chrome tiene i moduli vecchi anche con Ctrl+Shift+R. Per riprendere quelli nuovi, in console: `fetch(file, {cache: 'reload'})`, poi ricarica.

---

## Da fare / idee

- Eseguire `supabase/aggiornamento-allegati.sql` nel progetto Supabase (lo fa Marco).
- Inserire anno, ore, numero di serie, targa, revisione e assicurazione di ogni trattore, e gli ultimi interventi che si ricordano.
- Controllare gli intervalli sui manuali d'uso, soprattutto Fendt Vario e trattori John Deere vecchi.
- Provare una fattura vera con la pagina ponte dal Pixel.
- Collegare l'intervento alla fattura elettronica già importata nei Conti (stesso fornitore e importo). I Conti sono riservati al titolare.
- Modello 3D diverso per il Fendt e per i John Deere serie 5 e 6, se si trova un modello con licenza adatta.
