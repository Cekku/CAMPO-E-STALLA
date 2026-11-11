# Render della stalla → modello 3D per l'app

Il progetto della stalla è arrivato come render già compilato con Unreal Engine 5.7 (scena Twinmotion, cartella `RENDER PROGETTO APRILE 2026`, 1,3 GB).
Un `.exe` non gira in una pagina web, quindi da lì si estrae la scena in un file `.glb`, che l'app mostra in **Stalla → Progetto 3D** (`js/stalla3d.js`, `js/views/progetto3d.js`).

Il file pronto è `modelli/stalla-progetto-3d.glb` (pubblicato con l'app dalla 1.29.1, per scelta di Marco). Un modello nuovo si può anche caricare dall'app come allegato privato, senza metterlo nel repository.

## Strumenti (sul PC, fuori dal repository)

- .NET 10 SDK (winget `Microsoft.DotNet.SDK.10`).
- Questo programma (`Program.cs`, `Esporta.cs`, `Estrai.csproj`) con le librerie NuGet CUE4Parse e CUE4Parse-Conversion 1.2.2.202609 (le stesse di FModel). La prima volta scarica la libreria Oodle accanto al programma.
- UE4SS (github.com/UE4SS-RE/RE-UE4SS, versione `experimental2`), solo per ricavare la mappatura.
- gltfpack 1.3 (github.com/zeux/meshoptimizer) per comprimere.

## Passi

1. **Copia del render**: si lavora su una copia, l'originale non si tocca.
2. **Mappatura** (`.usmap`): Unreal 5 salva le proprietà senza nomi, e lo schema esiste solo con il programma acceso.
   - Si estrae UE4SS nella copia, in `Binaries\Win64`: `dwmapi.dll` più la cartella `ue4ss`.
   - Si aggiunge un mod Lua con `ExecuteWithDelay(20000, function() DumpUSMAP() end)` e si attiva in `mods.txt`/`mods.json`.
   - Dentro `ExecuteInGameThread` il render si chiude con un errore: va chiamato fuori.
   - Si avvia il render: dopo 20 s compare `ue4ss\<nome>.usmap` (1,9 MB) e si chiude.
3. **Esportazione**: `dotnet run -c Release -- esporta "<copia del render>" "<file.usmap>" stalla-grezza.glb`.
   - Il risultato: 1.607 pezzi con posizione (catena `AttachParent`), materiali con il colore di Twinmotion o un colore naturale al posto dei colori AutoCAD, nodi di primo livello sotto `stalla` = gruppi del disegno (`ESISTENTE`, `PORTONI_INTERNI`, `CUCCETTE_FAVARO`…).
   - Tolti: bulloni (`S-FSTN`), ferri (`ferri`), una copia dettagliata delle fondazioni (`0_0_2`) e la base di Twinmotion (`Graphics`), circa 1,3 milioni di triangoli che non si vedono. Restano fuori anche l'erba (74.000 copie) e le luci.
   - Assi: Unreal (X avanti, Y destra, Z su, centimetri) → glTF (X, Z, Y in metri). Lo scambio di Y e Z corregge anche il verso.
4. **Compressione**: `gltfpack -i stalla-grezza.glb -o stalla.glb -kn -km` porta il file da 11 MB a 3,5 MB (posizioni intere, `KHR_mesh_quantization`).
   - **Non usare `-si`**: la semplificazione fa sparire i pannelli fotovoltaici e alcuni pezzi del terreno.
5. **Nell'app**: copiare il file in `modelli/stalla-progetto-3d.glb` e pubblicare, oppure Stalla → Progetto 3D → Carica un altro modello (resta privato).
