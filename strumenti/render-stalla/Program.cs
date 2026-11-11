// Estrae la scena di un render Unreal/Twinmotion già compilato (pacchetti .utoc/.ucas) e la scrive in un .glb.
// Uso (vedi LEGGIMI.md):
//   dotnet run -c Release -- esporta "<cartella del render>" "<mappatura.usmap>" "<uscita.glb>"
//   dotnet run -c Release -- info    "<cartella del render>" "<mappatura.usmap>"
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;

if (args.Length < 3) { Console.WriteLine("uso: esporta|info <cartella render> <mappatura.usmap> [uscita.glb]"); return; }
var (cmd, render, usmap) = (args[0], args[1], args[2]);

// Oodle (compressione dei pacchetti Unreal): la prima volta si scarica accanto al programma, come fa FModel
var oodle = Path.Combine(AppContext.BaseDirectory, OodleHelper.OodleFileName);
if (!File.Exists(oodle)) OodleHelper.DownloadOodleDll(ref oodle);
OodleHelper.Initialize(oodle);

var p = new DefaultFileProvider(render, SearchOption.AllDirectories, new VersionContainer(EGame.GAME_UE5_7));
p.MappingsContainer = new CUE4Parse.MappingsProvider.Usmap.FileUsmapTypeMappingsProvider(usmap);
p.Initialize();
p.Mount();

// la mappa del progetto (non quelle del motore)
var mappa = p.Files.Keys.First(k => k.EndsWith(".umap") && !k.StartsWith("Engine/"));
Console.WriteLine($"File nei pacchetti: {p.Files.Count}, mappa: {mappa}");
var ex = p.LoadPackage(mappa).GetExports().ToList();

if (cmd == "info")
    foreach (var g in ex.GroupBy(e => e.ExportType).OrderByDescending(g => g.Count()).Take(25))
        Console.WriteLine($"  {g.Count(),5} {g.Key}");
if (cmd == "esporta") Esporta.Esegui(ex, args.Length > 3 ? args[3] : "stalla-grezza.glb");
