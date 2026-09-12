"""Synthetic reference case for the research; not a Neo4j application or safety tool."""
from copy import deepcopy
from collections import defaultdict, deque
from pathlib import Path
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parent


def fixture():
    opening = {'T17': 100, 'T18': 100, 'BASE-A': 80, 'BASE-B': 40,
               'BASE-C': 70, 'BASE-D': 90, 'BASE-E': 80, 'CLEAN-R': 10,
               'R-UNK': 20}
    kinds = {k: 'ingredient' for k in opening}
    kinds.update({k: 'finished' for k in ['F-A', 'F-B', 'F-C', 'F-D', 'F-E']})
    kinds.update({'B101': 'bulk', 'R101': 'rework', 'WASTE101': 'waste',
                  'WIP101': 'work_in_progress', 'R-UNK': 'rework'})
    def event(i, day, ins, outs, kind='MIX'):
        return {'id': i, 'kind': kind, 'event_time': f'2026-09-{day:02d}T10:00:00Z',
                'recorded_at': '2026-09-10T12:00:00Z', 'inputs': ins,
                'outputs': outs, 'unit': 'kg', 'evidence': f'SYNTHETIC-BATCH-SHEET-{i}'}
    events = [
        event('E1', 1, {'T17': 20, 'BASE-A': 80}, {'B101': 100}),
        event('E2', 2, {'B101': 100}, {'F-A': 60, 'R101': 20, 'WASTE101': 10, 'WIP101': 10}, 'SPLIT'),
        event('E3', 3, {'T17': 10, 'BASE-B': 40}, {'F-B': 50}),
        event('E4', 4, {'R101': 20, 'T17': 10, 'BASE-C': 70}, {'F-C': 100}, 'REWORK'),
        event('E5', 4, {'T18': 10, 'BASE-D': 90}, {'F-D': 100}),
        event('E6', 6, {'R-UNK': 20, 'BASE-E': 80}, {'F-E': 100}, 'REWORK'),
    ]
    shipments = [
        {'id': 'SL-A', 'lot': 'F-A', 'qty': 40, 'customer': 'NorthMart', 'brand': 'Harbor'},
        {'id': 'SL-B', 'lot': 'F-B', 'qty': 30, 'customer': 'EastFoods', 'brand': 'Trail'},
        {'id': 'SL-C', 'lot': 'F-C', 'qty': 50, 'customer': 'WestKitchen', 'brand': 'Cedar'},
        {'id': 'SL-D', 'lot': 'F-D', 'qty': 70, 'customer': 'ControlFoods', 'brand': 'Control'},
        {'id': 'SL-E', 'lot': 'F-E', 'qty': 60, 'customer': 'DeltaFoods', 'brand': 'Dune'},
    ]
    return {'workspace_id': 'synthetic-co-packer', 'revision': 1,
            'scope': 'All fixture lots, one site, September 1-10, 2026; no cross-contact assessment',
            'unit': 'kg', 'kinds': kinds, 'opening': opening, 'events': events,
            'shipments': shipments, 'disposals': [{'id': 'D1', 'lot': 'WASTE101', 'qty': 10}],
            'containers': [{'id': 'P9', 'lots': ['F-C', 'F-D']}],
            'unknown_origins': ['R-UNK'],
            'provisional_opening_note': 'R-UNK 20 kg balances its recorded consumption. Its receipt and origin are unproven, not an accepted material link.'}


def accept_events(events):
    """Exact duplicates are idempotent; conflicting IDs fail closed."""
    unique = {}
    for e in events:
        if e['id'] in unique and unique[e['id']] != e:
            raise ValueError('Conflicting event ID')
        unique[e['id']] = e
    return list(unique.values())


