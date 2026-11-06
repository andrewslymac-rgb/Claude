"""Read-only UI smoke check of the running pilot; does not alter training evidence."""
import json
from pathlib import Path
from browser_review import Browser
ROOT='http://127.0.0.1:8765';OUT=Path(__file__).resolve().parent.parent/'artifacts'
b=Browser();report={'host':'MacBook-Pro.local','url':ROOT,'training_mutations':False}
def visit(path,text):
    b.navigate(ROOT+path);b.wait('location.pathname === '+json.dumps(path)+' && document.body.innerText.includes('+json.dumps(text)+')')
def login(role):
    visit('/sign-in/','Demo email')
    b.evaluate('document.querySelector("[name=email]").value='+json.dumps(role+'@example.invalid')+';document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")');url=b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")')
    b.navigate(ROOT+url);b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()')
    b.wait('location.pathname === '+json.dumps('/course/1/' if role=='learner' else '/')+' && !!document.querySelector(".identity")')
def logout():b.evaluate('document.querySelector(".identity form").requestSubmit()');b.wait('location.pathname === "/sign-in/"')
try:
    login('learner');visit('/course/1/','One step at a time.')
    report['progress']=b.evaluate('document.querySelector(".small-progress").innerText')
    assert b.evaluate('document.querySelectorAll(".primary-continue").length')==1
    b.screenshot(OUT/'guided-running-pilot.jpg')
    visit('/course/1/learn/welcome/1/','Turn our values into actions')
    visit('/course/1/services/','Extras and inclusions')
    visit('/course/1/coaching/','Readiness across the whole job')
    visit('/course/1/practice/','Try it. Review it. Try again.')
    old=b.evaluate('[...document.querySelectorAll("#history a")].map(a=>a.getAttribute("href"))')
    report['preserved_calls_visible']=len(old)
    assert len(old)==2
    for path in old:
        visit(path,'The conversation')
        assert b.evaluate('!!document.querySelector("audio source[src^=\'/static/training/audio/\']")')
    logout();login('trainer');visit('/course/1/coaching/','Set a coaching focus')
    report['trainer_readiness_available']=b.evaluate('!!document.querySelector("[name=knowledge]")')
    logout();login('admin');visit('/costs/','This demo costs $0 to run.')
    report['admin_costs_visible']=True;report['result']='passed'
    (OUT/'running-pilot-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
finally:b.close()
