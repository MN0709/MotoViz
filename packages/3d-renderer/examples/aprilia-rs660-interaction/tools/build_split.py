import bpy
import hashlib
import json
import os

from mathutils import Vector

SOURCE = os.environ.get('SOURCE_GLB')
if not SOURCE:
    raise RuntimeError('请通过 SOURCE_GLB 指定本地源 GLB')
BASE = os.path.dirname(os.path.dirname(__file__))
OUT = BASE
os.makedirs(OUT, exist_ok=True)

GROUP_LABELS = {
    'base_assembly': '机械基础层',
    'mirror_left': '左后视镜总成',
    'mirror_right': '右后视镜总成',
    'windscreen': '风挡及边框紧固件',
    'front_cowl': '车头外壳与灯组',
    'front_fender': '前挡泥板',
    'tank': '油箱外壳',
    'seat': '主坐垫',
    'tail': '后座与尾壳总成',
    'fairing_left': '左侧整流罩',
    'fairing_right': '右侧整流罩',
    'lower_cowl': '底部导流罩',
    'front_wheel': '前轮总成',
    'rear_wheel': '后轮总成',
    'muffler': '排气尾段',
    'license_bracket': '牌照架与后挡泥板',
}

WHOLE_OBJECTS = {
    'f_rim024': 'front_wheel',
    'f_tyre001': 'front_wheel',
    'frontbrake024': 'front_wheel',
    'frontbrake024_R': 'front_wheel',
    'b_rim024': 'rear_wheel',
    'b_tyre014': 'rear_wheel',
    'backbrake024': 'rear_wheel',
    'gear024': 'rear_wheel',
    'muffler024': 'muffler',
    'BASE_glass_edge': 'windscreen',
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']


def geometry_signature():
    geometry_hashes = []
    uv_hashes = []
    full_hashes = []
    face_count = 0
    for obj in [item for item in bpy.context.scene.objects if item.type == 'MESH']:
        mesh = obj.data
        matrix = obj.matrix_world
        uv_layers = list(mesh.uv_layers)
        for polygon in mesh.polygons:
            geometry_corners = []
            uv_corners = []
            for loop_index in polygon.loop_indices:
                vertex = matrix @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
                geometry_corner = tuple(round(value, 6) for value in vertex)
                corner = list(geometry_corner)
                for uv_layer in uv_layers:
                    corner.extend(round(value, 7) for value in uv_layer.data[loop_index].uv)
                geometry_corners.append(geometry_corner)
                uv_corners.append(tuple(corner))
            # Separation may rotate/reverse loop order while preserving the
            # exact geometry and UV-to-vertex correspondence.
            geometry_payload = sorted(geometry_corners)
            uv_payload = sorted(uv_corners)
            material = ''
            if polygon.material_index < len(obj.material_slots):
                slot = obj.material_slots[polygon.material_index]
                material = slot.material.name if slot.material else ''
            geometry_digest = hashlib.sha256(repr(geometry_payload).encode()).digest()
            uv_digest = hashlib.sha256(repr(uv_payload).encode()).digest()
            full_digest = hashlib.sha256((repr(uv_payload) + material).encode()).digest()
            geometry_hashes.append(geometry_digest)
            uv_hashes.append(uv_digest)
            full_hashes.append(full_digest)
            face_count += 1
    result = {'faces': face_count}
    for key, hashes in [('geometry', geometry_hashes), ('geometry_uv', uv_hashes), ('geometry_uv_material', full_hashes)]:
        hashes.sort()
        final = hashlib.sha256()
        for digest in hashes:
            final.update(digest)
        result[key] = final.hexdigest()
    return result


def connected_components(obj):
    mesh = obj.data
    adjacency = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    owner = [-1] * len(mesh.vertices)
    components = []
    for start in range(len(mesh.vertices)):
        if owner[start] >= 0:
            continue
        component_index = len(components)
        owner[start] = component_index
        stack = [start]
        vertices = []
        while stack:
            current = stack.pop()
            vertices.append(current)
            for neighbor in adjacency[current]:
                if owner[neighbor] < 0:
                    owner[neighbor] = component_index
                    stack.append(neighbor)
        components.append(vertices)
    faces = [[] for _ in components]
    for polygon in mesh.polygons:
        if polygon.vertices:
            faces[owner[polygon.vertices[0]]].append(polygon.index)
    rows = []
    for component_index, vertices in enumerate(components):
        points = [obj.matrix_world @ mesh.vertices[index].co for index in vertices]
        minimum = Vector([min(point[axis] for point in points) for axis in range(3)])
        maximum = Vector([max(point[axis] for point in points) for axis in range(3)])
        center = (minimum + maximum) / 2
        size = maximum - minimum
        rows.append({
            'component': component_index,
            'faces': faces[component_index],
            'face_count': len(faces[component_index]),
            'min': minimum,
            'max': maximum,
            'center': center,
            'size': size,
        })
    return rows


def classify(name, row):
    c, mn, mx, size = row['center'], row['min'], row['max'], row['size']

    if name in {'livery_1_024_001', 'mirror024'}:
        return 'mirror_left' if c.y >= 0 else 'mirror_right'

    if name == 'livery_0_024_001':
        # Existing complete shells only. Rules are intentionally conservative;
        # anything ambiguous stays in the mechanical base.
        if c.x > 0.54 and c.z < 0.64 and mx.z < 0.70:
            return 'front_fender'
        if mx.x < -0.32 and mn.z > 0.60:
            return 'tail'
        if -0.55 < c.x < -0.08 and 0.72 < c.z < 0.96 and size.y > 0.12:
            return 'seat'
        if -0.20 < c.x < 0.25 and c.z > 0.88 and mn.z > 0.78:
            return 'tank'
        if mn.x > 0.34 and mn.z > 0.58:
            return 'front_cowl'
        if mx.z < 0.42 and mx.x > -0.30:
            return 'lower_cowl'
        if -0.18 < c.x < 0.52 and 0.35 < c.z < 0.90 and abs(c.y) > 0.055:
            return 'fairing_left' if c.y > 0 else 'fairing_right'
        return None

    if name == 'glass024_001':
        if c.x > 0.38 and c.z > 0.95:
            return 'windscreen'
        if c.x > 0.56 and c.z < 0.94:
            return 'front_cowl'
        if c.x < -0.62 and c.z > 0.84:
            return 'tail'
        return None

    if name in {'glass024_001.001', 'light024'}:
        if c.x > 0.54:
            return 'front_cowl'
        if c.x < -0.62:
            return 'tail'
        return None

    if name == 'homologation024':
        if c.x < -0.72:
            return 'license_bracket'
        if c.x > 0.52:
            return 'front_cowl'
        return None

    if name == 'mechanics024_001':
        # Only small, complete fasteners in the verified windscreen envelope.
        if 0.38 < c.x < 0.67 and c.z > 1.015 and max(size) < 0.055:
            return 'windscreen'
        # Mirror mounts and fasteners remain with their corresponding mirror.
        if 0.52 < c.x < 0.72 and c.z > 0.94 and abs(c.y) > 0.24 and max(size) < 0.09:
            return 'mirror_left' if c.y > 0 else 'mirror_right'
        return None

    return None


def parent_keep_transform(obj, parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


root = bpy.data.objects.new('aprilia_rs660_root', None)
bpy.context.collection.objects.link(root)
groups = {}
for key, label in GROUP_LABELS.items():
    group = bpy.data.objects.new(key, None)
    bpy.context.collection.objects.link(group)
    group.parent = root
    group['label'] = label
    group['partId'] = f'APR-RS660-{key.upper()}'
    group['interactive'] = key != 'base_assembly'
    groups[key] = group

before = geometry_signature()
assignment_audit = []

# Parent already safe whole objects first.
for obj in mesh_objects:
    target = WHOLE_OBJECTS.get(obj.name)
    if target:
        parent_keep_transform(obj, groups[target])
        assignment_audit.append({
            'source': obj.name,
            'mode': 'whole-object',
            'group': target,
            'faces': len(obj.data.polygons),
        })

# Extract whole connected components from mixed material/category objects.
for obj in list(mesh_objects):
    if obj.name in WHOLE_OBJECTS or obj.parent in groups.values():
        continue
    rows = connected_components(obj)
    assigned = {}
    for row in rows:
        target = classify(obj.name, row)
        if not target or not row['faces']:
            continue
        assigned.setdefault(target, []).extend(row['faces'])
        assignment_audit.append({
            'source': obj.name,
            'component': row['component'],
            'mode': 'whole-component',
            'group': target,
            'faces': row['face_count'],
            'min': [round(value, 6) for value in row['min']],
            'max': [round(value, 6) for value in row['max']],
        })
    if not assigned:
        continue
    source_face = obj.data.attributes.new('source_face', 'INT', 'FACE')
    for index, value in enumerate(source_face.data):
        value.value = index
    for target, original_faces in assigned.items():
        wanted = set(original_faces)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        attribute = obj.data.attributes['source_face']
        for polygon in obj.data.polygons:
            polygon.select = attribute.data[polygon.index].value in wanted
        previous = set(bpy.data.objects)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        created = [item for item in set(bpy.data.objects) - previous if item.type == 'MESH']
        if len(created) != 1:
            raise RuntimeError(f'Expected one separated object for {obj.name}/{target}, got {len(created)}')
        separated = created[0]
        separated.name = f'{target}_from_{obj.name}'
        parent_keep_transform(separated, groups[target])

# Everything not assigned becomes the stable mechanical base.
for obj in [item for item in bpy.context.scene.objects if item.type == 'MESH']:
    attribute = obj.data.attributes.get('source_face')
    if attribute:
        obj.data.attributes.remove(attribute)
    if not obj.data.polygons:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if obj.parent not in groups.values():
        parent_keep_transform(obj, groups['base_assembly'])

after = geometry_signature()
if before['faces'] != after['faces'] or before['geometry'] != after['geometry']:
    raise RuntimeError(f'Geometry changed during safe split: {before} != {after}')

# Remove empty interaction groups rather than claiming unsupported parts.
for key in list(groups):
    if key == 'base_assembly':
        continue
    if not [child for child in groups[key].children_recursive if child.type == 'MESH']:
        bpy.data.objects.remove(groups[key], do_unlink=True)
        del groups[key]

all_mesh = [item for item in bpy.context.scene.objects if item.type == 'MESH']
manifest = {
    'source': SOURCE,
    'source_sha256': hashlib.sha256(open(SOURCE, 'rb').read()).hexdigest(),
    'vehicle': 'Aprilia RS 660 2021（依据文件名与模型外观，未核来源页）',
    'method': '完整对象或完整连续网格岛重组；零多边形硬切；机械主体保留为基础层',
    'dimensions_m': [2.008541, 0.830007, 1.210548],
    'groups': {},
    'geometry_check': {
        'before': before,
        'after': after,
        'faces_and_world_geometry_preserved': before['faces'] == after['faces'] and before['geometry'] == after['geometry'],
        'uv_signature_preserved': before['geometry_uv'] == after['geometry_uv'],
        'material_signature_preserved': before['geometry_uv_material'] == after['geometry_uv_material'],
    },
}
for key, group in groups.items():
    children = [child for child in group.children_recursive if child.type == 'MESH']
    manifest['groups'][key] = {
        'label': GROUP_LABELS[key],
        'partId': group['partId'],
        'interactive': bool(group['interactive']),
        'objects': [child.name for child in children],
        'vertices': sum(len(child.data.vertices) for child in children),
        'faces': sum(len(child.data.polygons) for child in children),
    }

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
with open(os.path.join(OUT, 'assignment-audit.json'), 'w', encoding='utf-8') as handle:
    json.dump(assignment_audit, handle, ensure_ascii=False, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Aprilia-RS660-editable.blend'))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'Aprilia-RS660-split.glb'),
    export_format='GLB',
    export_extras=True,
    export_yup=True,
    export_materials='EXPORT',
)

# Material renders for assembled/exploded comparison.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1100
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
if scene.world is None:
    scene.world = bpy.data.worlds.new('PreviewWorld')
scene.world.color = (0.03, 0.03, 0.03)

points = [obj.matrix_world @ Vector(corner) for obj in all_mesh for corner in obj.bound_box]
minimum = Vector([min(point[i] for point in points) for i in range(3)])
maximum = Vector([max(point[i] for point in points) for i in range(3)])
center = (minimum + maximum) / 2
size = maximum - minimum

bpy.ops.object.light_add(type='AREA', location=center + Vector((2.5, -2.0, 2.5)))
bpy.context.object.data.energy = 1800
bpy.context.object.data.size = 3.0
bpy.ops.object.light_add(type='AREA', location=center + Vector((-2.0, 2.0, 1.7)))
bpy.context.object.data.energy = 1100
bpy.context.object.data.size = 3.0
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.lens = 58


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()


camera.location = center + Vector((2.55, -2.55, 1.55))
aim(camera, center + Vector((0, 0, 0.12)))
scene.render.filepath = os.path.join(OUT, 'assembled.png')
bpy.ops.render.render(write_still=True)

offsets = {
    'mirror_left': (0.03, 0.22, 0.10),
    'mirror_right': (0.03, -0.22, 0.10),
    'windscreen': (0.12, 0.0, 0.14),
    'front_cowl': (0.13, 0.0, 0.04),
    'front_fender': (0.10, 0.0, 0.11),
    'tank': (0.0, 0.0, 0.18),
    'seat': (-0.05, 0.0, 0.15),
    'tail': (-0.15, 0.0, 0.09),
    'fairing_left': (0.0, 0.20, 0.0),
    'fairing_right': (0.0, -0.20, 0.0),
    'lower_cowl': (0.0, 0.0, -0.13),
    'front_wheel': (0.16, 0.0, -0.05),
    'rear_wheel': (-0.16, 0.0, -0.05),
    'muffler': (-0.05, -0.16, -0.05),
    'license_bracket': (-0.15, 0.0, 0.02),
}
for key, offset in offsets.items():
    if key in groups:
        groups[key].location = offset
scene.render.filepath = os.path.join(OUT, 'exploded.png')
bpy.ops.render.render(write_still=True)
for group in groups.values():
    group.location = (0, 0, 0)

print(json.dumps({
    'output': OUT,
    'groups': {key: value['faces'] for key, value in manifest['groups'].items()},
    'geometry_check': manifest['geometry_check'],
}, ensure_ascii=False))
