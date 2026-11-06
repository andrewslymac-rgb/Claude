"""Full fictional learner journey in an isolated DB. No microphone or provider."""
import json,os,socket,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'artifacts';sys.path.insert(0,str(ROOT))
from browser_review import Browser
from training.curriculum import LESSONS
from training.written_examples import EXAMPLES,PARTIAL
qa=Path(tempfile.mkdtemp(prefix='ll-guided-qa-navigation-',dir='/tmp'))
env={**os.environ,'DJANGO_SETTINGS_MODULE':'config.browser_qa_settings','LL_BROWSER_QA_DIR':str(qa)}
for args in [['migrate','--noinput'],['seed_demo']]:subprocess.run([str(ROOT/'.venv/bin/python'),'manage.py',*args],cwd=ROOT,env=env,check=True,stdout=subprocess.DEVNULL)
log=open(qa/'server.log','w');server=subprocess.Popen([str(ROOT/'.venv/bin/python'),'manage.py','runserver','127.0.0.1:8766','--noreload','--nothreading'],cwd=ROOT,env=env,stdout=log,stderr=log)
b=None;report={'database':str(qa/'qa.sqlite3'),'checks':[],'lessons':[],'provider_requests':0,'microphone_used':False};base='http://127.0.0.1:8766'
try:
    end=time.monotonic()+8
    while True:
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',8766))==0:break
        if time.monotonic()>end:raise RuntimeError('Server unavailable')
        time.sleep(.1)
    b=Browser()
    def visit(path):
        b.navigate(base+path);b.wait('location.pathname==='+json.dumps(path.split('#')[0])+' && document.readyState==="complete"')
    def click(selector):
        assert b.evaluate('document.querySelector('+json.dumps(selector)+')?.checkVisibility()'),selector
        b.evaluate('document.querySelector('+json.dumps(selector)+').click()')
    def fill(data):
        b.evaluate('Object.entries('+json.dumps(data)+').forEach(([name,value])=>{const e=document.querySelector(`[name="${name}"]`);e.value=value;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})')
    def login(role='learner',expected='/course/1/',existing=False):
        if not existing:visit('/sign-in/')
        fill({'email':role+'@example.invalid'});b.evaluate('document.querySelector("[name=email]").form.requestSubmit()')
        b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
        assert b.evaluate('document.querySelectorAll("main .button,main button:not(.demo-account)").length')==1
        b.navigate(base+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
        b.wait('document.querySelector("#confirm-signin")?.disabled===false')
        assert b.evaluate('document.querySelector("#token").type')=='hidden'
        click('#confirm-signin');b.wait('location.pathname==='+json.dumps(expected)+' && !!document.querySelector(".identity")')
    def logout():
        b.evaluate('document.querySelector(".identity form").requestSubmit()');b.wait('location.pathname==="/sign-in/"')
    def one_primary():
        assert b.evaluate('[...document.querySelectorAll("main .primary-continue")].filter(e=>e.checkVisibility()).length')==1
    b.navigate(base+'/course/1/learn/pricing/2/');b.wait('location.pathname==="/sign-in/"')
    login(expected='/course/1/learn/pricing/2/',existing=True)
    report['checks'].append('Saved lesson deep link survives scanner-safe sign-in; token is not exposed in the learner form')
    visit('/course/1/');one_primary()
    report['visible_home_actions']=b.evaluate('[...document.querySelectorAll("main a,main button")].filter(e=>e.checkVisibility()).map(e=>e.innerText.trim())')
    assert len(report['visible_home_actions'])==5
    b.screenshot(OUT/'navigation-new-learner.jpg')
    for slug in ['meet','industry','objections','role-playing']:
        visit('/course/1/stage/'+slug+'/');one_primary()
        assert b.evaluate('!!document.querySelector(".stage-lessons")')
    visit('/course/1/');click('.primary-continue');b.wait('location.pathname==="/course/1/learn/welcome/1/"')
    report['checks'].append('Home has five visible actions: one Start plus four ordered stage links; all stages open without a gate')
    order=['welcome','services','pricing','objections','conversation','followup']
    for key in order:
        lesson=next(x for x in LESSONS if x['key']==key)
        for index,page in enumerate(lesson['pages'],1):
            path=f'/course/1/learn/{key}/{index}/'
            b.wait('location.pathname==='+json.dumps(path)+' && document.readyState==="complete"')
            if key=='welcome' and index==1:
                b.screenshot(OUT/'navigation-lesson.jpg')
                wrong=next(o['value'] for o in page['choices'] if o['value']!=page['correct'])
                click('input[name=choice][value="'+wrong+'"]');click('button[value=check]')
                b.wait('document.body.innerText.includes("Revisit the selected choice")')
                assert not b.evaluate('!!document.querySelector("button[value=continue]")')
                report['checks'].append('Incorrect choice stays at the check with a clear retry, without false completion')
            if key=='welcome' and index==3:
                draft='Thank you for calling Lemon and Lavender. We clean homes. What cleaning help would be useful?'
                fill({'reflection':draft});click('button[value=save]');b.wait('location.pathname==="/course/1/"')
                assert b.evaluate('document.querySelector(".primary-continue").getAttribute("href")')==path
                logout();login();one_primary();click('.primary-continue');b.wait('location.pathname==='+json.dumps(path)+' && !!document.querySelector("textarea")')
                assert b.evaluate('document.querySelector("textarea").value')==draft
                report['checks'].append('Save & return home and a fresh sign-in resume the exact saved step and writing')
                click('input[name=choice][value="'+page['correct']+'"]');fill({'reflection':PARTIAL[(key,index-1)]});click('button[value=check]')
                b.wait('!!document.querySelector(".writing-feedback")')
                assert not b.evaluate('!!document.querySelector("button[value=continue]")')
                report['checks'].append('Partial writing has visible revision guidance; no misleading Next action')
            click('input[name=choice][value="'+page['correct']+'"]')
            if page.get('reflection'):fill({'reflection':EXAMPLES[(key,index-1)][0]})
            click('button[value=check]');b.wait('!!document.querySelector("button[value=continue]")')
            one_primary()
            if page.get('reflection'):
                assert b.evaluate('document.querySelector(".revision-editor").open') is False
                assert b.evaluate('document.body.innerText.includes("Pending manager review")')
                if key=='welcome':
                    click('.revision-editor summary');fill({'reflection':EXAMPLES[(key,index-1)][1]})
                    assert b.evaluate('document.querySelector(".next-step-form").hidden')
                    click('button[value=check]');b.wait('document.querySelector(".next-step-form")?.hidden===false')
                    report['checks'].append('Checked writing has one Next action; editing hides Next until the changed response is checked')
            click('button[value=continue]')
            expected=f'/course/1/learn/{key}/{index+1}/' if index<3 else f'/course/1/learn/{key}/complete/'
            b.wait('location.pathname==='+json.dumps(expected)+' && document.readyState==="complete"')
        report['lessons'].append({'key':key,'steps_completed':3})
        one_primary();click('.primary-continue')
        if key=='welcome':
            b.wait('location.pathname==="/course/1/orientation/"');one_primary();click('button[value=reviewed]')
            b.wait('location.pathname==="/course/1/learn/services/1/"')
            report['checks'].append('Stage 1 completion leads to orientation; its single acknowledgment continues directly to services')
    b.wait('location.pathname==="/course/1/practice/"');one_primary()
    assert b.evaluate('document.body.innerText.includes("New live calls are currently disabled")')
    b.screenshot(OUT/'navigation-practice.jpg')
    click('.primary-continue');b.wait('location.pathname.startsWith("/attempt/") && !!document.querySelector("button[value=submit]")')
    attempt_path=b.evaluate('location.pathname')
    visit('/course/1/');one_primary();assert b.evaluate('document.querySelector(".primary-continue").getAttribute("href")')==attempt_path
    click('.primary-continue');b.wait('location.pathname==='+json.dumps(attempt_path)+' && !!document.querySelector("input[name=revision]")')
    report['checks'].append('All 18 steps and orientation lead straight to practice; returning home resumes the active call')
    for action in ['discover','value','explain','objection']:
        revision=b.evaluate('document.querySelector("input[name=revision]").value')
        click('form:has(input[name=action][value="'+action+'"]) button')
        b.wait('document.querySelector("input[name=revision]")?.value!=='+json.dumps(revision))
    # Deliberately incomplete close, then explicit manager coaching/retry.
    fill({'sqft':'2000','needs':'Kitchen buildup and bathrooms','initial_quote':'570','recurring_quote':'220','follow_up':'Request only. Next week timing needs team confirmation. Payment needs manager confirmation.'})
    revision=b.evaluate('document.querySelector("input[name=revision]").value')
    click('form:has(input[name=op][value=crm]) button')
    b.wait('document.querySelector("input[name=revision]")?.value!=='+json.dumps(revision))
    click('button[value=submit]');b.wait('location.hash==="#practice-next" && document.body.innerText.includes("Your call is submitted.")');one_primary()
    assert b.evaluate('!document.querySelector(".practice-review-next form")')
    b.screenshot(OUT/'navigation-awaiting-review.jpg')
    visit('/course/1/');one_primary();assert b.evaluate('document.querySelector(".primary-continue").innerText.includes("Review submitted")')
    report['checks'].append('Incomplete submission has an explicit waiting state and saved evidence; home opens that attempt, not a blocked start')
    logout();login('trainer','/');visit(attempt_path)
    fill({'decision':'retry','coaching':'Ask for an explicit service request before saving the handoff.','keep_doing':'Explain the required initial deep and recurring estimate clearly.','retry_task':'Ask Taylor to agree to a service request; say the team must confirm availability.'})
    b.evaluate('document.querySelector("select[name=decision]").form.requestSubmit()')
    b.wait('document.body.innerText.includes("Coach and retry")')
    logout();login();one_primary();click('.primary-continue')
    b.wait('location.hash==="#manager-feedback" && !!document.querySelector(".practice-review-next form")');one_primary()
    b.screenshot(OUT/'navigation-trainer-feedback.jpg')
    click('.practice-review-next .primary-continue')
    b.wait('location.pathname.startsWith("/attempt/") && location.pathname!=='+json.dumps(attempt_path)+' && !!document.querySelector("button[value=submit]")')
    retry_path=b.evaluate('location.pathname');report['retry_is_separate_attempt']=retry_path!=attempt_path
    click('button[value=abandon]');b.wait('location.hash==="#practice-next" && document.body.innerText.includes("Pick up with a fresh attempt")');one_primary()
    report['checks'].append('Trainer feedback is first on return; one retry action creates a separate attempt, and ending early keeps a clear next step')
    visit('/course/1/');assert b.evaluate('document.body.innerText.includes("6 of 6 lessons complete")')
    home_history=b.call('Page.getNavigationHistory');home_id=home_history['entries'][home_history['currentIndex']]['id']
    click('.stage-list a[href$="/stage/objections/"]');b.wait('location.pathname==="/course/1/stage/objections/"')
    stage_history=b.call('Page.getNavigationHistory');stage_id=stage_history['entries'][stage_history['currentIndex']]['id']
    b.call('Page.navigateToHistoryEntry',{'entryId':home_id});b.wait('location.pathname==="/course/1/" && !!document.querySelector(".stage-list")')
    b.call('Page.navigateToHistoryEntry',{'entryId':stage_id});b.wait('location.pathname==="/course/1/stage/objections/" && !!document.querySelector(".stage-lessons")')
    report['checks'].append('Browser Back/Forward preserves stage and home state')
    for width in [1440,768,390,320]:
        b.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':width<600})
        for path in ['/course/1/','/course/1/stage/industry/','/course/1/practice/',attempt_path+'#manager-feedback']:
            visit(path);assert b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,path)
        report.setdefault('responsive_widths',[]).append(width)
    b.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    visit('/course/1/');b.screenshot(OUT/'navigation-mobile.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False})
    visit('/course/1/');b.evaluate('document.activeElement?.blur();document.body.tabIndex=-1;document.body.focus()')
    seen=set()
    for _ in range(28):
        for kind in ['keyDown','keyUp']:b.call('Input.dispatchKeyEvent',{'type':kind,'key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
        active=b.evaluate('({href:document.activeElement?.getAttribute("href"),focus:getComputedStyle(document.activeElement).outlineWidth})')
        if active['href'] and '/stage/' in active['href']:
            seen.add(active['href']);assert active['focus']!='0px'
    assert len(seen)==4
    report['checks'].append('Four stage links reachable by keyboard with visible focus; mobile home/stage/practice/review fit down to 320 pixels')
    report['result']='passed'
except Exception as error:
    report['error']=str(error)
    if b:
        report['failure_page']=b.evaluate('({path:location.pathname,text:document.body.innerText.slice(-1400)})')
        b.screenshot(OUT/'navigation-qa-failure.jpg')
    raise
finally:
    if b:b.close()
    server.terminate();server.wait(timeout=5);log.close()
    (OUT/'navigation-browser.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
