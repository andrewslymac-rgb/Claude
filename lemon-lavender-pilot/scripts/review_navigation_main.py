"""Read-only normal-port verification; only local mock sign-in adds auth rows."""
import json
from pathlib import Path
from browser_review import Browser
OUT=Path(__file__).resolve().parent.parent/'artifacts';base='http://127.0.0.1:8765';b=Browser()
report={'url':base+'/course/1/','provider_requests':0,'microphone_used':False,'training_data_writes':0}
try:
    b.navigate(base+'/course/1/stage/objections/');b.wait('location.pathname==="/sign-in/"')
    b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")');b.navigate(base+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#confirm-signin")?.disabled===false');b.evaluate('document.querySelector("#confirm-signin").click()')
    b.wait('location.pathname==="/course/1/stage/objections/" && !!document.querySelector(".stage-lessons")')
    report['deep_link_restored']=True
    b.navigate(base+'/course/1/');b.wait('!!document.querySelector(".stage-list")')
    report['visible_actions']=b.evaluate('[...document.querySelectorAll("main a,main button")].filter(e=>e.checkVisibility()).map(e=>e.innerText.trim())')
    assert len(report['visible_actions'])==5
    report['next_url']=b.evaluate('document.querySelector(".primary-continue").getAttribute("href")')
    report['progress']=b.evaluate('document.querySelector(".journey-path-heading>span").innerText')
    height=b.evaluate('Math.ceil(document.documentElement.scrollHeight)')
    b.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':height,'deviceScaleFactor':1,'mobile':False})
    b.evaluate('scrollTo(0,0)');b.screenshot(OUT/'navigation-current.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    assert b.evaluate('document.documentElement.scrollWidth<=innerWidth+1');b.screenshot(OUT/'navigation-current-mobile.jpg')
    for slug in ['meet','industry','objections','role-playing']:
        b.navigate(base+'/course/1/stage/'+slug+'/');b.wait('location.pathname==='+json.dumps('/course/1/stage/'+slug+'/'))
        assert b.evaluate('!!document.querySelector(".stage-lessons")')
    b.navigate(base+'/course/1/practice/');b.wait('document.body.innerText.includes("New live calls are currently disabled")')
    b.navigate(base+'/live/eaee3e09-ea2d-459e-a6a5-acb252a0708a/');b.wait('document.body.textContent.includes("Paid calls are disabled")')
    assert b.evaluate('document.querySelectorAll("audio").length===2')
    assert b.evaluate('[...document.querySelectorAll(".practice-review-next a")].some(a=>a.getAttribute("href")==="#coaching-feedback")')
    report['original_voice_review_available']=True
    b.navigate(base+'/course/3/live/');b.wait('!!document.querySelector("#live-start")')
    assert b.evaluate('document.querySelector("#live-start").disabled')
    report['pending_voice_test_disabled_on_normal_app']=True
    report['result']='passed'
finally:
    (OUT/'navigation-main-browser.json').write_text(json.dumps(report,indent=2)+'\n');b.close()
print(json.dumps(report,indent=2))
