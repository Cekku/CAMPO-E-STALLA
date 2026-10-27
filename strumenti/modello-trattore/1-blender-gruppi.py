# Libretto trattori, modello 3D, passo 1 (Blender 5.2):
#   blender -b --factory-startup --python 1-blender-gruppi.py -- jd8360r.glb trattore_gruppi.glb [anteprima.png]
# Ingresso: il glb convertito dal Collada di Sketchfab ("John Deere 8360r" di Miamux02, CC BY 4.0) con 0-dae-in-glb.mjs.
# - toglie la catena di traino (25 maglie da 2304 triangoli: un quarto del modello)
# - raddrizza il trattore (nel file è girato di ~12°), metri, davanti verso +X, terra a z = 0, centro tra gli assali
# - divide i pezzi nei gruppi dell'esploso (nodi "<gruppo>__g", maglie "<gruppo>__<colore>") per posizione e colore
# - ricolora le parti bianche (avevano texture che nel file non ci sono): verde John Deere, cerchi gialli, telaio scuro
# - aggiunge la meccanica schematica sotto cofano e cabina (motore, filtri, radiatori, trasmissione, assali)
# - unisce le maglie per gruppo e colore: da ~1600 oggetti a poche decine (meno chiamate di disegno sul telefono)
import bpy, bmesh, sys, math, mathutils
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]
PREVIEW = a[2] if len(a) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)

# catena di traino
chain = [o for o in meshes if (o.name.startswith('group_') or o.name == 'Mesh_1416') and tris(o) == 2304]
for o in chain: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('catena tolta:', len(chain))

# tutto in coordinate del mondo, senza genitori
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)

# ingombro dai vertici: dopo data.transform() il bound_box di Blender resta quello vecchio finché la scena non si aggiorna
def bb(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices] or [o.matrix_world.translation]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])
def centre(o): mn, mx = bb(o); return (mn + mx) / 2

# gomme: le maglie scure più grandi (Color_008), due grandi dietro e due piccole davanti
tyres = sorted([o for o in meshes if o.data.materials and o.data.materials[0].name == 'Color_008' and tris(o) >= 4300], key=lambda o: -(bb(o)[1].z - bb(o)[0].z))[:4]
big, small = tyres[:2], tyres[2:]
c = [centre(o) for o in tyres]
rl, rr = sorted([centre(o) for o in big], key=lambda v: v.x)
fl, fr = sorted([centre(o) for o in small], key=lambda v: v.x)
ang = -math.atan2((rr - rl).y + (fr - fl).y, (rr - rl).x + (fr - fl).x)   # asse delle ruote parallelo a X
R1 = Matrix.Rotation(ang, 4, 'Z')
for o in meshes: o.data.transform(R1)
for o in meshes: o.data.update()
# il davanti (ruote piccole) va verso +X: giro di 90° attorno a Z
fc = sum([centre(o) for o in small], Vector()) / 2; rc = sum([centre(o) for o in big], Vector()) / 2
R2 = Matrix.Rotation(math.radians(90 if fc.y < rc.y else -90), 4, 'Z')
for o in meshes: o.data.transform(R2); o.data.update()
# terra a zero, centro tra gli assali, mezzeria sulla Y
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in meshes:
    a1, b1 = bb(o); mn = Vector(map(min, mn, a1)); mx = Vector(map(max, mx, b1))
fc = sum([centre(o) for o in small], Vector()) / 2; rc = sum([centre(o) for o in big], Vector()) / 2
T = Matrix.Translation(Vector((-(fc.x + rc.x) / 2, -(fc.y + rc.y) / 2, -mn.z)))
for o in meshes: o.data.transform(T); o.data.update()

def wheel(o):
    a1, b1 = bb(o); return {'c': (a1 + b1) / 2, 'r': (b1.z - a1.z) / 2, 'w': (b1.y - a1.y) / 2}
W = {}
for o in big + small:
    w = wheel(o); key = ('ruota_post_' if o in big else 'ruota_ant_') + ('sx' if w['c'].y > 0 else 'dx')
    W[key] = w
for k, w in W.items(): print(k, [round(v, 2) for v in w['c']], 'r', round(w['r'], 2), 'w', round(w['w'], 2))
xr = W['ruota_post_sx']['c'].x; Rr = W['ruota_post_sx']['r']; xf = W['ruota_ant_sx']['c'].x; Rf = W['ruota_ant_sx']['r']
print('passo', round(xf - xr, 2))

def colhex(m):
    if not m or not m.use_nodes: return None, 1
    p = m.node_tree.nodes.get('Principled BSDF')
    if not p: return None, 1
    bc = p.inputs['Base Color'].default_value; al = p.inputs['Alpha'].default_value
    return tuple(bc[:3]), al
transp = lambda o: o.data.materials and colhex(o.data.materials[0])[1] < 0.99
# cabina: dai vetri (materiali trasparenti) sopra 1,8 m
glass = [o for o in meshes if transp(o) and centre(o).z > 1.8]
gmn = Vector((1e9,) * 3); gmx = Vector((-1e9,) * 3)
for o in glass:
    a1, b1 = bb(o); gmn = Vector(map(min, gmn, a1)); gmx = Vector(map(max, gmx, b1))
