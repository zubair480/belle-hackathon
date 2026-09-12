"""Create and validate synthetic issue/fix/analytics data, not an issue application."""
from pathlib import Path
from copy import deepcopy
import json

ROOT=Path(__file__).resolve().parent

def make_fixture():
    issues=[]
    causes=[]
    def add_issue(issue_id, entity_id, supplier, defect, cause_state='confirmed'):
        issues.append({'id':issue_id, 'version':1, 'status':'in_progress',
            'title':f'Synthetic {defect} observation on {entity_id}',
            'description':'A fictional incoming-component observation for the demo.',
            'origin':'manual','detectedAt':'2026-09-10T10:00:00Z',
            'reportingTeamId':'TEAM-INCOMING-QA','assignedTeamId':'TEAM-SUPPLIER-QUALITY',
            'detectionStationId':'ST-INCOMING','processStepId':'incoming-inspection',
            'entityIds':[entity_id],'partNumber':'ENC-42','partRevision':'A',
            'linkedSupplierIds':[supplier],'defectCode':defect,'severity':'major',
            'evidenceIds':['EVID-'+issue_id],'createdBy':'demo-reporter',
            'createdAt':'2026-09-10T10:00:00Z','updatedAt':'2026-09-10T12:00:00Z'})
        causes.append({'id':'CAUSE-'+issue_id,'issueId':issue_id,'state':cause_state,
            'causeType':'supplier_component','responsibleTeamId':None,'responsibleSupplierId':supplier,
            'causalStationId':None,'rationale':'Synthetic supplier attribution; no actual supplier finding.',
            'evidenceIds':['EVID-'+issue_id],'assessedBy':'demo-quality-reviewer',
            'assessedAt':'2026-09-10T12:00:00Z','supersedesId':None})
    for issue_id,entity,defect in [('ISS-A1','E001','ENCODER_DROPOUT'),('ISS-A2','E001','CONNECTOR_DEFECT'),
                                 ('ISS-A3','E002','ENCODER_DROPOUT'),('ISS-A4','E003','CONNECTOR_DEFECT')]:
        add_issue(issue_id,entity,'SUP-A',defect)
    for issue_id,entity in [('ISS-B1','B201'),('ISS-B2','B202')]:
        add_issue(issue_id,entity,'SUP-B','ENCODER_DROPOUT')
    add_issue('ISS-UNCONFIRMED','E900','SUP-A','ENCODER_DROPOUT','hypothesis')
    issues.append({'id':'ISS-ASM-01','version':5,'status':'closed',
        'title':'Joint fastening issue on J004','description':'Synthetic inspection finding for a mechanical joint.',
        'origin':'manual','detectedAt':'2026-09-10T09:00:00Z',
        'reportingTeamId':'TEAM-FINAL-TEST','assignedTeamId':'TEAM-MECHANICAL',
        'detectionStationId':'ST-FINAL-TEST','processStepId':'joint-fastening',
        'entityIds':['J004','R003'],'partNumber':'JOINT-10','partRevision':'B',
        'linkedSupplierIds':['SUP-A'],'defectCode':'TORQUE_LOW','severity':'major',
        'evidenceIds':['EVID-ASM-OBS'],'createdBy':'demo-test-operator',
        'createdAt':'2026-09-10T09:00:00Z','updatedAt':'2026-09-10T16:00:00Z'})
    causes.append({'id':'CAUSE-ASM-01','issueId':'ISS-ASM-01','state':'confirmed',
        'causeType':'assembly_process','responsibleTeamId':'TEAM-MECHANICAL','responsibleSupplierId':None,
        'causalStationId':'ST-JOINT-ASSEMBLY','rationale':'Demo record: an assembly-process deviation was confirmed.',
        'evidenceIds':['EVID-ASM-CAUSE'],'assessedBy':'demo-quality-reviewer',
        'assessedAt':'2026-09-10T11:00:00Z','supersedesId':None})
    fixes=[{'id':'FIX-ASM-01-V1','issueId':'ISS-ASM-01','version':1,
        'summary':'Apply the approved correction in WI-JOINT-07 revision 2 and verify the joint.',
        'steps':[{'order':1,'instruction':'Confirm applicability of the approved work instruction to this joint revision.'},
                 {'order':2,'instruction':'Apply the approved correction and document execution.'},
                 {'order':3,'instruction':'Record the required inspection and verification evidence.'}],
        'applicability':{'partNumber':'JOINT-10','partRevision':'B','processStepId':'joint-fastening',
                         'limitations':['Synthetic example; no real torque values or engineering procedure supplied.']},
        'state':'verified','sourceFixRevisionId':None,'evidenceIds':['EVID-ASM-FIX']}]
    verifications=[{'id':'VERIFY-ASM-01','issueId':'ISS-ASM-01','fixRevisionId':'FIX-ASM-01-V1',
        'outcome':'pass','method':'Synthetic verification against demo work-instruction criteria',
        'resultNotes':'Fixture result is PASS. No real hardware was inspected.',
        'evidenceIds':['EVID-ASM-VERIFY'],'verifiedBy':'demo-quality-reviewer','verifiedAt':'2026-09-10T16:00:00Z'}]
    units_a=['E001','E002','E003','E004','E005','E006','E101','E102','E900']+[f'A{i:03d}' for i in range(10,21)]
    units_b=[f'B{i}' for i in range(201,211)]
    inspections=[{'id':'INS-'+unit,'entityId':unit,'supplierId':supplier,'partNumber':'ENC-42',
                  'inspectedAt':'2026-09-09T10:00:00Z'} for supplier,units in [('SUP-A',units_a),('SUP-B',units_b)] for unit in units]
    evidence_ids=set()
    for record in issues+causes+fixes+verifications:
        evidence_ids.update(record['evidenceIds'])
    return {'contractVersion':'assembly-quality-v3',
        'notes':['All issues, causes, tests and supplier rates are synthetic.',
                 'An existing closed issue demonstrates reusable knowledge; the actual CRUD/lifecycle application is not implemented by this fixture.'],
        'teams':[{'id':i,'name':name} for i,name in [('TEAM-INCOMING-QA','Incoming Quality'),
            ('TEAM-FINAL-TEST','Final Test'),('TEAM-MECHANICAL','Mechanical Assembly'),('TEAM-SUPPLIER-QUALITY','Supplier Quality')]],
        'suppliers':[{'id':'SUP-A','name':'Demo Motion Components'},{'id':'SUP-B','name':'Demo Encoder Works'}],
        'stations':[{'id':'ST-INCOMING','name':'Incoming inspection'},
                    {'id':'ST-JOINT-ASSEMBLY','name':'Joint assembly'}, {'id':'ST-FINAL-TEST','name':'Final test'}],
        'issues':issues,'causeAssessments':causes,'fixRevisions':fixes,'verifications':verifications,
        'additionalBatches':[
            {'id':'QUALITY-SUPA-OTHER','supplierId':'SUP-A','partNumber':'ENC-42','externalCode':'Q-A-OTHER'},
            {'id':'QUALITY-SUPB-OTHER','supplierId':'SUP-B','partNumber':'ENC-42','externalCode':'Q-B-OTHER'}],
        'additionalEntities':[{'id':unit,'kind':'component','partNumber':'ENC-42','partRevision':'A',
            'serialNumber':unit,'issuerId':supplier,'batchId':'QUALITY-SUPA-OTHER' if supplier=='SUP-A' else 'QUALITY-SUPB-OTHER',
            'locationState':'onsite'} for supplier,units in [('SUP-A',units_a[9:]),('SUP-B',units_b)] for unit in units],
        'evidence':[{'id':i,'sourceName':'Synthetic quality record','locator':i,
                     'text':'Fictional fixture evidence only; replace with actual evidence in a pilot.'} for i in sorted(evidence_ids)],
        'inspectionCohort':{'start':'2026-09-01T00:00:00Z','endExclusive':'2026-09-11T00:00:00Z',
                            'observationCutoff':'2026-09-12T12:00:00Z','complete':True,'records':inspections},
        'manualDemoInput':{'title':'Joint fastening issue on J005','description':'Operator marks the joint after an inspection finding.',
            'origin':'manual','detectedAt':'2026-09-12T10:00:00Z','reportingTeamId':'TEAM-FINAL-TEST',
            'assignedTeamId':'TEAM-MECHANICAL','detectionStationId':'ST-FINAL-TEST','processStepId':'joint-fastening',
            'entityIds':['J005','R005'],'partNumber':'JOINT-10','partRevision':'B','linkedSupplierIds':['SUP-A'],
            'defectCode':'TORQUE_LOW','severity':'major','evidenceIds':[]},
        'expected':{'SUP-A':{'confirmedIssueCount':4,'distinctAffectedInspectedUnits':3,'inspectedUnits':20,'rate':0.15},
                    'SUP-B':{'confirmedIssueCount':2,'distinctAffectedInspectedUnits':2,'inspectedUnits':10,'rate':0.20},
                    'similarFixForManualDemo':'FIX-ASM-01-V1',
                    'closedAssemblyIssueReportingTeam':'TEAM-FINAL-TEST','closedAssemblyIssueCausingTeam':'TEAM-MECHANICAL'}}


