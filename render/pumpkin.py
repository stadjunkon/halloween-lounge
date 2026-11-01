"""Procedural carved jack-o'-lantern for Cycles.

Env vars:
  MODE    lit | unlit | candle | moon   (which lights are on)
  RES     output size in px (square)
  SAMPLES render samples
  OUT     output png path
  VIEW    AgX | Standard
"""
import bpy, bmesh, math, os, random, time
from mathutils import Vector, noise

MODE = os.environ.get('MODE', 'lit')
RES = int(os.environ.get('RES', '640'))
SAMPLES = int(os.environ.get('SAMPLES', '64'))
OUT = os.environ.get('OUT', '/tmp/pumpkin.png')
VIEW = os.environ.get('VIEW', 'AgX')
SAVE_BLEND = os.environ.get('SAVE_BLEND')

random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection

# ---------------------------------------------------------------- materials
def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out

def principled(nt):
    return nt.nodes.new('ShaderNodeBsdfPrincipled')

def link(nt, a, b):
    nt.links.new(a, b)

def noise_tex(nt, scale, detail=4.0, rough=0.55, vec=None, distortion=0.0):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    n.inputs['Distortion'].default_value = distortion
    if vec is not None:
        link(nt, vec, n.inputs['Vector'])
    return n

def ramp(nt, inp, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0]
    el[1].position, el[1].color = stops[-1]
    for pos, c in stops[1:-1]:
        e = el.new(pos); e.color = c
    link(nt, inp, r.inputs['Fac'])
    return r

def mapping(nt, scale):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale
    link(nt, tc.outputs['Object'], mp.inputs['Vector'])
    return mp.outputs['Vector']

def mat_skin():
    m, nt, out = node_mat('skin')
    b = principled(nt)
    streak_vec = mapping(nt, (7.0, 7.0, 0.9))
    streak = noise_tex(nt, 2.2, 6, 0.6, streak_vec)
    blot = noise_tex(nt, 3.5, 5, 0.55)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = 0.5
    link(nt, streak.outputs['Fac'], mix.inputs['A']); link(nt, blot.outputs['Fac'], mix.inputs['B'])
    base = ramp(nt, mix.outputs['Result'], [
        (0.30, (0.33, 0.07, 0.008, 1)),
        (0.50, (0.62, 0.17, 0.018, 1)),
        (0.68, (0.80, 0.28, 0.03, 1)),
        (0.85, (0.70, 0.36, 0.06, 1)),
    ])
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value = 0.35
    aor = ramp(nt, ao.outputs['AO'], [(0.0, (0.22, 0.22, 0.22, 1)), (1.0, (1, 1, 1, 1))])
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    link(nt, base.outputs['Color'], mul.inputs['A']); link(nt, aor.outputs['Color'], mul.inputs['B'])
    link(nt, mul.outputs['Result'], b.inputs['Base Color'])
    rough = ramp(nt, blot.outputs['Fac'], [(0.3, (0.28, 0.28, 0.28, 1)), (0.8, (0.55, 0.55, 0.55, 1))])
    link(nt, rough.outputs['Color'], b.inputs['Roughness'])
    b.inputs['Coat Weight'].default_value = 0.25
    b.inputs['Coat Roughness'].default_value = 0.35
    b.inputs['Subsurface Weight'].default_value = 0.12
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.25, 0.05)
    b.inputs['Subsurface Scale'].default_value = 0.022
    pores = noise_tex(nt, 90, 3, 0.6)
    bumps = noise_tex(nt, 14, 6, 0.6)
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
    link(nt, pores.outputs['Fac'], add.inputs[0]); link(nt, bumps.outputs['Fac'], add.inputs[1])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.01
    link(nt, add.outputs['Value'], bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], b.inputs['Normal'])
    link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    return m

def mat_flesh():
    m, nt, out = node_mat('flesh')
    b = principled(nt)
    fib_vec = mapping(nt, (30.0, 30.0, 4.0))
    fib = noise_tex(nt, 3.0, 6, 0.65, fib_vec, distortion=0.4)
    base = ramp(nt, fib.outputs['Fac'], [(0.25, (0.92, 0.36, 0.05, 1)), (0.75, (1.0, 0.58, 0.16, 1))])
    link(nt, base.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.62
    b.inputs['Subsurface Weight'].default_value = 1.0
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.15)
    b.inputs['Subsurface Scale'].default_value = 0.09
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.008
    link(nt, fib.outputs['Fac'], bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], b.inputs['Normal'])
    link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    return m

