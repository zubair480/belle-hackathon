"""Synthetic robot-assembly reference fixture. Not a Neo4j application."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import deque
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parent


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def fixture():
    entities = {}
    for serial in ['E001', 'E002', 'E003', 'E004', 'E005', 'E006', 'E101', 'E102', 'E900']:
        batch = 'B18' if serial in ['E101', 'E102'] else ('B17' if serial != 'E900' else None)
        entities[serial] = {'id': serial, 'kind': 'component', 'partNumber': 'ENC-42', 'partRevision': 'A',
            'serialNumber': serial, 'issuerId': 'SUP-A', 'batchId': batch,
            'originEvidenceId': 'SYNTHETIC-RECEIPT-' + serial if batch else None,
            'locationState': 'quarantine' if serial == 'E006' else ('onsite' if serial == 'E005' else 'installed')}
    for serial in ['J001', 'J002', 'J003', 'J004', 'J005', 'J006', 'J007']:
        entities[serial] = {'id': serial, 'kind': 'subassembly', 'partNumber': 'JOINT-10', 'partRevision': 'B',
            'serialNumber': serial, 'issuerId': 'OEM-DEMO', 'batchId': None, 'locationState': 'installed'}
    for serial in ['R001', 'R002', 'R003', 'R004', 'R005', 'R006']:
        entities[serial] = {'id': serial, 'kind': 'robot', 'partNumber': 'ARM-100', 'partRevision': 'A',
            'serialNumber': serial, 'issuerId': 'OEM-DEMO', 'batchId': None,
            'locationState': 'onsite' if serial == 'R003' else 'shipped'}
    installs = []
    def add(child, parent, slot, day=2, removed=None):
        installation_id = f'I{len(installs)+1:02d}'
        installs.append({'id': installation_id, 'childId': child, 'parentId': parent, 'slotId': slot,
            'installedAt': f'2026-09-{day:02d}T10:00:00Z',
            'removedAt': f'2026-09-{removed:02d}T10:00:00Z' if removed else None,
            'recordedAt': '2026-09-10T12:00:00Z',
            'evidenceId': 'SYNTHETIC-BUILD-' + installation_id})
    for encoder, joint, robot, slot in [('E001','J001','R001','joint-1'),
        ('E002','J002','R002','joint-1'), ('E003','J003','R002','joint-2'),
        ('E004','J004','R003','joint-1'), ('E900','J005','R005','joint-1')]:
        add(encoder, joint, 'encoder')
        add(joint, robot, slot, day=3)
    add('E006', 'J006', 'encoder', removed=8)
    add('J006', 'R006', 'joint-1', day=3)
    add('E102', 'J006', 'encoder', day=8)
    add('E101', 'J007', 'encoder')
    add('J007', 'R004', 'joint-1', day=3)
    shipments = [{'id': 'SHIP-' + r, 'unitId': r, 'customerId': customer,
        'shippedAt': '2026-09-09T10:00:00Z', 'evidenceId': 'SYNTHETIC-SHIP-' + r}
        for r, customer in [('R001','CUST-A'),('R002','CUST-B'),('R004','CUST-A'),('R005','CUST-C'),('R006','CUST-D')]]
    return {'contractVersion': 'assembly-quality-v3', 'revisionId': 'assembly-r1',
        'workspaceId': 'synthetic-robot-assembler',
        'scope': {'siteId': 'S1', 'configurationAsOf': '2026-09-10T23:59:59Z',
                  'historyFrom': '2026-09-01T00:00:00Z', 'trackedPartNumber': 'ENC-42'},
        'batches': {'B17': {'supplierId': 'SUP-A', 'partNumber': 'ENC-42', 'externalCode': 'ENC-B17'},
                    'B18': {'supplierId': 'SUP-A', 'partNumber': 'ENC-42', 'externalCode': 'ENC-B18'}},
        'entities': entities, 'installations': installs, 'shipments': shipments,
        'containers': [{'id': 'CRATE-1', 'unitIds': ['R001', 'R004']}],
        'engineeringReviews': [{'unitId': 'R006', 'state': 'pending',
            'reason': 'Suspect encoder was removed; replacement does not settle possible prior effects.'}],
        'notes': ['All identities and records are synthetic.',
                  'Only the tracked encoder family is modeled, not the complete machine BOM.',
                  'Current means the recorded configuration at the selected cutoff.']}


def interval(edge):
    return instant(edge['installedAt']), instant(edge['removedAt']) if edge['removedAt'] else datetime.max.replace(tzinfo=timezone.utc)


def overlaps(a, b):
    return max(a[0], b[0]) < min(a[1], b[1])


def validate(data):
    entities = data['entities']
    identities = set()
    for entity in entities.values():
        identity = (entity['issuerId'], entity['partNumber'], entity['serialNumber'])
        if identity in identities:
            raise ValueError('Duplicate component or unit identity')
        identities.add(identity)
        batch_id = entity.get('batchId')
        if batch_id:
            batch = data['batches'].get(batch_id)
            if not batch or batch['partNumber'] != entity['partNumber'] or batch['supplierId'] != entity['issuerId']:
                raise ValueError('Inconsistent batch identity')
    accepted = {}
    for edge in data['installations']:
        if edge['id'] in accepted:
            if accepted[edge['id']] != edge:
                raise ValueError('Conflicting installation ID')
            continue
        if edge['childId'] not in entities or edge['parentId'] not in entities:
            raise ValueError('Absent entity reference')
        if entities[edge['parentId']]['kind'] == 'component':
            raise ValueError('Invalid parent kind')
        if edge['childId'] == edge['parentId'] or interval(edge)[0] >= interval(edge)[1]:
            raise ValueError('Invalid installation interval')
        accepted[edge['id']] = edge
    edges = list(accepted.values())
    for i, first in enumerate(edges):
        for second in edges[i+1:]:
            if not overlaps(interval(first), interval(second)):
                continue
            if first['childId'] == second['childId']:
                raise ValueError('Serialized item has overlapping parents')
            if (first['parentId'], first['slotId']) == (second['parentId'], second['slotId']):
                raise ValueError('Two items occupy one slot at the same time')
    # A cycle is invalid only where all its relationship intervals overlap.
    for origin in entities:
        queue = deque([(origin, datetime.min.replace(tzinfo=timezone.utc), datetime.max.replace(tzinfo=timezone.utc), (origin,))])
        while queue:
            child, low, high, path = queue.popleft()
            for edge in edges:
                if edge['childId'] != child:
                    continue
                start, end = interval(edge)
                a, b = max(low,start), min(high,end)
                if a >= b:
                    continue
                if edge['parentId'] in path:
                    raise ValueError('Overlapping containment cycle')
                queue.append((edge['parentId'], a, b, path + (edge['parentId'],)))
    shipment_ids, shipped_units = set(), set()
    for line in data['shipments']:
        if line['id'] in shipment_ids or line['unitId'] in shipped_units or line['unitId'] not in entities:
            raise ValueError('Duplicate or invalid synthetic shipment')
        shipment_ids.add(line['id'])
        shipped_units.add(line['unitId'])
    return edges


def ancestors(edges, roots, low, high):
    found, states = set(roots), set()
    queue = deque((r, low, high) for r in roots)
    while queue:
        child, start, end = queue.popleft()
        state = (child, start, end)
        if state in states:
            continue
        states.add(state)
        for edge in edges:
            if edge['childId'] != child:
                continue
            a, b = interval(edge)
            next_start, next_end = max(start,a), min(end,b)
            if next_start < next_end:
                found.add(edge['parentId'])
                queue.append((edge['parentId'], next_start, next_end))
    return found


def trace(data, batch_id='B17'):
    edges = validate(data)
    entities = data['entities']
    cutoff = instant(data['scope']['configurationAsOf'])
    end = cutoff + timedelta(microseconds=1)
    start = instant(data['scope']['historyFrom'])
    roots = {k for k,v in entities.items() if v.get('batchId') == batch_id}
    unknown = {k for k,v in entities.items() if v['kind'] == 'component' and not v.get('batchId') and v['partNumber'] == data['scope']['trackedPartNumber']}
    current = ancestors(edges, roots, cutoff, end)
    historical = ancestors(edges, roots, start, end)
    unresolved = ancestors(edges, unknown, cutoff, end)
    robots = {k for k,v in entities.items() if v['kind'] == 'robot'}
    current_robots = current & robots
    historical_only = (historical & robots) - current_robots
    unresolved_only = (unresolved & robots) - current_robots
    ships = {s['unitId']: s for s in data['shipments'] if instant(s['shippedAt']) <= cutoff}
    shipped = current_robots & set(ships)
    loose = roots - {e['childId'] for e in edges if interval(e)[0] <= cutoff < interval(e)[1]}
    def count_location(ids, state):
        return sum(entities[i]['locationState'] == state for i in ids)
    result = {'contractVersion': 'assembly-quality-v3', 'revisionId': data['revisionId'],
        'dataHash': hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest(),
        'currentRobotIds': sorted(current_robots), 'currentShippedRobotIds': sorted(shipped),
        'currentCustomerIds': sorted({ships[r]['customerId'] for r in shipped}),
        'historicalOnlyRobotIds': sorted(historical_only), 'unresolvedOnlyRobotIds': sorted(unresolved_only),
        'originGapRobotIds': sorted(unresolved & robots),
        'noRecordedLinkRobotIds': sorted(robots - current_robots - historical_only - unresolved_only),
        'looseCandidateComponentIds': sorted(i for i in loose if entities[i]['locationState'] == 'onsite'),
        'quarantinedComponentIds': sorted(i for i in loose if entities[i]['locationState'] == 'quarantine'),
        'counts': {'currentOnsiteRobotCount': count_location(current_robots,'onsite'),
            'currentShippedRobotCount': len(shipped), 'currentCustomerCount': len({ships[r]['customerId'] for r in shipped}),
            'looseCandidateComponentCount': count_location(loose,'onsite'), 'quarantinedComponentCount': count_location(loose,'quarantine'),
            'historicalOnlyRobotCount': len(historical_only), 'unresolvedOnlyRobotCount': len(unresolved_only)},
        'note': 'Current means recorded containment; removal does not constitute engineering clearance.'}
    return result


def late_evidence(data):
    revised = deepcopy(data)
    revised['revisionId'] = 'assembly-r2'
    revised['entities']['E900']['batchId'] = 'B17'
    revised['entities']['E900']['originEvidenceId'] = 'SYNTHETIC-LATE-SUPPLIER-CERTIFICATE'
    revised['lateEvidence'] = {'recordedAt': '2026-09-12T12:00:00Z',
        'effectiveAt': '2026-09-01T10:00:00Z', 'componentId': 'E900', 'batchId': 'B17'}
    return revised


def verify():
    initial = fixture()
    baseline = deepcopy(initial)
    revised = late_evidence(initial)
    a, b = trace(initial), trace(revised)
    checks = []
    def check(name, value):
        assert value, name
        checks.append(name)
    def reject(name, data):
        try:
            validate(data)
        except ValueError:
            checks.append(name)
        else:
            raise AssertionError(name)
    check('Initial current robots are R001 R002 R003', a['currentRobotIds'] == ['R001','R002','R003'])
    check('Initial current shipped scope is two robots and two customers', a['counts']['currentShippedRobotCount'] == a['counts']['currentCustomerCount'] == 2)
    check('Two suspect encoders in R002 count as one robot', a['currentRobotIds'].count('R002') == 1)
    check('One onsite current robot is separate from one loose component', a['counts']['currentOnsiteRobotCount'] == a['counts']['looseCandidateComponentCount'] == 1)
    check('Already quarantined E006 is separate', a['quarantinedComponentIds'] == ['E006'])
    check('Replacement removes R006 from current containment, preserves history', a['historicalOnlyRobotIds'] == ['R006'] and 'R006' not in a['currentRobotIds'])
    check('Unknown batch origin leaves R005 unresolved', a['unresolvedOnlyRobotIds'] == ['R005'])
    check('Shared crate does not implicate R004', a['noRecordedLinkRobotIds'] == ['R004'])
    check('Late origin record adds R005 to current robot scope', b['currentRobotIds'] == ['R001','R002','R003','R005'])
    check('Late record expands shipped units and customers to three', b['counts']['currentShippedRobotCount'] == b['counts']['currentCustomerCount'] == 3)
    check('Late record resolves the one origin gap', b['unresolvedOnlyRobotIds'] == [])
    check('Late record preserves replacement history and control', b['historicalOnlyRobotIds'] == ['R006'] and b['noRecordedLinkRobotIds'] == ['R004'])
    check('Prior fixture and result remain unchanged', initial == baseline and trace(initial) == a)
    check('Revisions have different hashes', a['dataHash'] != b['dataHash'])
    duplicate = deepcopy(initial)
    duplicate['installations'].append(deepcopy(duplicate['installations'][0]))
    check('Identical installation repeated is idempotent', trace(duplicate)['counts'] == a['counts'])
    conflict = deepcopy(duplicate)
    conflict['installations'][-1]['slotId'] = 'other'
    reject('Conflicting installation identifier is rejected', conflict)
    invalid = deepcopy(initial)
    invalid['installations'][0]['childId'] = 'MISSING'
    reject('Missing component reference is rejected', invalid)
    overlapping = deepcopy(initial)
    edge = deepcopy(overlapping['installations'][0])
    edge.update(id='OVERLAP', parentId='J007')
    overlapping['installations'].append(edge)
    reject('A serialized component cannot occupy two parents simultaneously', overlapping)
    slot = deepcopy(initial)
    next(e for e in slot['installations'] if e['childId'] == 'E102')['installedAt'] = '2026-09-07T10:00:00Z'
    reject('Replacement slot occupancy cannot overlap', slot)
    nonoverlap = deepcopy(initial)
    next(e for e in nonoverlap['installations'] if e['childId'] == 'J006')['installedAt'] = '2026-09-09T10:00:00Z'
    check('Disjoint installation intervals do not invent historical robot exposure', 'R006' not in trace(nonoverlap)['historicalOnlyRobotIds'])
    shipment = deepcopy(initial)
    shipment['shipments'].append(deepcopy(shipment['shipments'][0]))
    reject('Duplicate synthetic shipment line is rejected', shipment)
    identity = deepcopy(initial)
    identity['entities']['CLONE'] = deepcopy(identity['entities']['E001'])
    reject('Duplicate issuer part serial identity is rejected', identity)
    both = deepcopy(initial)
    next(e for e in both['installations'] if e['childId'] == 'J005')['parentId'] = 'R001'
    next(e for e in both['installations'] if e['childId'] == 'J005')['slotId'] = 'joint-2'
    mixed = trace(both)
    check('Current suspect containment and origin gaps can coexist', 'R001' in mixed['currentRobotIds'] and 'R001' in mixed['originGapRobotIds'])
    return initial, revised, a, b, {'status':'passed', 'checkCount':len(checks), 'checks':checks,
        'limitations':'Synthetic Python reference only. No Neo4j, API/UI, real robot, damage model, full BOM, regulatory or performance validation.'}


if __name__ == '__main__':
    initial, revised, first, second, results = verify()
    out = ROOT / 'assembly_reference_output'
    out.mkdir(exist_ok=True)
    for name, value in [('fixture_revision_1', initial),('fixture_revision_2', revised),
                        ('trace_revision_1', first),('trace_revision_2', second),('verification', results)]:
        (out / f'{name}.json').write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    batch_rows=[{'id':i,**b} for i,b in initial['batches'].items()]
    for name, rows in [('entities',list(initial['entities'].values())),('batches',batch_rows),('installations',initial['installations']),('shipments',initial['shipments'])]:
        fields = sorted(set().union(*(row.keys() for row in rows)))
        with (out/f'{name}.csv').open('w',newline='',encoding='utf-8') as f:
            writer=csv.DictWriter(f,fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    print(json.dumps({'verification':results,'revision1':first,'revision2':second},indent=2))
