"""Two realistic lesson POSTs in separate connections to a disposable SQLite DB."""
import concurrent.futures, json, os, sys, tempfile, threading, time
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
folder=Path(tempfile.mkdtemp(prefix='ll-guided-qa-audit-concurrency-',dir='/tmp'))
os.environ['LL_BROWSER_QA_DIR']=str(folder)
os.environ['DJANGO_SETTINGS_MODULE']='config.browser_qa_settings'
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from django.db import connections,close_old_connections
from django.test import Client
from training.models import Assignment,LessonProgress
from training.curriculum import lesson_snapshot
if '--before' in sys.argv:settings.DATABASES['default']['OPTIONS']={'timeout':5}
call_command('migrate',verbosity=0)
call_command('seed_demo',verbosity=0)
a=Assignment.objects.select_related('learner').get()
content=lesson_snapshot('welcome')
progress=LessonProgress.objects.create(assignment=a,lesson_key='welcome',content=content)
clients=[Client(raise_request_exception=False),Client(raise_request_exception=False)]
for client in clients:client.force_login(a.learner)
barrier=threading.Barrier(2)
original=LessonProgress.save
def slow_write(self,*args,**kwargs):
    time.sleep(.2)  # Expose a normal read-then-write overlap deterministically.
    return original(self,*args,**kwargs)
def post(index):
    close_old_connections();barrier.wait(timeout=5)
    try:
        response=clients[index].post(f'/course/{a.pk}/learn/welcome/1/',
            {'revision':0,'action':'save','content_version':content['version'],'choice':str(index)})
        return {'request':index,'status':response.status_code,
                'stale_draft_preserved':b'Your draft is retained' in response.content}
    finally:connections.close_all()
with patch.object(LessonProgress,'save',slow_write),concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(post,range(2)))
progress.refresh_from_db()
report={'database':str(folder/'qa.sqlite3'),'mode':settings.DATABASES['default'].get('OPTIONS',{}),
        'requests':results,'saved_revision':progress.revision,'saved_answers':progress.answers}
path=ROOT/'artifacts'/('audit-concurrency-before.json' if '--before' in sys.argv else 'audit-concurrency-after.json')
path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
if '--before' not in sys.argv:
    assert sorted(r['status'] for r in results)==[302,409],report
    assert progress.revision==1,report