def mat_stem():
    m, nt, out = node_mat('stem')
    b = principled(nt)
    v = mapping(nt, (18.0, 18.0, 1.2))
    st = noise_tex(nt, 2.0, 6, 0.6, v)
    base = ramp(nt, st.outputs['Fac'], [(0.3, (0.07, 0.065, 0.03, 1)), (0.6, (0.20, 0.18, 0.09, 1)), (0.8, (0.32, 0.30, 0.18, 1))])
    link(nt, base.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.78
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.5; bump.inputs['Distance'].default_value = 0.01
    link(nt, st.outputs['Fac'], bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], b.inputs['Normal'])
    link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    return m

def mat_wax():
    m, nt, out = node_mat('wax')
    b = principled(nt)
    b.inputs['Base Color'].default_value = (0.92, 0.84, 0.70, 1)
    b.inputs['Roughness'].default_value = 0.35
    b.inputs['Subsurface Weight'].default_value = 1.0
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.7, 0.4)
    b.inputs['Subsurface Scale'].default_value = 0.04
    link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    return m

def mat_flame(strength):
    m, nt, out = node_mat('flame')
    em = nt.nodes.new('ShaderNodeEmission')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    r = ramp(nt, lw.outputs['Facing'], [(0.0, (1.0, 0.92, 0.7, 1)), (0.55, (1.0, 0.55, 0.12, 1)), (1.0, (0.9, 0.25, 0.03, 1))])
    link(nt, r.outputs['Color'], em.inputs['Color'])
    em.inputs['Strength'].default_value = strength
    link(nt, em.outputs['Emission'], out.inputs['Surface'])
    return m

def mat_black():
    m, nt, out = node_mat('wick')
    b = principled(nt)
    b.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
    b.inputs['Roughness'].default_value = 0.9
    link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    return m

def mat_haze(density):
    m, nt, out = node_mat('haze')
    v = nt.nodes.new('ShaderNodeVolumePrincipled')
    v.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1)
    v.inputs['Anisotropy'].default_value = float(os.environ.get('ANISO', '0.45'))
    _hm = mapping(nt, (1.0, 1.0, 0.55))
    _hm.node.inputs['Location'].default_value = (float(os.environ.get('HAZE_OFF', '0')), 0.0, float(os.environ.get('HAZE_OFF', '0')) * 0.6)
    n = noise_tex(nt, float(os.environ.get('HAZE_SCALE', '1.3')), 6, 0.62, _hm, distortion=float(os.environ.get('HAZE_DIST', '0.6')))
    r = ramp(nt, n.outputs['Fac'], [(0.3, (0.12, 0.12, 0.12, 1)), (0.72, (1, 1, 1, 1))])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = density
    link(nt, r.outputs['Color'], mul.inputs[0])
    link(nt, mul.outputs['Value'], v.inputs['Density'])
    link(nt, v.outputs['Volume'], out.inputs['Volume'])
    return m

SKIN, FLESH, STEM, WAX, WICK = mat_skin(), mat_flesh(), mat_stem(), mat_wax(), mat_black()

# ---------------------------------------------------------------- body
H = 0.80          # height (half) scale
RIBS = 10
groove_at = [2 * math.pi * k / RIBS + random.uniform(-0.12, 0.12) for k in range(RIBS)]
lobe_bulge = [random.uniform(-0.035, 0.035) for _ in range(RIBS)]

def ang_dist(a, b):
    d = (a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)

def body_radius(phi, theta):
    """theta: 0 at top pole .. pi at bottom."""
    s = math.sin(theta)
    g = 0.0
    nearest = None
    for k, ga in enumerate(groove_at):
        d = ang_dist(phi, ga)
        g = max(g, math.exp(-(d / 0.075) ** 2))
    # which lobe we're on: between grooves
    idx = min(range(RIBS), key=lambda k: ang_dist(phi, groove_at[k] + math.pi / RIBS))
    r = 1.0 + lobe_bulge[idx] * s
    r -= 0.075 * g * (s ** 0.4)
    return r, g

