using System.Numerics;
using System.Text.Json;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse.UE4.Objects.Core.Math;
using CUE4Parse.UE4.Objects.UObject;
using CUE4Parse.UE4.Assets.Objects;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;

using VPN = SharpGLTF.Geometry.VertexTypes.VertexPositionNormal;
using MB = SharpGLTF.Geometry.MeshBuilder<SharpGLTF.Geometry.VertexTypes.VertexPositionNormal, SharpGLTF.Geometry.VertexTypes.VertexEmpty, SharpGLTF.Geometry.VertexTypes.VertexEmpty>;

static class Esporta
{
    // Pezzi da lasciare fuori (bulloni e ferri d'armatura: centinaia di migliaia di triangoli invisibili)
    static readonly string[] Esclusi = { "S-FSTN_0", "ferri_0", "0_0_2", "Graphics" };

    static readonly Dictionary<string, (string hex, float alfa, float metal, float rough)> Colori = new()
    {
        ["Polished_concrete_01"] = ("#B9B5AC", 1, 0, 0.8f),
        ["Roof_covering_12"] = ("#D8D9D6", 1, 0.3f, 0.5f),
        ["Roof_covering_14"] = ("#A86B52", 1, 0.3f, 0.5f),
        ["Grass_2"] = ("#7B8A55", 1, 0, 1),
        ["River_pebbles"] = ("#A29A8C", 1, 0, 1),
        ["Matt_chrome"] = ("#9A9A9A", 1, 0.8f, 0.35f),
        ["Matt_chrome_2"] = ("#9A9A9A", 1, 0.8f, 0.35f),
        ["Matt_White"] = ("#DCDCDC", 1, 0, 0.7f),
        ["Emissive_Black"] = ("#1E1E1E", 1, 0, 0.8f),
        ["M_TMBrickGlass"] = ("#A9C7D6", 0.35f, 0, 0.1f),
        ["WorldGridMaterial"] = ("#8A8A8A", 1, 0, 0.9f),
        ["Indice_dei_colori_AutoCAD_5"] = ("#26344D", 1, 0.4f, 0.3f),
        ["Indice_dei_colori_AutoCAD_1"] = ("#8E3B2E", 1, 0, 0.8f),
        ["Indice_dei_colori_AutoCAD_90"] = ("#6E8B4E", 1, 0, 0.9f),
        ["Indice_dei_colori_AutoCAD_2"] = ("#BDB39A", 1, 0, 1),
        ["Indice_dei_colori_AutoCAD_71"] = ("#9AA86A", 1, 0, 1),
        ["0"] = ("#3A3A3A", 1, 0, 0.8f),
    };

    static Vector3 G(FVector v) => new(v.X, v.Z, v.Y);   // UE (X avanti, Y destra, Z su) -> glTF (Y su)

    static Matrix4x4 Locale(UObject c)
    {
        var loc = c.GetOrDefault("RelativeLocation", new FVector(0, 0, 0));
        var rot = c.GetOrDefault("RelativeRotation", new FRotator(0, 0, 0));
        var sca = c.GetOrDefault("RelativeScale3D", new FVector(1, 1, 1));
        var q = rot.Quaternion();
        return Matrix4x4.CreateScale(sca.X, sca.Y, sca.Z)
             * Matrix4x4.CreateFromQuaternion(new Quaternion(q.X, q.Y, q.Z, q.W))
             * Matrix4x4.CreateTranslation(loc.X, loc.Y, loc.Z);
    }

    static Matrix4x4 Mondo(UObject c, out List<string> catena)
    {
        var m = Locale(c);
        catena = new List<string>();
        var q = c.GetOrDefault<FPackageIndex>("AttachParent")?.Load<UObject>();
        while (q != null) { m *= Locale(q); catena.Insert(0, q.Name); q = q.GetOrDefault<FPackageIndex>("AttachParent")?.Load<UObject>(); }
        return m;
    }

    static bool Hash(string s) => s.Length == 32 && s.All(Uri.IsHexDigit);

