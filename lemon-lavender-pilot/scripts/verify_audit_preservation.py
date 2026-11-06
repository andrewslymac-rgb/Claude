"""Read-only comparison against the pre-audit SQLite backup and file hashes."""
import hashlib,json,sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
baseline=json.loads((ROOT/'artifacts/before-comprehensive-audit.json').read_text())
old=sqlite3.connect('file:'+baseline['database_backup']+'?mode=ro',uri=True)
new=sqlite3.connect('file:'+str(ROOT/'.data/pilot.sqlite3')+'?mode=ro',uri=True)
report={'tables':{},'files':{},'authorized_content_updates':['training/policies.py','training/curriculum.py'],
        'database_integrity':new.execute('pragma integrity_check').fetchone()[0]}
tables=[r[0] for r in old.execute("select name from sqlite_master where type='table' and name like 'training_%'")]
for table in tables:
    columns=[r[1] for r in old.execute('pragma table_info("'+table+'")')]
    primary=[r[1] for r in old.execute('pragma table_info("'+table+'")') if r[5]][0]
    sql='select '+','.join('"'+c+'"' for c in columns)+' from "'+table+'"'
    index=columns.index(primary)
    before={row[index]:row for row in old.execute(sql)};after={row[index]:row for row in new.execute(sql)}
    same=all(after.get(key)==value for key,value in before.items())
    added=set(after)-set(before)
    assert same,table
    assert not added or table=='training_magiclink',(table,'unexpected new learning data')
    report['tables'][table]={'original_rows':len(before),'all_original_columns_unchanged':same,'new_rows':len(added)}
for name,digest in baseline['files'].items():
    unchanged=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest
    assert unchanged or name in report['authorized_content_updates'],name
    report['files'][name]='unchanged' if unchanged else 'versioned owner-authorized source update; saved snapshots untouched'
new_columns=[r[1] for r in new.execute('pragma table_info(training_review)') if r[1] not in [c[1] for c in old.execute('pragma table_info(training_review)')]]
report['additive_review_columns']=new_columns
for column in new_columns:
    assert new.execute('select count(*) from training_review where "'+column+'"!=?',('',)).fetchone()[0]==0
report['recordings_evidence_and_authorizations_unchanged']=all(v=='unchanged' for k,v in report['files'].items() if k.startswith('.data/'))
report['changed_source_files']=[name for name,digest in baseline['source_files'].items()
    if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
report['result']='passed'
(ROOT/'artifacts/audit-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'result':report['result'],'tables':len(tables),'tracked_files':len(report['files']),
    'unchanged_tracked_files':sum(v=='unchanged' for v in report['files'].values()),
    'additive_review_columns':new_columns,'new_auth_rows':report['tables']['training_magiclink']['new_rows']}))