def shape(x, y, z, inner=False):
    theta = math.acos(max(-1.0, min(1.0, z)))
    phi = math.atan2(y, x)
    r, g = body_radius(phi, theta)
    if inner:
        r = 1.0 + (r - 1.0) * 0.35
    p = Vector((x, y, z)) * r
    p.z *= H if p.z > 0 else H * 0.93
    rr = math.hypot(p.x, p.y)
    dim = 0.5 if inner else 1.0
    p.z -= 0.24 * dim * math.exp(-(rr / (0.30 if not inner else 0.45)) ** 2) * (1 if p.z > 0 else 0)
    p.z += 0.13 * dim * math.exp(-(rr / (0.30 if not inner else 0.45)) ** 2) * (1 if p.z < 0 else 0)
    if not inner:
        n = noise.noise(p * 1.6 + Vector((3.1, 1.7, 0.4)))
        p += p.normalized() * 0.022 * n
    else:
        p *= 0.86
        p.z += 0.0
    p.x += 0.025 * p.z
    return p

me = bpy.data.meshes.new('pumpkin')
bm = bmesh.new()
outer = bmesh.ops.create_uvsphere(bm, u_segments=160, v_segments=110, radius=1.0)
for v in outer['verts']:
    v.co = shape(*v.co)
inner = bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=64, radius=1.0)
for v in inner['verts']:
    v.co = shape(*v.co, inner=True)
inner_faces = list({f for v in inner['verts'] for f in v.link_faces})
bmesh.ops.reverse_faces(bm, faces=inner_faces)
for f in inner_faces:
    f.material_index = 1
bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('pumpkin', me)
col.objects.link(body)
body.data.materials.append(SKIN)
body.data.materials.append(FLESH)
for f in body.data.polygons:
    f.use_smooth = True

# ---------------------------------------------------------------- face cutters
def quad(p0, c, p1, n=14):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]) for t in [i / n for i in range(1, n + 1)]]

def eye(sg):
    pts = [(-.70 * sg, .47)]
    pts += quad((-.70 * sg, .47), (-.40 * sg, .38), (-.13 * sg, .17))
    pts += [(-.20 * sg, .11)]
    pts += quad((-.20 * sg, .11), (-.46 * sg, .05), (-.62 * sg, .19))
    pts += quad((-.62 * sg, .19), (-.71 * sg, .30), (-.70 * sg, .47))[:-1]
    return pts

def grin(N=9, xL=-.8, xR=.8, y0=0.0, dip=.2, th=.42, up=.56, lo=.46, pw=.55, seed=11):
    r = random.Random(seed)
    X = lambda t: xL + (xR - xL) * t
    U = lambda t: y0 - dip * (1 - (2 * t - 1) ** 2)
    S = lambda t: max(0.0, math.sin(math.pi * t)) ** pw
    Lo = lambda t: U(t) - th * S(t)
    pts = [(X(0), U(0))]
    for i in range(N):
        tm, te = (i + .5) / N, (i + 1) / N
        pts.append((X(tm) + (r.random() - .5) * .02, U(tm) - th * S(tm) * up * (.9 + r.random() * .2)))
        pts.append((X(te), U(te)))
    for i in range(N - 1, 0, -1):
        tb, tt = (i + .5) / N, i / N
        pts.append((X(tb), Lo(tb)))
        pts.append((X(tt) + (r.random() - .5) * .02, Lo(tt) + th * S(tt) * lo * (.9 + r.random() * .2)))
    pts.append((X(.5 / N), Lo(.5 / N)))
    return pts

def resample(pts, step=0.018):
    out = []
    n = len(pts)
    for i in range(n):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % n])
        seg = (b - a).length
        k = max(1, int(seg / step))
        for j in range(k):
            out.append(a.lerp(b, j / k))
    return out

def roughen(pts, amt=0.006, seed=0):
    out = []
    n = len(pts)
    for i, p in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % n]
        t = (b - a)
        nrm = Vector((-t.y, t.x)).normalized() if t.length > 1e-6 else Vector((0, 0))
        w = noise.noise(Vector((p.x * 9.0, p.y * 9.0, seed)))
        out.append(p + nrm * amt * w)
    return out

def prism(bm, pts, y_front=-1.6, y_back=-0.30, back_scale=0.80):
    front = [bm.verts.new((p.x, y_front, p.y)) for p in pts]
    back = [bm.verts.new((p.x * back_scale, y_back, p.y * back_scale)) for p in pts]
    n = len(pts)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))

cbm = bmesh.new()
shapes = [eye(1), eye(-1), [(0, .14), (-.06, -.035), (.06, -.035)], grin()]
for k, s in enumerate(shapes):
    pts = roughen(resample(s), 0.006, k * 3.7)
    prism(cbm, pts)

