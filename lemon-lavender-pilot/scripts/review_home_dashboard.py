"""Disposable dashboard browser QA. No provider, microphone or main-data writes."""
import json, os, socket, subprocess, sys, tempfile, time
from pathlib import Path
from browser_review import Browser
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'artifacts'
QA = Path(tempfile.mkdtemp(prefix='ll-guided-qa-dashboard-', dir='/tmp'))
BASE = 'http://127.0.0.1:8766'
env = {**os.environ, 'DJANGO_SETTINGS_MODULE':'config.browser_qa_settings', 'LL_BROWSER_QA_DIR':str(QA)}
report = {'database':str(QA/'qa.sqlite3'), 'checks':[], 'provider_calls':0, 'physical_microphone':False}
python = str(ROOT/'.venv/bin/python')
for command in (['migrate','--noinput'], ['seed_demo']):
    subprocess.run([python, 'manage.py', *command], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)
log = open(QA/'server.log', 'w')
server = subprocess.Popen([python,'manage.py','runserver','127.0.0.1:8766','--noreload','--nothreading'], cwd=ROOT, env=env, stdout=log, stderr=log)
b = None
try:
    deadline=time.monotonic()+10
    while True:
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1',8766))==0: break
        if time.monotonic()>deadline: raise RuntimeError('QA server unavailable')
        time.sleep(.15)
    b=Browser()
    def visit(path, text=None):
        b.navigate(BASE+path); b.wait('location.pathname === '+json.dumps(path.split('#')[0])+' && document.readyState === "complete"')
        if text:b.wait('document.body.innerText.includes('+json.dumps(text)+')')
    def click(selector): b.evaluate('document.querySelector('+json.dumps(selector)+').click()')
    def login(role):
        visit('/sign-in/')
        b.evaluate('document.querySelector("input[name=email]").value='+json.dumps(role+'@example.invalid')+';document.querySelector("input[name=email]").form.requestSubmit()')
        b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
        url=b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")')
        b.navigate(BASE+url); b.wait('document.querySelector("#token")?.value.length > 10')
        b.evaluate('document.querySelector("#token").form.requestSubmit()')
        b.wait('location.pathname === '+json.dumps('/course/1/' if role=='learner' else '/')+' && !!document.querySelector(".identity")')
    login('learner')
    assert b.evaluate('document.querySelectorAll(".learning-section").length')==4
    assert b.evaluate('document.querySelectorAll(".primary-continue").length')==1
    assert b.evaluate('document.querySelector("#lesson-progress").max')==6
    assert b.evaluate('document.querySelector(".primary-continue").getAttribute("href")')=='/course/1/learn/welcome/1/'
    report['checks'].append('Four ordered sections; six-lesson denominator; first recommendation is welcome')
    # All core lessons, guide, and practice are reachable without changing completion.
    links=b.evaluate('[...document.querySelectorAll(".section-content a,.section-practice>a")].map(a=>a.getAttribute("href"))')
    for path in links:
        visit(path)
        assert b.evaluate('!document.body.innerText.includes("Page not found")')
    visit('/course/1/','0 of 6 lessons complete')
    report['checks'].append('All six lessons, orientation and Practice Studio open from the dashboard; GETs give no credit')
    visit('/course/1/learn/objections/1/')
    saved='I understand the first visit costs more. Let me clarify the cleaning needs before explaining the required initial deep.'
    b.evaluate('document.querySelector("textarea").value='+json.dumps(saved))
    click('button[value=save]'); b.wait('location.pathname === "/course/1/"')
    assert b.evaluate('document.querySelector(".primary-continue").getAttribute("href")')=='/course/1/learn/welcome/1/'
    click('.saved-draft a'); b.wait('location.pathname === "/course/1/learn/objections/1/" && !!document.querySelector("textarea")')
    assert b.evaluate('document.querySelector("textarea").value')==saved
    click('.lesson-top a'); b.wait('location.hash === "#objections" && !!document.querySelector("#objections")')
    report['checks'].append('Saved later-section draft resumes exact writing; breadcrumb returns to section 3; recommendation stays in order')
    home_entry=b.call('Page.getNavigationHistory')['currentIndex']
    entries=b.call('Page.getNavigationHistory')['entries']; home_id=entries[home_entry]['id']
    click('#industry .section-content a'); b.wait('location.pathname === "/course/1/orientation/"')
    guide_history=b.call('Page.getNavigationHistory'); guide_id=guide_history['entries'][guide_history['currentIndex']]['id']
    b.call('Page.navigateToHistoryEntry',{'entryId':home_id}); b.wait('location.pathname === "/course/1/" && !!document.querySelector(".saved-draft")')
    b.call('Page.navigateToHistoryEntry',{'entryId':guide_id}); b.wait('location.pathname === "/course/1/orientation/" && !!document.querySelector("button[value=reviewed]")')
    click('button[value=reviewed]'); b.wait('location.pathname === "/course/1/" && location.hash === "#industry"')
    assert b.evaluate('document.body.innerText.includes("0 of 6 lessons complete") && document.body.innerText.includes("Guide reviewed")')
    visit('/course/1/orientation/'); assert b.evaluate('!document.querySelector("button[value=reviewed]")')
    report['checks'].append('Back/forward stable; explicit guide acknowledgment idempotent and separate from lesson credit')
    visit('/course/1/services/'); assert b.evaluate('!!document.querySelector("a[href=\'/course/1/orientation/\']")')
    visit('/course/1/')
    # Browser keyboard traversal reaches each section action and visible focus ring.
    b.evaluate('document.activeElement?.blur();document.body.tabIndex=-1;document.body.focus()')
    seen=set()
    for _ in range(70):
        b.call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
        b.call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
        focused=b.evaluate('({label:document.activeElement?.getAttribute("aria-label"),outline:getComputedStyle(document.activeElement).outlineWidth})')
        if focused['label'] and 'section' in focused['label']:
            seen.add(focused['label']); assert focused['outline']!='0px'
    assert len(seen)==4,seen
    report['checks'].append('All four section actions reachable by Tab with visible focus; no locked section')
    widths=[1440,768,390,320]
    for width in widths:
        b.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':width<600})
        assert b.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),width
        report.setdefault('responsive_widths',[]).append(width)
        if width==390:
            b.evaluate('scrollTo(0,0)'); b.screenshot(OUT/'home-dashboard-mobile.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False})
    b.evaluate('document.querySelector(".identity form").requestSubmit()'); b.wait('location.pathname === "/sign-in/"')
    login('trainer'); assert b.evaluate('!!document.querySelector("a[href=\'/course/1/coaching/\']")')
    visit('/course/1/','Trainer view'); visit('/course/1/orientation/')
    assert b.evaluate('document.body.innerText.includes("Read-only") && !document.querySelector("button[value=reviewed]")')
    report['checks'].append('Trainer homepage remains coaching desk; learner dashboard and orientation are read-only for trainer')
    report['result']='passed'
finally:
    if b:b.close()
    server.terminate(); server.wait(timeout=5); log.close()
    (OUT/'home-dashboard-browser.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