def validate(data):
    if data['unit'] != 'kg':
        raise ValueError('Reference case only supports kg')
    lots = set(data['kinds'])
    if not set(data['unknown_origins']).issubset(lots):
        raise ValueError('Unknown origin refers to absent lot')
    events = accept_events(data['events'])
    adjacency = {lot: set() for lot in lots}
    produced_by = {}
    balance = defaultdict(int, data['opening'])
    for e in events:
        if e['unit'] != 'kg' or not e['evidence']:
            raise ValueError('Unsupported unit or absent event evidence')
        if not e['inputs'] or not e['outputs']:
            raise ValueError('Incomplete event')
        if not (set(e['inputs']) | set(e['outputs'])).issubset(lots):
            raise ValueError('Missing lot reference')
        if any(q <= 0 for q in list(e['inputs'].values()) + list(e['outputs'].values())):
            raise ValueError('Nonpositive quantity')
        if sum(e['inputs'].values()) != sum(e['outputs'].values()):
            raise ValueError('Fixture event is not mass balanced')
        for lot, q in e['inputs'].items():
            balance[lot] -= q
            adjacency[lot].update(e['outputs'])
        for lot, q in e['outputs'].items():
            if lot in produced_by or data['opening'].get(lot, 0):
                raise ValueError('Ambiguous lot version production')
            produced_by[lot] = e
            balance[lot] += q
    indegree = {lot: 0 for lot in lots}
    for outs in adjacency.values():
        for lot in outs:
            indegree[lot] += 1
    queue = deque(lot for lot in lots if indegree[lot] == 0)
    seen = 0
    while queue:
        node = queue.popleft()
        seen += 1
        for out in adjacency[node]:
            indegree[out] -= 1
            if indegree[out] == 0:
                queue.append(out)
    if seen != len(lots):
        raise ValueError('Material cycle')
    for e in events:
        for lot in e['inputs']:
            if lot in produced_by and produced_by[lot]['event_time'] >= e['event_time']:
                raise ValueError('Impossible production ordering')
    for collection in ['shipments', 'disposals']:
        ids = set()
        for row in data[collection]:
            if row['id'] in ids or row['lot'] not in lots or row['qty'] <= 0:
                raise ValueError('Invalid or duplicate movement')
            ids.add(row['id'])
            balance[row['lot']] -= row['qty']
    if any(q < 0 for q in balance.values()):
        raise ValueError('Negative closing stock')
    return adjacency, dict(balance)


def descendants(adjacency, roots):
    found = set(roots)
    queue = deque(roots)
    while queue:
        for child in adjacency[queue.popleft()]:
            if child not in found:
                found.add(child)
                queue.append(child)
    return found


def trace(data, root='T17'):
    adjacency, stock = validate(data)
    if root not in adjacency:
        raise ValueError('Unknown root lot')
    impacted = descendants(adjacency, [root])
    uncertain = descendants(adjacency, data['unknown_origins'])
    # Both facts can coexist: a lot can have a known path AND an unresolved origin elsewhere.
    unresolved_only = uncertain - impacted
    def summarize(lots):
        lines = [r for r in data['shipments'] if r['lot'] in lots]
        positions = {lot: stock.get(lot, 0) for lot in sorted(lots) if stock.get(lot, 0) > 0}
        return {'onsite_kg': sum(positions.values()), 'onsite_positions_kg': positions,
                'shipped_kg': sum(r['qty'] for r in lines),
                'shipment_line_ids': sorted(r['id'] for r in lines),
                'consignees': sorted({r['customer'] for r in lines}),
                'finished_lots': sorted(lot for lot in lots if data['kinds'][lot] == 'finished')}
    canonical = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
    return {'revision': data['revision'], 'data_sha256': hashlib.sha256(canonical).hexdigest(),
            'engine_version': 'research-reference-1', 'root': root, 'scope': data['scope'],
            'known_path_lots': sorted(impacted), 'known_path': summarize(impacted),
            'unresolved_only': summarize(unresolved_only), 'origin_gap_lots': sorted(uncertain),
            'no_recorded_path_finished_lots': sorted(l for l in data['kinds']
               if data['kinds'][l] == 'finished' and l not in impacted | uncertain),
            'already_disposed_kg': sum(r['qty'] for r in data['disposals'] if r['lot'] in impacted),
            'notice': 'Synthetic material genealogy only. No recorded path is not food safety clearance.'}


def late_evidence(data):
    revised = deepcopy(data)
    revised['revision'] = 2
    revised['opening']['R-UNK'] = 0
    revised['unknown_origins'] = []
    revised['provisional_opening_note'] = 'Superseded by late batch sheet E-LATE.'
    revised['events'].append({'id': 'E-LATE', 'kind': 'REWORK',
        'event_time': '2026-09-05T10:00:00Z', 'recorded_at': '2026-09-12T12:00:00Z',
        'inputs': {'WIP101': 10, 'CLEAN-R': 10}, 'outputs': {'R-UNK': 20},
        'unit': 'kg', 'evidence': 'SYNTHETIC-LATE-BATCH-SHEET'})
    return revised