# lid cut: thin zig-zag ring through the top of the shell
def lid_ring(bm, r0=0.30, w=0.012, z0=0.30, z1=1.2, segs=96, zig=9):
    def rad(a):
        t = (a * zig / (2 * math.pi)) % 1.0
        return r0 + 0.028 * (abs(t * 2 - 1) - .5)
    rings = []
    for (rr, zz) in [(-w / 2, z0), (w / 2, z0), (w / 2, z1), (-w / 2, z1)]:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            R = rad(a) + rr
            ring.append(bm.verts.new((R * math.cos(a), R * math.sin(a) - 0.0, zz)))
        rings.append(ring)
    for q in range(4):
        A, B = rings[q], rings[(q + 1) % 4]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((A[i], A[j], B[j], B[i]))
lid_ring(cbm)

bmesh.ops.triangulate(cbm, faces=cbm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
bmesh.ops.recalc_face_normals(cbm, faces=cbm.faces[:])
cme = bpy.data.meshes.new('cutter')
cbm.to_mesh(cme); cbm.free()
cutter = bpy.data.objects.new('cutter', cme)
col.objects.link(cutter)
cutter.data.materials.append(FLESH)
cutter.hide_render = True

boo = body.modifiers.new('carve', 'BOOLEAN')
boo.operation = 'DIFFERENCE'
boo.object = cutter
boo.solver = 'EXACT'
try:
    boo.material_mode = 'TRANSFER'
except Exception:
    pass

# bake modifiers, then mark sharp edges on the cuts
t0 = time.time()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
newme = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
print('boolean s', round(time.time() - t0, 1), 'verts', len(body.data.vertices), '->', len(newme.vertices))
body.modifiers.clear()
old = body.data
body.data = newme
bpy.data.meshes.remove(old)
bpy.data.objects.remove(cutter)
bm = bmesh.new(); bm.from_mesh(body.data)
for f in bm.faces:
    f.smooth = True
for e in bm.edges:
    if len(e.link_faces) == 2:
        if e.calc_face_angle(0) > math.radians(38):
            e.smooth = False
bm.to_mesh(body.data); bm.free()
# make sure slot 1 is flesh and the walls (transferred) use flesh too
mats = [m.name for m in body.data.materials]
print('materials', mats)

# ---------------------------------------------------------------- stem
def top_z():
    # highest point near the axis
    zs = [v.co.z for v in body.data.vertices if math.hypot(v.co.x, v.co.y) < 0.06 and v.co.z > 0]
    return min(zs) if zs else 0.5
tz = top_z()
sm = bmesh.new()
segs, rings = 20, 26
prev = None
first = None
ridge_amp = 0.13
for i in range(rings + 1):
    t = i / rings
    cx = 0.20 * t * t - 0.02
    cz = tz - 0.05 + 0.38 * t
    rad = 0.105 * (1 - 0.42 * t) + 0.07 * math.exp(-t * 9)
    ring = []
    for j in range(segs):
        a = 2 * math.pi * j / segs
        rr = rad * (1 + ridge_amp * abs(math.cos(3 * a)) - ridge_amp * 0.5)
        rr *= 1 + 0.05 * noise.noise(Vector((a * 2, t * 6, 1.3)))
        ring.append(sm.verts.new((cx + rr * math.cos(a), rr * math.sin(a), cz)))
    if prev:
        for j in range(segs):
            k = (j + 1) % segs
            sm.faces.new((prev[j], prev[k], ring[k], ring[j]))
    else:
        first = ring
    prev = ring
cap = sm.faces.new(prev)
sm.faces.new(list(reversed(first)))
sme = bpy.data.meshes.new('stem'); sm.to_mesh(sme); sm.free()
stem = bpy.data.objects.new('stem', sme); col.objects.link(stem)
stem.data.materials.append(STEM)
for f in stem.data.polygons:
    f.use_smooth = True
stem.rotation_euler = (0, 0.12, 0)

# ---------------------------------------------------------------- candle
_ib = [v.co.z for v in body.data.vertices if math.hypot(v.co.x, v.co.y) < 0.08 and v.co.z < 0]
print('axis-bottom z values', sorted(_ib)[:3], sorted(_ib)[-3:], 'bbox z', min(v.co.z for v in body.data.vertices), max(v.co.z for v in body.data.vertices), 'bbox y', min(v.co.y for v in body.data.vertices), max(v.co.y for v in body.data.vertices))
inner_bottom = max(_ib) if _ib else -0.55
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.085, depth=0.2, location=(0, 0.02, inner_bottom + 0.09))
candle = bpy.context.active_object; candle.data.materials.append(WAX)
for f in candle.data.polygons: f.use_smooth = True
ctop = inner_bottom + 0.19
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.006, depth=0.04, location=(0, 0.02, ctop + 0.015))
bpy.context.active_object.data.materials.append(WICK)
FLAME_Z = ctop + 0.075
CDX = float(os.environ.get('CANDLE_DX', '0'))
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=(0, 0.02, FLAME_Z))
flame = bpy.context.active_object
flame.scale = (0.026, 0.026, 0.07)
flame.location.x += CDX * 0.6
flame.rotation_euler = (0, CDX * 6.0, 0)
for f in flame.data.polygons: f.use_smooth = True
candle_on = MODE in ('lit', 'candle')
flame.data.materials.append(mat_flame(60 if candle_on else 0))
flame.hide_render = not candle_on
flame.visible_shadow = False

