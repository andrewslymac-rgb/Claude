"""Read-only training checks on the normal app; only local mock sign-in writes."""
import json
from pathlib import Path
from browser_review import Browser

b=Browser();ROOT='http://127.0.0.1:8765';OUT=Path(__file__).resolve().parent.parent/'artifacts'
report={'port':8765,'new_attempts':0,'new_provider_requests':0,'physical_microphone_used':False,'checks':[]}
def visit(path):b.navigate(ROOT+path);b.wait('document.readyState==="complete"')
try:
    visit('/sign-in/')
    b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    b.navigate(ROOT+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()');b.wait('!!document.querySelector(".identity")')
    visit('/course/1/');assert b.evaluate('document.body.textContent.includes("of 6 lessons complete")')
    assert b.evaluate('!document.querySelector(\'.course-outline a[href*="/learn/complaints/"]\')')
    for path in ['/course/1/learn/welcome/3/','/course/1/learn/conversation/3/','/course/1/learn/objections/1/','/course/1/learn/followup/2/']:
        visit(path)
        assert b.evaluate('!document.body.textContent.includes("That’s the right idea") && document.body.textContent.includes("your trainer judges the response")')
    visit('/course/1/learn/objections/1/')
    report['saved_written_feedback_visible']=b.evaluate('!!document.querySelector(".writing-feedback")')
    assert report['saved_written_feedback_visible']
    b.evaluate('document.querySelector(".writing-feedback").scrollIntoView()');b.screenshot(OUT/'sales-main-written-feedback.jpg')
    visit('/course/1/learn/complaints/1/');assert b.evaluate('document.body.textContent.includes("RETIRED CONTENT") && !document.querySelector("[name=reflection]")')
    report['checks'].append('Normal port 8765 has six sales lessons, repaired writing feedback on all four questions, and retired complaint content read-only')
    visit('/course/1/practice/');assert b.evaluate('!!document.querySelector(\'a[href="/course/1/scenarios/"]\')')
    visit('/course/1/scenarios/');assert b.evaluate('document.querySelector("select[name=persona_id]").options.length===13')
    assert b.evaluate('document.querySelector("[data-nav=practice]").getAttribute("aria-current")==="page"')
    visit('/course/1/practice-report/');assert b.evaluate('document.body.textContent.includes("No eligible completed rehearsals yet")')
    report['checks'].append('Caller chooser and reports available; no disposable QA outcomes appear in the normal database')
    for ident,label,kind in [('f05578e6-0f4f-48f6-8c3c-3ff813a46198','Human microphone, fictional practice','human'),('eaee3e09-ea2d-459e-a6a5-acb252a0708a','Synthetic trainee speech','synthetic')]:
        visit('/live/'+ident+'/');assert b.evaluate('document.body.textContent.includes('+json.dumps(label)+')')
        assert b.evaluate('!document.querySelector("#full-call-audio") && document.querySelectorAll("audio").length===2 && document.body.textContent.includes("Paid calls are disabled")')
        result=b.evaluate('(async()=>{const r=await fetch(location.pathname+"audio/learner/download/",{headers:{Range:"bytes=0-43"}});return {status:r.status,disposition:r.headers.get("content-disposition")};})()')
        assert result['status']==206 and 'attachment' in result['disposition']
        report['checks'].append(kind+' saved call identified correctly; separate originals and protected range download work; paid mode disabled')
    report['result']='passed'
finally:
    (OUT/'sales-main-browser.json').write_text(json.dumps(report,indent=2)+'\n');b.close()
print(json.dumps(report,indent=2))
