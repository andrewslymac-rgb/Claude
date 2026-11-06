"""Read-only review of saved local calls and polished screens. No provider/mic calls."""
import json
from pathlib import Path
from browser_review import Browser
ROOT='http://127.0.0.1:8765'
OUT=Path(__file__).resolve().parent.parent/'artifacts'
CALL='/live/f05578e6-0f4f-48f6-8c3c-3ff813a46198/'
b=Browser()
report={'physical_microphone_used':False,'provider_requests':0,'human_auditory_review':False,'checks':[],'screens':[]}
def visit(path):
    b.navigate(ROOT+path)
    b.wait('document.readyState==="complete"')
def login(role):
    visit('/sign-in/')
    b.evaluate('document.querySelector("[name=email]").value='+json.dumps(role+'@example.invalid')+';document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    b.navigate(ROOT+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#token")?.value.length>10')
    b.evaluate('document.querySelector("#token").form.requestSubmit()')
    b.wait('!!document.querySelector(".identity")')
def shot(name):
    assert b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), name+' horizontal overflow'
    b.screenshot(OUT/name); report['screens'].append(name)
def mobile(enabled):
    b.call('Emulation.setDeviceMetricsOverride',{'width':390 if enabled else 1440,'height':844 if enabled else 1050,'deviceScaleFactor':1,'mobile':enabled})
def play_seek():
    return b.evaluate('''(async()=>{const a=document.querySelector('#full-call-audio');
    if(a.readyState<1)await new Promise((r,j)=>{a.onloadedmetadata=r;a.onerror=()=>j(Error('metadata'));});
    await a.play();await new Promise(r=>setTimeout(r,300));const started=a.currentTime;
    a.currentTime=a.duration*.6;await new Promise(r=>setTimeout(r,300));const seeked=a.currentTime;
    const original=document.querySelector('[data-recording-track=learner]');await original.play();
    const exclusive=a.paused&&!original.paused;original.pause();a.currentTime=0;
    return {duration:a.duration,started,seeked,exclusive,error:a.error?.code||null};})()''')
try:
    visit('/sign-in/');shot('polished-sign-in.jpg')
    # Real browser keyboard navigation and visible focus.
    b.call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
    b.call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Tab','code':'Tab','windowsVirtualKeyCode':9})
    assert b.evaluate('document.activeElement.classList.contains("skip")')
    report['checks'].append('Keyboard Skip to content is reachable')
    mobile(True);shot('polished-sign-in-mobile.jpg');mobile(False)
    login('learner')
    assert b.evaluate('location.pathname==="/course/1/" && document.querySelectorAll(".primary-continue").length===1')
    assert b.evaluate('document.querySelector("[data-nav=learn]").getAttribute("aria-current")==="page"')
    shot('polished-learning-path.jpg');mobile(True);shot('polished-learning-path-mobile.jpg');mobile(False)
    visit('/course/1/learn/pricing/1/');shot('polished-lesson.jpg');mobile(True);shot('polished-lesson-mobile.jpg');mobile(False)
    visit('/course/1/practice/')
    assert b.evaluate('!!document.querySelector(\'a[href="'+CALL+'"]\')')
    assert b.evaluate('document.querySelector("[data-nav=practice]").getAttribute("aria-current")==="page"')
    b.evaluate('document.querySelector(".voice-library").scrollIntoView({block:"start"})');shot('polished-practice-recordings.jpg')
    visit(CALL);b.wait('!!document.querySelector("#full-call-audio")')
    assert 'Approximate alignment' in b.evaluate('document.querySelector("#combined-timing-note").innerText')
    report['playback']=play_seek();assert report['playback']['started']>0 and report['playback']['seeked']>25 and report['playback']['exclusive'] and not report['playback']['error']
    report['range']=b.evaluate('''(async()=>{const r=await fetch(document.querySelector('#full-call-audio').src,{headers:{Range:'bytes=44-143'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength,range:r.headers.get('Content-Range')};})()''')
    assert report['range']['status']==206 and report['range']['length']==100
    b.evaluate('scrollTo(0,0)');shot('polished-combined-call.jpg');mobile(True);shot('polished-combined-call-mobile.jpg');mobile(False)
    b.evaluate('document.querySelector(".evidence-links a").click()')
    b.wait('document.querySelector("#call-transcript").open')
    assert b.evaluate('!!document.querySelector(":target.transcript-turn")')
    report['checks'].append('Coaching evidence links reveal the correct folded transcript entry')
    b.evaluate('location.hash="coaching-feedback"');shot('polished-call-coaching.jpg')
    visit('/microphone-test/')
    assert b.evaluate('document.querySelector("#live-start").disabled && document.querySelector("#mic-check").disabled')
    report['checks'].append('Paid calling and microphone checks remain disabled')
    b.evaluate('document.querySelector(".identity form").requestSubmit()');b.wait('location.pathname==="/sign-in/"')
    login('trainer');shot('polished-manager-desk.jpg');mobile(True);shot('polished-manager-desk-mobile.jpg');mobile(False)
    visit(CALL);b.wait('!!document.querySelector("#full-call-audio")')
    assert b.evaluate('!!document.querySelector("[name=coaching]")')
    report['trainer_playback']=play_seek();assert report['trainer_playback']['exclusive']
    b.evaluate('document.querySelector("[name=coaching]").closest("section").scrollIntoView({block:"start"})');shot('polished-manager-review.jpg')
    visit('/course/1/coaching/');shot('polished-coaching-focus.jpg')
    # Same content should remain accessible on the user's previous port.
    ROOT='http://127.0.0.1:8767'
    login('trainer'); visit(CALL)
    b.wait('!!document.querySelector("#full-call-audio")')
    report['checks'].append('Saved call available on both existing local ports; trainer can play and review')
    report['checks'].append('Main player starts and seeks; original playback pauses it so voices are not doubled')
    report['checks'].append('Desktop and 390px screens have no horizontal overflow')
    report['result']='passed'
finally:
    (OUT/'polish-browser-review.json').write_text(json.dumps(report,indent=2)+'\n')
    b.close()
print(json.dumps(report,indent=2))
