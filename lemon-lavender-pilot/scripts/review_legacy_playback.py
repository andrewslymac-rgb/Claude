"""Verify that old recordings cannot play as a guessed conversation."""
import json
from pathlib import Path
from browser_review import Browser
b=Browser();root='http://127.0.0.1:8767';out=Path(__file__).resolve().parent.parent/'artifacts'
report={'paid_calls':0,'microphone_used':False,'checks':[]}
try:
 b.navigate(root+'/sign-in/')
 b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
 b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
 b.navigate(root+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
 b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()');b.wait('!!document.querySelector(".identity")')
 for ident in ('f05578e6-0f4f-48f6-8c3c-3ff813a46198','eaee3e09-ea2d-459e-a6a5-acb252a0708a'):
  b.navigate(root+'/live/'+ident+'/');b.wait('!!document.querySelector("#recording-timing-limit")')
  assert b.evaluate('!document.querySelector("#full-call-audio") && document.querySelectorAll("audio").length===2')
  status=b.evaluate('(async()=>{const r=await fetch(location.pathname+"audio/combined/");return r.status;})()')
  assert status==404
  report['checks'].append({'call':ident,'combined_unavailable':True,'originals_visible':True})
  if ident.startswith('f055'):
   result=b.evaluate('''(async()=>{const a=document.querySelector('[data-recording-track=learner]');const c=document.querySelector('[data-recording-track=customer]');await a.play();await c.play();const ok=a.paused&&!c.paused;c.pause();return ok;})()''')
   assert result;report['one_speaker_at_a_time']=True
   b.screenshot(out/'legacy-recording-correction.jpg')
 report['result']='passed'
finally:
 (out/'legacy-playback-browser.json').write_text(json.dumps(report,indent=2)+'\n');b.close()
print(json.dumps(report,indent=2))
