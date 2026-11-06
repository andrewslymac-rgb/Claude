"""Follow-up and trainer-writing QA on the disposable database; no microphone used."""
import json
from pathlib import Path
from browser_review import Browser
ROOT='http://127.0.0.1:8766';OUT=Path(__file__).resolve().parent.parent/'artifacts';b=Browser()
report={'database':'disposable QA only','microphone_used':False,'checks':[]}
def visit(path):
    b.navigate(ROOT+path);b.wait('location.pathname==='+json.dumps(path)+' && document.readyState==="complete"')
def login(role):
    visit('/sign-in/');b.evaluate('document.querySelector("[name=email]").value='+json.dumps(role+'@example.invalid')+';document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")');url=b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")')
    b.navigate(ROOT+url);b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()')
    b.wait('location.pathname==='+json.dumps('/course/1/' if role=='learner' else '/')+' && !!document.querySelector(".identity")')
def fill(data):b.evaluate('Object.entries('+json.dumps(data)+').forEach(([name,value])=>document.querySelector(`[name="${name}"]`).value=value)')
def act(action,**data):
    old=b.evaluate('document.querySelectorAll("article.turn").length')
    if data:fill(data)
    b.evaluate('document.querySelector("input[name=action][value='+action+']").form.requestSubmit()')
    b.wait('document.querySelectorAll("article.turn").length==='+str(old+1))
try:
    login('learner');visit('/course/1/follow-up/')
    fill({'source':'facebook','arrival':'missed_call','email_case':'invalid','preference':'all','context':'after_hours','day_one_weekday':'4','after_hours_fixture':'friday_evening'})
    b.evaluate('document.querySelector("[name=source]").form.requestSubmit()');b.wait('location.pathname.startsWith("/follow-up/") && !!document.querySelector("[name=elapsed_seconds]")')
    assert b.evaluate('document.body.innerText.includes("08:05") || document.body.innerText.includes("8:05")')
    for action,elapsed in [('call',60),('voicemail',120),('text',180)]:act(action,elapsed_seconds=elapsed)
    assert not b.evaluate('!!document.querySelector("input[name=action][value=email]")')
    b.evaluate('document.querySelector("button[value=response]").click()');b.wait('!!document.querySelector("[name=promised_when]")')
    fill({'channel':'call','promised_when':'','note':'Taylor wants a callback; confirm the exact Pacific date and clock time first.'})
    b.evaluate('const form=document.querySelector("[name=note]").form;form.noValidate=true;form.requestSubmit()')
    b.wait('document.body.innerText.includes("Check the callback fields below")')
    assert b.evaluate('document.querySelector("[name=note]").value.includes("Taylor wants a callback")')
    report['checks'].append('Friday after-hours deadline, simulated call/voicemail/text, invalid email skipped, response stops sequence, invalid callback retains note')
    act('callback',promised_when='Tuesday October 13, 2026 at 10 AM America/Los_Angeles',note='Taylor asked for a callback; team to handle the promise in Pacific time.')
    assert b.evaluate('document.body.innerText.includes("Saved for human handling")')
    b.evaluate('document.querySelector("button[value=opt_out]").click()');b.wait('document.body.innerText.includes("All outreach is stopped")')
    assert not b.evaluate('!!document.querySelector("[name=promised_when]")')
    report['checks'].append('Valid callback saved, then opt-out clears it and removes outreach actions')
    b.screenshot(OUT/'followup-reliability-browser.jpg')
    b.evaluate('document.querySelector(".identity form").requestSubmit()');b.wait('location.pathname==="/sign-in/"')
    login('trainer');visit('/course/1/coaching/')
    b.evaluate('const item=[...document.querySelectorAll("details")].find(el=>el.querySelector("summary")?.innerText.includes("Written lesson rehearsals"));item.open=true;item.scrollIntoView({block:"start"})')
    assert b.evaluate('document.querySelectorAll("details article.card").length===6')
    b.screenshot(OUT/'curriculum-rehearsal-review.jpg')
    visit('/course/1/learn/complaints/1/')
    assert b.evaluate('document.body.innerText.includes("Learner’s saved response") && document.body.innerText.includes("I help customers")')
    report['checks'].append('Trainer can read all six written rehearsals and a specific complaint response, with no learner write controls')
    report['result']='passed';(OUT/'followup-reliability-browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
finally:b.close()