# ---------------------------------------------------------------- lights
def add_light(name, kind, loc, energy, color, size=None, rot=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if size is not None:
        if kind == 'AREA':
            ld.size = size
        else:
            ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    col.objects.link(ob)
    return ob

def aim(ob, target=(0, 0, 0)):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

moon_on = MODE in ('lit', 'unlit', 'moon')
if candle_on:
    add_light('candle', 'POINT', (CDX, 0.02, FLAME_Z), float(os.environ.get('CANDLE_W', '40')), (1.0, 0.36, 0.07), size=0.02)
if moon_on:
    k = float(os.environ.get('MOON', '1.0')) * (0.16 if MODE == 'lit' else 1.0)
    key = add_light('key', 'AREA', (-3.2, -3.4, 3.6), 260 * k, (0.80, 0.86, 1.0), size=3.0); aim(key)
    rim = add_light('rim', 'AREA', (3.4, 3.2, 1.8), 380 * k, (0.75, 0.82, 1.0), size=2.0); aim(rim)
    fill = add_light('fill', 'AREA', (2.5, -4.0, -0.6), 25 * k, (1.0, 0.7, 0.5), size=4.0); aim(fill)
    for ob in (key, rim, fill):
        ob.visible_volume_scatter = False

# ---------------------------------------------------------------- haze
haze_density = float(os.environ.get('HAZE', '0.06'))
if haze_density > 0:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.5, 0.6))
    hz = bpy.context.active_object
    hz.scale = (6.0, 6.0, 4.4)
    hz.data.materials.append(mat_haze(haze_density))
    hz.visible_shadow = False

# ---------------------------------------------------------------- camera + render
camd = bpy.data.cameras.new('cam')
camd.lens = 72
camd.dof.use_dof = True
camd.dof.aperture_fstop = 5.6
cam = bpy.data.objects.new('cam', camd); col.objects.link(cam)
_cy = float(os.environ.get('CAM_YAW', '0.26'))
cam.location = (6.6 * math.sin(_cy), -6.6 * math.cos(_cy), 1.05)
aim(cam, (0, 0, 0.02))
camd.dof.focus_distance = 6.0
sc.camera = cam

w = bpy.data.worlds.new('w'); sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0

sc.render.engine = 'CYCLES'
cy = sc.cycles
cy.device = 'CPU'
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.use_denoising = True
try:
    cy.denoiser = 'OPENIMAGEDENOISE'
except Exception as e:
    print('denoiser', e)
cy.max_bounces = 8
cy.diffuse_bounces = 3
cy.glossy_bounces = 3
cy.transmission_bounces = 6
cy.volume_bounces = 1
cy.sample_clamp_indirect = 8
cy.volume_step_rate = float(os.environ.get('VSTEP', '1.0'))
cy.caustics_reflective = False
cy.caustics_refractive = False
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.film_transparent = False
sc.view_settings.view_transform = VIEW
try:
    if VIEW == 'AgX':
        sc.view_settings.look = os.environ.get('LOOK', 'AgX - Medium High Contrast')
except Exception as e:
    print('look', e)
sc.view_settings.exposure = float(os.environ.get('EXPO', '0'))
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '8'
sc.render.filepath = OUT
if SAVE_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=SAVE_BLEND)
t0 = time.time()
bpy.ops.render.render(write_still=True)
print('render s', round(time.time() - t0, 1), 'faces', len(body.data.polygons))