def supplier_metrics(data):
    issue_by_id={i['id']:i for i in data['issues']}
    result={}
    for supplier in data['suppliers']:
        sid=supplier['id']
        cases={c['issueId'] for c in data['causeAssessments'] if c['state']=='confirmed' and c['responsibleSupplierId']==sid}
        denominator={r['entityId'] for r in data['inspectionCohort']['records'] if r['supplierId']==sid}
        affected=set().union(*(set(issue_by_id[i]['entityIds']) for i in cases)) if cases else set()
        numerator=affected & denominator
        rate=len(numerator)/len(denominator) if denominator and data['inspectionCohort']['complete'] else None
        result[sid]={'confirmedIssueCount':len(cases),'distinctAffectedInspectedUnits':len(numerator),
                     'inspectedUnits':len(denominator),'rate':rate}
    return result


if __name__=='__main__':
    data=make_fixture()
    assert supplier_metrics(data)=={k:data['expected'][k] for k in ['SUP-A','SUP-B']}
    incomplete=deepcopy(data)
    incomplete['inspectionCohort']['complete']=False
    assert all(x['rate'] is None for x in supplier_metrics(incomplete).values())
    empty=deepcopy(data)
    empty['inspectionCohort']['records']=[]
    assert all(x['rate'] is None for x in supplier_metrics(empty).values())
    manual=data['manualDemoInput']
    matches=[fix for fix in data['fixRevisions'] if fix['state']=='verified' and
             fix['applicability']['partNumber']==manual['partNumber'] and
             fix['applicability']['partRevision']==manual['partRevision'] and
             fix['applicability']['processStepId']==manual['processStepId'] and
             next(i for i in data['issues'] if i['id']==fix['issueId'])['defectCode']==manual['defectCode']]
    assert [f['id'] for f in matches]==[data['expected']['similarFixForManualDemo']]
    assert data['causeAssessments'][-1]['responsibleTeamId']!=data['issues'][-1]['reportingTeamId']
    assert data['causeAssessments'][-1]['responsibleSupplierId'] is None
    for issue in data['issues']:
        if issue['status']=='closed':
            assert any(v['issueId']==issue['id'] and v['outcome']=='pass' for v in data['verifications'])
    (ROOT/'quality_issue_reference.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':'fixture validated','supplierMetrics':supplier_metrics(data),
                      'similarFixIds':[f['id'] for f in matches],
                      'limitation':'No application lifecycle, database persistence or UI tests executed.'},indent=2))
