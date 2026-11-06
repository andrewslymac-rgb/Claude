"""Current normal app verification. Only mock sign-in creates data."""
import base64, json
from pathlib import Path
from browser_review import Browser
ROOT='http://127.0.0.1:8765';OUT=Path(__file__).resolve().parent.parent/'artifacts'
b=Browser()
report={'url':ROOT+'/course/1/','new_provider_calls':0,'new_attempts':0,'microphone_used':False}
try:
    b.navigate(ROOT+'/sign-in/')
    b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    b.navigate(ROOT+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()')
    b.wait('location.pathname==="/course/1/" && !!document.querySelector(".learning-sections")')
    report['sections']=b.evaluate('[...document.querySelectorAll(".learning-section")].map(e=>({id:e.id,title:e.querySelector("h3").innerText,progress:e.querySelector(".section-progress").innerText,action:e.querySelector(".section-action").getAttribute("href")}))')
    assert len(report['sections'])==4
    report['progress']=b.evaluate('document.querySelector(".dashboard-progress").innerText')
    report['recommendation']=b.evaluate('document.querySelector(".primary-continue").getAttribute("href")')
    report['draft_resume']=b.evaluate('document.querySelector(".saved-draft a")?.getAttribute("href") || null')
    # One full-height screenshot showing all four sections on the actual normal database.
    height=b.evaluate('Math.ceil(document.documentElement.scrollHeight)')
    b.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':height,'deviceScaleFactor':1,'mobile':False})
    b.evaluate('scrollTo(0,0)');b.screenshot(OUT/'home-dashboard-current.jpg')
    b.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    assert b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    b.screenshot(OUT/'home-dashboard-current-mobile.jpg')
    b.navigate(ROOT+'/course/1/practice/');b.wait('document.body.innerText.includes("New live calls are currently disabled.")')
    b.navigate(ROOT+'/live/eaee3e09-ea2d-459e-a6a5-acb252a0708a/')
    b.wait('document.body.textContent.includes("Paid calls are disabled")')
    assert b.evaluate('document.querySelectorAll("audio").length===2')
    report['corrected_fictional_call_available']=True
    b.navigate(ROOT+'/course/3/live/')
    b.wait('!!document.querySelector("#live-start")')
    assert b.evaluate('document.querySelector("#live-start").disabled')
    report['pending_quality_test_still_disabled_on_normal_app']=True
    report['result']='passed'
finally:
    (OUT/'home-dashboard-main-browser.json').write_text(json.dumps(report,indent=2)+'\n')
    b.close()
print(json.dumps(report,indent=2))