    static string Gruppo(List<string> catena)
    {
        var utili = catena.Where(n => !Hash(n) && n != "TOTALE").ToList();
        var g = utili.FirstOrDefault(n => n.EndsWith("_dwg")) ?? utili.FirstOrDefault() ?? catena.FirstOrDefault() ?? "altro";
        if (catena.FirstOrDefault() != "TOTALE" && catena.Count > 0) g = catena[0] + (utili.Count > 1 ? "-" + utili[^1] : "");
        return g.Replace("_dwg", "");
    }

    static string Hex(UObject mo)
    {
        foreach (var v in mo.GetOrDefault<FStructFallback[]>("VectorParameterValues") ?? [])
        {
            var n = v.GetOrDefault<FStructFallback>("ParameterInfo")?.GetOrDefault<FName>("Name").ToString() ?? "";
            if (n == "TintColor" || n.StartsWith("Base_Color"))
            {
                var c = v.GetOrDefault<FLinearColor>("ParameterValue");
                int B(float x) => (int)Math.Round(Math.Clamp(x <= 0.0031308f ? x * 12.92f : 1.055f * MathF.Pow(x, 1 / 2.4f) - 0.055f, 0, 1) * 255);
                return $"#{B(c.R):X2}{B(c.G):X2}{B(c.B):X2}";
            }
        }
        var par = mo.GetOrDefault<FPackageIndex>("Parent")?.Load<UObject>();
        return par != null ? Hex(par) : "#BBBBBB";
    }

    static readonly Dictionary<string, MaterialBuilder> Mat = new();
    public static readonly Dictionary<string, string> MatInfo = new();
    static MaterialBuilder Materiale(UObject? mo)
    {
        var nome = mo?.Name ?? "nessuno";
        var chiave = mo?.GetPathName() ?? "nessuno";
        if (Mat.TryGetValue(chiave, out var mb)) return mb;
        var (hex, alfa, metal, rough) = Colori.TryGetValue(nome, out var c) ? c : (mo != null ? Hex(mo) : "#BBBBBB", 1f, 0f, 0.8f);
        if (mo != null && nome.Contains("AutoCAD_132")) (hex, alfa, metal, rough) = ("#A9C7D6", 0.35f, 0, 0.1f);
        var col = new Vector4(Convert.ToInt32(hex[1..3], 16) / 255f, Convert.ToInt32(hex[3..5], 16) / 255f, Convert.ToInt32(hex[5..7], 16) / 255f, alfa);
        // il glTF vuole colori lineari
        static float L(float x) => x <= 0.04045f ? x / 12.92f : MathF.Pow((x + 0.055f) / 1.055f, 2.4f);
        col = new Vector4(L(col.X), L(col.Y), L(col.Z), col.W);
        mb = new MaterialBuilder(nome).WithMetallicRoughnessShader().WithBaseColor(col).WithMetallicRoughness(metal, rough).WithDoubleSide(true);
        if (alfa < 1) mb.WithAlpha(SharpGLTF.Materials.AlphaMode.BLEND);
        Mat[chiave] = mb; MatInfo[nome] = hex + (alfa < 1 ? " trasparente" : "");
        return mb;
    }