cab = (gmn.x - 0.12, gmx.x + 0.12, gmn.z - 0.35)
print('cabina x', round(cab[0], 2), round(cab[1], 2), 'da z', round(cab[2], 2))

def group_of(o):
    cc = centre(o); a1, b1 = bb(o); sz = b1 - a1
    for k, w in W.items():
        d = math.hypot(cc.x - w['c'].x, cc.z - w['c'].z)
        if d < w['r'] * 0.97 and abs(cc.y - w['c'].y) < w['w'] + 0.12 and max(sz.x, sz.z) < 2 * w['r'] + 0.15: return k
    if cc.x > xf + Rf * 0.75 and cc.z < 1.45: return 'zavorra'
    # scarico e presa d'aria: tubi alti e sottili davanti alla cabina
    if cc.x > cab[1] - 0.6 and cc.x < cab[1] + 0.5 and b1.z > 2.4 and max(sz.x, sz.y) < 0.4 and sz.z > 0.6 and not transp(o): return 'scarico'
    if cab[0] < cc.x < cab[1] and cc.z > cab[2] and abs(cc.y) < (gmx.y - gmn.y) / 2 + 0.7: return 'cabina'
    for k, w in W.items():
        d = math.hypot(cc.x - w['c'].x, cc.z - w['c'].z)
        if w['r'] * 0.9 < d < w['r'] * 1.45 and cc.z > w['c'].z - 0.1 and abs(cc.y - w['c'].y) < w['w'] + 0.35: return 'parafanghi'
    if cc.x < xr - Rr * 0.45 and cc.z < 2.0 and abs(cc.y) < 0.95: return 'sollevatore'
    if cc.x > cab[0] - 0.05 and cc.z > 1.1 and abs(cc.y) < 0.8: return 'cofano'
    if xr + Rr * 0.9 < cc.x < xf - Rf * 0.9 and cc.z < 1.9 and abs(cc.y) > 0.42: return 'serbatoio'
    return 'telaio'

GREEN = (0.0368, 0.2016, 0.0242)     # #367C2B in lineare
YELLOW = (0.887, 0.716, 0.0)          # #F2DA00 circa
DARK = (0.016, 0.018, 0.017)
LIGHT = (0.70, 0.72, 0.71)
PAINT = {'cofano': GREEN, 'parafanghi': GREEN, 'serbatoio': GREEN, 'telaio': DARK, 'sollevatore': DARK, 'zavorra': DARK, 'scarico': DARK, 'cabina': LIGHT,
         'ruota_ant_sx': YELLOW, 'ruota_ant_dx': YELLOW, 'ruota_post_sx': YELLOW, 'ruota_post_dx': YELLOW}
mats = {}
def mat(key, rgb, alpha=1.0, rough=0.5, metal=0.0):
    if key in mats: return mats[key]
    m = bpy.data.materials.new(key); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    if alpha < 1: p.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    mats[key] = m; return m

groups = {}
for o in meshes:
    g = group_of(o); groups.setdefault(g, []).append(o)
    newm = []
    for m in o.data.materials:
        rgb, al = colhex(m)
        if rgb is None: rgb = (0.8, 0.8, 0.8)
        white = min(rgb) > 0.85 and al > 0.99
        jdgreen = abs(rgb[0] - 0.0368) < 0.05 and 0.1 < rgb[1] < 0.3 and rgb[2] < 0.05
        if white or jdgreen:
            pc = PAINT[g]; newm.append(mat(g + '_vernice', pc, 1, 0.42 if pc in (GREEN, YELLOW) else 0.6))
        elif al < 0.99: newm.append(mat('vetro', (0.06, 0.09, 0.1), 0.35, 0.05))
        else:
            k = 'c%02x%02x%02x' % tuple(int(min(1, v) ** (1 / 2.2) * 255) for v in rgb)
            dark = max(rgb) < 0.05
            newm.append(mat(k, rgb, 1, 0.85 if dark else 0.5))
    for i, m in enumerate(newm): o.data.materials[i] = m
for g, l in sorted(groups.items()): print('gruppo', g, len(l), 'maglie', sum(tris(o) for o in l), 'triangoli')

# --- meccanica schematica (non c'è nel modello): stesse misure ricavate dal trattore ---
def box(name, g, cx, cy, cz, sx, sy, sz, m, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz)); o = bpy.context.object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 2; bpy.ops.object.modifier_apply(modifier='b')
    o.data.materials.append(m); groups.setdefault(g, []).append(o); return o
