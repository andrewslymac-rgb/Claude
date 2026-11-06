"""Provider-off browser review on disposable port 8766. No physical microphone."""
import base64,io,json,struct,sys,wave
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from browser_review import Browser
from training.sales_scenarios import scenario_snapshot

ROOT='http://127.0.0.1:8766';OUT=Path(__file__).resolve().parent.parent/'artifacts'
b=Browser();report={'data':'disposable QA only','provider_requests':0,'physical_microphone_used':False,'checks':[]}
def visit(path):
    b.navigate(ROOT+path);b.wait('document.readyState==="complete"')
def fill(data):
    b.evaluate('Object.entries('+json.dumps(data)+').forEach(([key,value])=>{document.querySelector(`[name="${key}"]`).value=value;})')
def login(role):
    visit('/sign-in/');fill({'email':role+'@example.invalid'})
    b.evaluate('document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    b.navigate(ROOT+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()');b.wait('!!document.querySelector(".identity")')
def logout():
    b.evaluate('document.querySelector(".identity form").requestSubmit()');b.wait('location.pathname==="/sign-in/"')
def start(persona,difficulty='intermediate',drill='full'):
    visit(f'/course/1/scenarios/?persona_id={persona}&difficulty={difficulty}&drill={drill}')
    b.evaluate('document.querySelector("form[action$=\'/start/\']").requestSubmit()')
    b.wait('location.pathname.startsWith("/attempt/") && !!document.querySelector("#conversation")')
    return b.evaluate('location.pathname')
def turn(code):
    revision=b.evaluate('document.querySelector("[name=revision]").value')
    b.evaluate('document.querySelector('+json.dumps('[data-action="'+code+'"]')+').click()')
    b.wait('document.querySelector("[name=revision]")?.value !== '+json.dumps(revision))
def text():return b.evaluate('document.querySelector("#conversation .turn:last-of-type p").textContent')
def notes(persona,disposition):
    scenario=scenario_snapshot(persona);p=scenario['pricing']
    fill({'customer':scenario['customer'],'sqft':scenario['sqft'],'service':scenario['service'],'needs':scenario['needs'],
       'initial_quote':'' if p['manual'] else p.get('initial_deep',p['total']),
       'recurring_quote':p['total'] if 'initial_deep' in p else '',
       'disposition':disposition,'follow_up':'Record the actual agreement and ask the team to confirm remaining details.',
       'reason':'Scope or policy needs manager confirmation.' if disposition in {'nonfit','escalation'} else ''})
    revision=b.evaluate('document.querySelector("[name=revision]").value')
    b.evaluate('document.querySelector("[name=needs]").form.requestSubmit()')
    b.wait('document.querySelector("[name=revision]")?.value !== '+json.dumps(revision))
def submit():
    b.evaluate('document.querySelector("button[value=submit]").click()');b.wait('!!document.querySelector("#feedback")')
def review_and_retry(path):
    logout();login('trainer');visit(path)
    fill({'decision':'retry','coaching':'Clarify the concern before giving a response.','keep_doing':'Keep the request distinct from a booking.','retry_task':'Try a different caller.'})
    b.evaluate('document.querySelector("[name=coaching]").form.requestSubmit()');b.wait('document.body.textContent.includes("Manager feedback")')
    logout();login('learner')
