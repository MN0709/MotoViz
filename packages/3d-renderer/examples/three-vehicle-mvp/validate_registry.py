import json, struct
from pathlib import Path
BASE=Path(__file__).parent
registry=json.loads((BASE/'vehicles.json').read_text())
assert registry['schemaVersion']=='1.0.0'
vehicle_ids=set(); slot_ids=set(); report=[]
for vehicle in registry['vehicles']:
    assert vehicle['vehicleId'] not in vehicle_ids
    vehicle_ids.add(vehicle['vehicleId'])
    model=(BASE/vehicle['modelUrl']).resolve()
    assert model.exists() and model.suffix=='.glb'
    with model.open('rb') as f:
        magic,version,length=struct.unpack('<4sII',f.read(12)); assert magic==b'glTF' and version==2 and length==model.stat().st_size
        chunk_length,chunk_type=struct.unpack('<II',f.read(8)); assert chunk_type==0x4E4F534A
        gltf=json.loads(f.read(chunk_length).decode('utf-8').rstrip('\x00 '))
    node_names={n.get('name') for n in gltf.get('nodes',[]) if n.get('name')}
    keys=set()
    for slot in vehicle['slots']:
        assert slot['slotKey'] not in keys
        assert slot['slotId'] not in slot_ids
        assert slot['groupNode'] in node_names, (vehicle['vehicleId'],slot['groupNode'])
        keys.add(slot['slotKey']); slot_ids.add(slot['slotId'])
        for section in ('position','rotation','scale'):
            assert set(slot['mount'][section])=={'x','y','z'}
    assert vehicle['defaultSlotKey'] in keys
    report.append({'vehicleId':vehicle['vehicleId'],'model':model.name,'slots':len(keys),'replaceable':sum(s['replaceable'] for s in vehicle['slots']),'glbNodes':len(node_names)})
print(json.dumps({'ok':True,'vehicles':report},ensure_ascii=False,indent=2))