    static readonly Dictionary<string, MB?> Mesh = new();
    static MB? Costruisci(UStaticMesh sm, UObject comp)
    {
        var over = comp.GetOrDefault<FPackageIndex[]>("OverrideMaterials") ?? [];
        var chiave = sm.GetPathName() + "|" + string.Join(",", over.Select(o => o?.ToString()));
        if (Mesh.TryGetValue(chiave, out var gia)) return gia;
        var lod = sm.RenderData?.LODs?[0];
        if (lod?.PositionVertexBuffer == null || lod.IndexBuffer == null || lod.VertexBuffer == null) { Mesh[chiave] = null; return null; }
        var pos = lod.PositionVertexBuffer.Verts;
        var uv = lod.VertexBuffer.UV;
        var mb = new MB(sm.Name);
        // verso dei triangoli: si controlla con le normali salvate
        int concordi = 0, discordi = 0;
        var idx = lod.IndexBuffer;
        Vector3 P(int i) => G(pos[i]) * 0.01f;
        Vector3 N(int i) { var n = (FVector)uv[i].Normal[2]; var v = G(n); return v.LengthSquared() > 1e-8 ? Vector3.Normalize(v) : Vector3.UnitY; }
        for (int t = 0; t + 2 < idx.Length && t < 3000; t += 3)
        {
            int a = (int)idx[t], b = (int)idx[t + 1], c = (int)idx[t + 2];
            var f = Vector3.Cross(P(b) - P(a), P(c) - P(a));
            var d = Vector3.Dot(f, N(a) + N(b) + N(c));
            if (d > 0) concordi++; else if (d < 0) discordi++;
        }
        bool gira = discordi > concordi;
        foreach (var s in lod.Sections)
        {
            FPackageIndex? mi = s.MaterialIndex < over.Length && over[s.MaterialIndex] != null && !over[s.MaterialIndex].IsNull ? over[s.MaterialIndex]
                : (sm.StaticMaterials != null && s.MaterialIndex < sm.StaticMaterials.Length ? sm.StaticMaterials[s.MaterialIndex].MaterialInterface : null);
            var prim = mb.UsePrimitive(Materiale(mi?.Load<UObject>()));
            for (int t = 0; t < s.NumTriangles; t++)
            {
                int o = (int)s.FirstIndex + t * 3;
                int a = (int)idx[o], b = (int)idx[o + 1], c = (int)idx[o + 2];
                var va = new VPN(P(a), N(a)); var vb = new VPN(P(b), N(b)); var vc = new VPN(P(c), N(c));
                if (gira) prim.AddTriangle(va, vc, vb); else prim.AddTriangle(va, vb, vc);
            }
        }
        Mesh[chiave] = mb;
        return mb;
    }

    public static void Esegui(List<UObject> ex, string uscita)
    {
        var scena = new SceneBuilder();
        var radice = new NodeBuilder("stalla");
        var gruppi = new Dictionary<string, NodeBuilder>();
        var conti = new Dictionary<string, (int pezzi, long tri)>();
        var P = new Matrix4x4(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
        int fatti = 0, saltati = 0;
        foreach (var c in ex.Where(e => e.ExportType == "StaticMeshComponent"))
        {
            var sm = c.GetOrDefault<FPackageIndex>("StaticMesh")?.Load<UStaticMesh>();
            if (sm == null || Esclusi.Contains(sm.Name)) { saltati++; continue; }
            var mesh = Costruisci(sm, c);
            if (mesh == null) { saltati++; continue; }
            var m = Mondo(c, out var catena);
            var n = P * m * P; n.M41 *= 0.01f; n.M42 *= 0.01f; n.M43 *= 0.01f;
            var g = Gruppo(catena);
            if (!gruppi.TryGetValue(g, out var gn)) gruppi[g] = gn = radice.CreateNode(g);
            var nodo = gn.CreateNode();
            nodo.LocalMatrix = n;
            scena.AddRigidMesh(mesh, nodo);
            var k = conti.GetValueOrDefault(g); conti[g] = (k.pezzi + 1, k.tri + (sm.RenderData?.LODs?[0].IndexBuffer?.Length ?? 0) / 3);
            fatti++;
        }
        var model = scena.ToGltf2();
        model.SaveGLB(uscita);
        Console.WriteLine($"pezzi {fatti}, saltati {saltati}, mesh {Mesh.Count}, materiali {Mat.Count}");
        foreach (var kv in conti.OrderBy(k => k.Key)) Console.WriteLine($"  {kv.Value.pezzi,5} {kv.Value.tri,9:N0}  {kv.Key}");
        foreach (var kv in MatInfo) Console.WriteLine($"  mat {kv.Key} {kv.Value}");
        Console.WriteLine($"file {new FileInfo(uscita).Length / 1048576.0:F1} MB");
    }
}