def cyl(name, g, cx, cy, cz, r, l, axis, m, verts=24):
    rot = {'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=l, location=(cx, cy, cz), rotation=rot); o = bpy.context.object
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(m); groups.setdefault(g, []).append(o); return o
IRON = mat('ghisa', (0.05, 0.06, 0.055), 1, 0.7, 0.3)
ENG = mat('motore_verde', GREEN, 1, 0.5)
FILT = mat('filtro', (0.75, 0.62, 0.0), 1, 0.45)      # filtri gialli John Deere
ALU = mat('alluminio', (0.55, 0.56, 0.56), 1, 0.35, 0.8)
RED = mat('rosso', (0.5, 0.02, 0.01), 1, 0.5)
x0 = cab[0] + 0.15; x1 = xf + Rf * 0.55          # motore dal davanti della cabina al muso
ex = (x0 + x1) / 2; el = (x1 - x0) * 0.62
box('blocco', 'motore', ex - 0.05, 0, 1.05, el, 0.62, 0.62, ENG, 0.04)
box('testata', 'motore', ex - 0.05, 0, 1.5, el * 0.95, 0.5, 0.26, ENG, 0.03)
box('coppa', 'motore', ex - 0.05, 0, 0.66, el * 0.9, 0.5, 0.18, IRON)
cyl('filtro olio', 'motore', ex + el * 0.15, -0.36, 0.9, 0.065, 0.2, 'z', FILT)
cyl('filtro gasolio', 'motore', ex - el * 0.25, -0.36, 1.25, 0.05, 0.18, 'z', FILT)
cyl('prefiltro', 'motore', ex - el * 0.36, -0.36, 1.2, 0.05, 0.16, 'z', FILT)
cyl('filtro aria', 'motore', ex + el * 0.1, 0.3, 1.75, 0.15, 0.6, 'x', mat('filtro_aria', (0.03, 0.03, 0.03), 1, 0.8))
cyl('alternatore', 'motore', x1 - 0.35, 0.33, 1.05, 0.09, 0.16, 'x', ALU)
cyl('turbo', 'motore', ex - el * 0.2, 0.37, 1.35, 0.12, 0.14, 'y', ALU)
box('batteria', 'motore', x1 - 0.15, -0.2, 1.62, 0.3, 0.2, 0.22, mat('batteria', (0.02, 0.02, 0.02), 1, 0.6))
box('radiatore', 'radiatori', x1 + 0.12, 0, 1.25, 0.08, 0.72, 0.85, ALU, 0.01)
box('intercooler', 'radiatori', x1 + 0.22, 0, 1.25, 0.05, 0.72, 0.8, mat('intercooler', (0.2, 0.2, 0.21), 1, 0.4, 0.6), 0.01)
cyl('ventola', 'radiatori', x1 + 0.02, 0, 1.25, 0.32, 0.06, 'x', mat('ventola', (0.05, 0.05, 0.05), 1, 0.7))
# trasmissione dal motore all'assale posteriore, scatola del ponte e assale anteriore
tx0 = xr - 0.25; tx1 = x0 + 0.05
box('cambio', 'trasmissione', (tx0 + tx1) / 2, 0, 0.82, tx1 - tx0, 0.62, 0.6, IRON, 0.04)
cyl('ponte posteriore', 'trasmissione', xr, 0, W['ruota_post_sx']['c'].z, 0.2, (W['ruota_post_sx']['c'].y - W['ruota_post_sx']['w']) * 2 + 0.1, 'y', IRON)
box('pompa idraulica', 'trasmissione', tx1 - 0.25, 0.36, 0.7, 0.22, 0.14, 0.2, RED, 0.02)
cyl('assale anteriore', 'assale_ant', xf, 0, W['ruota_ant_sx']['c'].z, 0.13, (W['ruota_ant_sx']['c'].y - W['ruota_ant_sx']['w']) * 2 + 0.05, 'y', IRON)
box('differenziale anteriore', 'assale_ant', xf, 0, W['ruota_ant_sx']['c'].z, 0.34, 0.36, 0.34, IRON, 0.04)
cyl('cilindro sterzo', 'assale_ant', xf + 0.22, 0, W['ruota_ant_sx']['c'].z + 0.05, 0.035, 1.1, 'y', ALU)

# unione per gruppo e colore; nodo vuoto per ogni gruppo (l'app sposta il nodo nell'esploso)
bpy.ops.object.select_all(action='DESELECT')
for g, l in groups.items():
    by = {}
    for o in l:
        if not o.data.materials: continue
        by.setdefault(o.data.materials[0].name, []).append(o)
        if len(o.data.materials) > 1:   # maglie con più materiali: si separano prima di unire
            pass
    emp = bpy.data.objects.new(g + '__g', None); bpy.context.scene.collection.objects.link(emp)
    for mname, ol in by.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in ol: o.select_set(True)
        bpy.context.view_layer.objects.active = ol[0]
        if len(ol) > 1: bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active; j.name = g + '__' + mname; j.data.name = j.name; j.parent = emp
tot = sum(tris(o) for o in bpy.data.objects if o.type == 'MESH')
print('oggetti', len([o for o in bpy.data.objects if o.type == 'MESH']), 'triangoli', tot)

if PREVIEW:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.render.resolution_x = 1100; sc.render.resolution_y = 700
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    ctr = Vector((0, 0, 1.6))
    for k, p in {'a': Vector((8, -9, 5)), 'b': Vector((-8, 8, 4)), 'lato': Vector((0, -13, 1.8))}.items():
        cam.location = ctr + p; cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 40
        sc.render.filepath = PREVIEW + '_' + k + '.png'; bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False)
print('scritto', OUT)
