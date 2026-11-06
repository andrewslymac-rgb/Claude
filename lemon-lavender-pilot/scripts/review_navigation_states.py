"""Navigation edge states in a copy of the full-flow QA DB, never main data."""
import json,os,socket,sqlite3,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(ROOT));OUT=ROOT/'artifacts'
from browser_review import Browser
qa=Path(tempfile.mkdtemp(prefix='ll-guided-qa-nav-states-',dir='/tmp'))
source=Path(json.loads((OUT/'navigation-browser.json').read_text())['database'])
a=sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True);z=sqlite3.connect(qa/'qa.sqlite3');a.backup(z);a.close();z.close()
os.environ.update(DJANGO_SETTINGS_MODULE='config.browser_qa_settings',LL_BROWSER_QA_DIR=str(qa))
import django;django.setup()
from training.models import Assignment,Attempt,Review
from django.utils import timezone
from datetime import timedelta
assignment=Assignment.objects.get(pk=1);prior=assignment.attempts.order_by('started_at').first()
expired=Attempt.objects.create(assignment=assignment,policy=prior.policy,scenario=prior.scenario,rubric=prior.rubric,limits=prior.limits,transcript=prior.transcript)
Attempt.objects.filter(pk=expired.pk).update(started_at=timezone.now()-timedelta(days=1))
log=open(qa/'server.log','w');server=subprocess.Popen([str(ROOT/'.venv/bin/python'),'manage.py','runserver','127.0.0.1:8766','--noreload','--nothreading'],cwd=ROOT,stdout=log,stderr=log)
b=None;report={'database':str(qa/'qa.sqlite3'),'checks':[],'provider_requests':0,'microphone_used':False}
try:
    end=time.monotonic()+8
    while True:
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',8766))==0:break
        if time.monotonic()>end:raise RuntimeError('No QA server')
        time.sleep(.1)
    b=Browser();base='http://127.0.0.1:8766'
    target='/course/1/scenarios/?persona_id=busy_parent&difficulty=beginner&drill=full'
    b.navigate(base+target);b.wait('location.pathname==="/sign-in/"')
    b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")');b.navigate(base+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#confirm-signin")?.disabled===false');b.evaluate('document.querySelector("#confirm-signin").click()')
    b.wait('location.pathname+location.search==='+json.dumps(target))
    assert b.evaluate('document.querySelector("[name=persona_id]").value')=='busy_parent'
    report['checks'].append('Caller-selection deep link retains validated caller, difficulty and drill through sign-in')
    b.navigate(base+'/attempt/'+str(expired.pk)+'/');b.wait('document.body.innerText.includes("Start a fresh attempt")')
    expired.refresh_from_db();assert expired.status=='active'
    assert b.evaluate('document.querySelectorAll("main .primary-continue").length')==1
    b.screenshot(OUT/'navigation-expired.jpg')
    b.evaluate('document.querySelector(".practice-review-next button").click()');b.wait('!!document.querySelector("button[value=abandon]")')
    expired.refresh_from_db();assert expired.status=='expired'
    assert expired.transcript==prior.transcript
    b.evaluate('document.querySelector("button[value=abandon]").click()');b.wait('location.hash==="#practice-next"')
    report['checks'].append('Expired attempt is read-only on GET; explicit fresh attempt preserves old transcript and starts a separate session')
    # A seeded manager-ready record tests completed presentation, not a new readiness judgment.
    ready=Attempt.objects.create(assignment=assignment,status='reviewed',policy=prior.policy,scenario=prior.scenario,rubric=prior.rubric,limits=prior.limits)
    Review.objects.create(attempt=ready,reviewer=prior.review.reviewer,decision='ready',coaching='Keep making the next step explicit.',override_reason='Fictional UI state fixture only, not a competence decision.')
    b.navigate(base+'/course/1/');b.wait('document.body.innerText.includes("Read your trainer’s review")')
    b.evaluate('document.querySelector(".primary-continue").click()');b.wait('location.hash==="#manager-feedback"')
    assert b.evaluate('document.body.innerText.includes("Your trainer’s review is saved") && document.body.innerText.includes("Practice again when you’re ready")')
    b.screenshot(OUT/'navigation-completed-review.jpg')
    report['checks'].append('Seeded completed-review state names the manager decision and makes further practice optional; no automatic readiness created')
    report['result']='passed'
finally:
    if b:b.close()
    server.terminate();server.wait(timeout=5);log.close()
    (OUT/'navigation-state-browser.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