try:
    login('learner');visit('/course/1/scenarios/')
    assert b.evaluate('document.querySelector("select[name=persona_id]").options.length===13')
    assert b.evaluate('!document.body.textContent.includes("Trainer configuration and caller prompt preview")')
    b.screenshot(OUT/'sales-caller-library.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    assert b.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    b.screenshot(OUT/'sales-caller-mobile.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False})
    first=start('busy_parent','advanced');turn('close');assert 'not ready' in text()
    for code in ['greet','discover','priorities','timing','value','explain']:turn(code)
    turn('respond');assert 'concern' in text()
    turn('acknowledge');turn('respond');assert 'general' in text()
    turn('probe');turn('respond');turn('check');assert 'One more thing' in text()
    turn('close');assert 'not ready' in text()
    for code in ['acknowledge','probe','respond','check','close']:turn(code)
    assert 'Yes, please record my service request' in text()
    # Generated PCM upload checks the existing protected recording integration;
    # it never requests browser microphone access or sends audio off this Mac.
    sample=io.BytesIO()
    with wave.open(sample,'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(24000)
        audio.writeframes(struct.pack('<12000h',*([2000,-2000]*6000)))
    payload=base64.b64encode(sample.getvalue()).decode()
    upload=b.evaluate('''(async()=>{const raw=atob(DATA),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),form=new FormData();form.set('recording',new Blob([bytes],{type:'audio/wav'}),'qa.wav');form.set('label','Generated QA tone — no microphone');form.set('csrfmiddlewaretoken',document.querySelector('[name=csrfmiddlewaretoken]').value);const r=await fetch(document.querySelector('[data-recorder]').dataset.recorder,{method:'POST',body:form});return {status:r.status,data:await r.json()};})()'''.replace('DATA',json.dumps(payload)))
    assert upload['status']==201;recording=upload['data']['recording_id']
    notes('busy_parent','request');submit()
    assert b.evaluate('document.querySelector("#feedback").textContent.includes("Qualified practice request")')
    assert b.evaluate('[...document.querySelectorAll("#feedback blockquote a")].every(a=>!!document.querySelector(a.getAttribute("href")))')
    assert b.evaluate('document.body.textContent.includes("Unassessed — audio listening required")')
    export=b.evaluate('(async()=>{const r=await fetch(location.pathname+"export/");return {status:r.status,data:await r.json()};})()')
    assert export['status']==200 and export['data']['feedback']['numeric_score'] is None
    assert export['data']['recordings'][0]['id']==recording
    download=b.evaluate('(async()=>{const r=await fetch('+json.dumps('/recording/'+recording+'/download/')+');return {status:r.status,disposition:r.headers.get("content-disposition"),size:(await r.arrayBuffer()).byteLength};})()')
    assert download['status']==200 and 'attachment' in download['disposition'] and download['size']>24000
    b.evaluate('document.querySelector("#feedback").scrollIntoView()');b.screenshot(OUT/'sales-scenario-feedback.jpg')
    report['checks'].append('Advanced caller resists early close and generic response, raises second concern, then accepts qualified request; exact evidence and generated recording export work')
    review_and_retry(first)
    second=start('think_about_it')
    for code in ['greet','discover','priorities','timing','value','explain','acknowledge','probe','respond','check','close']:turn(code)
    assert 'not service today' in text();turn('followup');notes('think_about_it','followup');submit()
    assert b.evaluate('document.querySelector("#feedback").textContent.includes("Follow-up agreed; no service commitment")')
    review_and_retry(second)
    third=start('office');turn('discover');turn('escalate');notes('office','nonfit');submit()
    assert b.evaluate('document.querySelector("#feedback").textContent.includes("Clarification / non-fit for review")')
    report['checks'].append('Partner decision stays follow-up only; unsupported office inquiry produces non-fit review, no invented commercial quote')
    logout();login('trainer');visit('/course/1/practice-report/')
    assert b.evaluate('document.body.textContent.includes("1 requests / 3 attempts") && document.body.textContent.includes("0.5 seconds")')
    b.screenshot(OUT/'sales-manager-report.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    assert b.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    b.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False})
    visit('/course/1/scenarios/?persona_id=pet_owner&difficulty=advanced&drill=full')
    assert b.evaluate('document.body.textContent.includes("Trainer configuration and caller prompt preview") && document.body.textContent.includes("ll-caller-v2")')
    report['checks'].append('Manager sees actual-data request/follow-up/non-fit trends and protected prompt preview; library/report fit mobile viewport')
    report['attempts']=[first,second,third];report['result']='passed'
finally:
    (OUT/'sales-enhancement-browser.json').write_text(json.dumps(report,indent=2)+'\n');b.close()
print(json.dumps(report,indent=2))
