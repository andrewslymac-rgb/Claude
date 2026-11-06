"""Disposable local browser QA for honest written feedback and sales-only scope."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from browser_review import Browser
from training.curriculum import LESSON_BY_KEY
from training.written_examples import EXAMPLES,PARTIAL
b=Browser();root='http://127.0.0.1:8766';out=Path(__file__).resolve().parent.parent/'artifacts'
report={'data':'disposable QA only','paid_calls':0,'microphone_used':False,'questions':[],'checks':[]}
def visit(path):
 b.navigate(root+path);b.wait('document.readyState==="complete"')
def login(role):
 visit('/sign-in/');b.evaluate('document.querySelector("[name=email]").value='+json.dumps(role+'@example.invalid')+';document.querySelector("[name=email]").form.requestSubmit()')
 b.wait('!!document.querySelector("a[href^=\'/magic/#\']")');b.navigate(root+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
 b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()');b.wait('!!document.querySelector(".identity")')
def check(text,choice):
 revision=b.evaluate('document.querySelector("[name=revision]").value')
 b.evaluate('document.querySelector("[name=reflection]").value='+json.dumps(text)+';document.querySelector(\'input[name=choice][value="'+choice+'"]\').checked=true;document.querySelector("button[value=check]").click()')
 b.wait('document.querySelector("[name=revision]")?.value !== '+json.dumps(revision)+' && !!document.querySelector(".writing-feedback")')
 assert b.evaluate('!document.body.innerText.includes("That’s the right idea")')
try:
 login('learner')
 for (key,index),examples in EXAMPLES.items():
  visit(f'/course/1/learn/{key}/{index+1}/');choice=LESSON_BY_KEY[key]['pages'][index]['correct']
  results=[]
  for label,text,state in [('offtopic','Purple spaceships eat spaghetti on Jupiter every morning.','incorrect'),('partial',PARTIAL[(key,index)],'partial'),('policy',examples[0]+' We can waive the initial deep.','incorrect'),('valid',examples[1],'unassessed')]:
   check(text,choice)
   assert b.evaluate('document.querySelector(".writing-feedback").classList.contains('+json.dumps(state)+')')
   assert b.evaluate('!!document.querySelector("button[value=continue]")')==(state=='unassessed')
   assert b.evaluate('document.body.innerText.includes("Multiple-choice answer correct.")')
   results.append({'case':label,'state':state})
   if key=='welcome' and label in {'offtopic','partial','valid'}:
    b.evaluate('document.querySelector(".writing-feedback").scrollIntoView({block:"start"})');b.screenshot(out/f'writing-{label}-browser.jpg')
  assert b.evaluate('!![...document.querySelectorAll("summary")].find(e=>e.innerText.includes("Written-response history"))')
  report['questions'].append({'lesson':key,'step':index+1,'cases':results,'history_present':True})
 # A legitimate interpretation the local checker cannot establish goes explicitly to a trainer.
 visit('/course/1/learn/welcome/3/');check(PARTIAL[('welcome',2)],'0')
 b.evaluate('document.querySelector("button[value=request_review]").click()')
 b.wait('!!document.querySelector("button[value=continue]") && document.body.innerText.includes("requested trainer review")')
 assert b.evaluate('document.querySelector(".writing-feedback").classList.contains("unassessed")')
 report['checks'].append('Explicit trainer-review request stays unassessed, preserving local missing-detail guidance')
 visit('/course/1/');assert b.evaluate('document.body.innerText.includes("of 6 lessons complete")')
 b.evaluate('document.querySelector(".course-outline").open=true')
 assert not b.evaluate('!!document.querySelector(\'a[href*="/learn/complaints/"]\')')
 visit('/course/1/practice/');assert not b.evaluate('document.body.textContent.toLowerCase().includes("complaint")')
 visit('/course/1/learn/complaints/1/');assert b.evaluate('document.body.innerText.includes("RETIRED CONTENT") && !document.querySelector("[name=reflection]")')
 report['checks'].append('Six active sales lessons; no complaint exercise; old lesson URL is clearly retired and read-only')
 b.evaluate('document.querySelector(".identity form").requestSubmit()');b.wait('location.pathname==="/sign-in/"')
 login('trainer');visit('/course/1/coaching/')
 b.evaluate('[...document.querySelectorAll("details")].find(e=>e.querySelector("summary")?.innerText.includes("Written lesson rehearsals")).open=true')
 assert b.evaluate('document.body.innerText.includes("Earlier green feedback checked only") && document.body.innerText.includes("Pending manager review")')
 b.evaluate('[...document.querySelectorAll("details")].find(e=>e.open).scrollIntoView({block:"start"})');b.screenshot(out/'writing-manager-browser.jpg')
 visit('/course/1/learn/welcome/3/');assert not b.evaluate('!!document.querySelector("button[value=check]")')
 report['checks'].append('Trainer sees separate written status and preserved history without learner edit controls')
 report['result']='passed'
finally:
 (out/'written-feedback-browser.json').write_text(json.dumps(report,indent=2)+'\n');b.close()
print(json.dumps(report,indent=2))