def run_checks():
    checks = []
    def check(label, expression):
        assert expression, label
        checks.append(label)
    def rejects(label, data):
        try:
            validate(data)
        except ValueError:
            checks.append(label)
        else:
            raise AssertionError(label)
    baseline = fixture()
    before_copy = deepcopy(baseline)
    first = trace(baseline)
    second_data = late_evidence(baseline)
    second = trace(second_data)
    check('Initial onsite candidate stock is 160 kg', first['known_path']['onsite_kg'] == 160)
    check('Initial shipped quantity is 120 kg', first['known_path']['shipped_kg'] == 120)
    check('Initial outbound scope contains 3 unique lines and consignees',
          len(first['known_path']['shipment_line_ids']) == len(first['known_path']['consignees']) == 3)
    check('Diamond path counts F-C stock and shipment exactly once',
          first['known_path']['onsite_positions_kg']['F-C'] == 50 and first['known_path']['shipment_line_ids'].count('SL-C') == 1)
    check('Container membership does not create a material path',
          'F-D' not in first['known_path_lots'] and first['no_recorded_path_finished_lots'] == ['F-D'])
    check('Unknown origin yields 40 kg onsite and 60 kg shipped for review',
          first['unresolved_only']['onsite_kg'] == 40 and first['unresolved_only']['shipped_kg'] == 60)
    check('Disposed 10 kg remains outside onsite quantities', first['already_disposed_kg'] == 10)
    check('Late evidence changes onsite scope to 190 kg', second['known_path']['onsite_kg'] == 190)
    check('Late evidence changes shipped scope to 180 kg and 4 consignees',
          second['known_path']['shipped_kg'] == 180 and len(second['known_path']['consignees']) == 4)
    check('Late evidence resolves origin gap, without changing control lot status',
          second['origin_gap_lots'] == [] and second['no_recorded_path_finished_lots'] == ['F-D'])
    check('Late evidence preserves baseline data and result', baseline == before_copy and trace(baseline) == first)
    check('Revisions have different data hashes', first['data_sha256'] != second['data_sha256'])
    duplicate = deepcopy(baseline)
    duplicate['events'].append(deepcopy(duplicate['events'][0]))
    check('Exact repeated event does not change trace quantities', trace(duplicate)['known_path'] == first['known_path'])
    conflict = deepcopy(duplicate)
    conflict['events'][-1]['evidence'] = 'CONFLICTING-RECORD'
    rejects('Conflicting duplicate event ID is rejected', conflict)
    bad_ref = deepcopy(baseline)
    bad_ref['events'][0]['inputs'] = {'ABSENT': 100}
    rejects('Absent input lot is rejected', bad_ref)
    bad_stock = deepcopy(baseline)
    bad_stock['shipments'][0]['qty'] = 1000
    rejects('Over-shipment causing negative stock is rejected', bad_stock)
    bad_unit = deepcopy(baseline)
    bad_unit['events'][0]['unit'] = 'cases'
    rejects('Unsupported unit is rejected', bad_unit)
    bad_mass = deepcopy(baseline)
    bad_mass['events'][0]['outputs']['B101'] = 101
    rejects('Unexplained mass imbalance is rejected in this closed-process fixture', bad_mass)
    bad_time = deepcopy(baseline)
    bad_time['events'][1]['event_time'] = '2026-08-01T10:00:00Z'
    rejects('Consumption before production is rejected', bad_time)
    cycle = deepcopy(baseline)
    cycle['opening']['T17'] = 0
    cycle['events'].append({'id': 'LOOP', 'inputs': {'F-A': 1}, 'outputs': {'T17': 1},
       'unit': 'kg', 'event_time': '2026-09-08T10:00:00Z', 'recorded_at': '2026-09-10T12:00:00Z', 'evidence': 'BAD'})
    rejects('Material cycle is rejected', cycle)
    repeated_line = deepcopy(baseline)
    repeated_line['shipments'].append(deepcopy(repeated_line['shipments'][0]))
    rejects('Duplicate shipment line is rejected', repeated_line)
    shared_gap = deepcopy(baseline)
    shared_gap['unknown_origins'].append('BASE-C')
    overlap = trace(shared_gap)
    check('Known path and origin gap can coexist', 'F-C' in overlap['known_path_lots'] and 'F-C' in overlap['origin_gap_lots'])
    result = {'status': 'passed', 'check_count': len(checks), 'checks': checks,
              'limitations': 'Python reference implementation, integer kg, one tenant/site, complete synthetic cohort. No Neo4j, runtime AI, real customer, jurisdiction, security, general unit conversion, hazard or performance validation.'}
    return baseline, second_data, first, second, result


if __name__ == '__main__':
    initial, revised, run1, run2, results = run_checks()
    out = ROOT / 'reference_output'
    out.mkdir(exist_ok=True)
    for name, data in [('fixture_revision_1', initial), ('fixture_revision_2', revised),
                       ('trace_revision_1', run1), ('trace_revision_2', run2), ('verification', results)]:
        (out / f'{name}.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    with (out / 'shipments.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'lot', 'qty', 'customer', 'brand'])
        writer.writeheader()
        writer.writerows(initial['shipments'])
    print(json.dumps({'verification': results, 'revision_1': run1, 'revision_2': run2}, indent=2))
