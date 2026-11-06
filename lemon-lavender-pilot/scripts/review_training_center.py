"""Browser checks for the local demo; signs in only as reserved demo roles.
Reads lessons/history and plays muted audio. Does not edit training progress.
"""
import json,time
from pathlib import Path
from browser_review import Browser

ROOT='http://127.0.0.1:8765'
OUT=Path(__file__).resolve().parent.parent/'artifacts'
browser=Browser()
report={'host':'MacBook-Pro.local','pages':[],'audio':[]}

def visit(path,expected):
    browser.navigate(ROOT+path)
    browser.wait('document.body.innerText.includes('+json.dumps(expected)+')')
    report['pages'].append({'path':path,'title':browser.evaluate('document.title'),'verified_text':expected})

def login(email):
    assert email in ['learner@example.invalid','admin@example.invalid']
    browser.navigate(ROOT+'/sign-in/')
    browser.evaluate('document.querySelector("input[name=email]").value='+json.dumps(email)+';document.querySelector("input[name=email]").form.requestSubmit()')
    browser.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    url=browser.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")')
    browser.navigate(ROOT+url)
    browser.wait('document.querySelector("#token")?.value.length > 10')
    browser.evaluate('document.querySelector("#token").form.requestSubmit()')
    browser.wait('location.pathname === "/" && !!document.querySelector(".identity")')

try:
    login('learner@example.invalid')
    course=browser.evaluate('document.querySelector("a[href^=\'/course/\']").getAttribute("href")')
    visit(course,'Know Our Services & Pricing')
    browser.screenshot(OUT/'training-paths-updated.jpg')
    visit(course+'services/','Extras and inclusions')
    visit(course+'practice/','Two exercises are ready now.')
    browser.screenshot(OUT/'training-library-updated.jpg')
    browser.evaluate('document.querySelector("details").open=true')
    for index in range(3):
        result=browser.evaluate('''(async()=>{const a=document.querySelectorAll('audio')[INDEX]; a.load();
            await new Promise((resolve,reject)=>{if(a.readyState>=1)resolve();else{a.onloadedmetadata=resolve;a.onerror=()=>reject(new Error('Audio failed'));}});
            await a.play();await new Promise(r=>setTimeout(r,200));
            const result={label:a.getAttribute('aria-label'),duration:a.duration,playing:!a.paused,time:a.currentTime,error:a.error?.code||null};a.pause();return result;})()'''.replace('INDEX',str(index)))
        assert result['duration']>1 and result['playing'] and not result['error'],result
        report['audio'].append(result)
    # Existing call history remains available, including its original audio version.
    old=browser.evaluate('document.querySelector(".list-row a[href^=\'/attempt/\']")?.getAttribute("href")')
    if old:
        visit(old,'The conversation')
        report['legacy_audio_visible']=browser.evaluate('[...document.querySelectorAll("audio source")].every(e=>!e.src.includes("samantha-v2"))')
        assert report['legacy_audio_visible']
    browser.evaluate('document.querySelector(".identity form").requestSubmit()')
    browser.wait('location.pathname === "/sign-in/"')
    login('admin@example.invalid')
    visit('/costs/','This demo costs $0 to run.')
    browser.screenshot(OUT/'training-admin-updated.jpg')
    report['result']='passed'
    (OUT/'browser-review-results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
finally:browser.close()
