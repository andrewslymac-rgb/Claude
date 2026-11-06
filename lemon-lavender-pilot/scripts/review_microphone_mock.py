"""Offline mic UI acceptance with a generated MediaStream; never a physical mic.

The ONLY server target is the disposable fake provider on port 8768.
"""
import json
from pathlib import Path
from browser_review import Browser

ROOT = 'http://127.0.0.1:8768'
OUT = Path(__file__).resolve().parent.parent / 'artifacts'
b = Browser()
report = {'mode':'offline_mock_only','physical_microphone_used':False,'paid_provider_calls':0,'checks':[]}
try:
    b.navigate(ROOT + '/sign-in/')
    b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    b.navigate(ROOT + b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#token")?.value.length>10')
    b.evaluate('document.querySelector("#token").form.requestSubmit()'); b.wait('!!document.querySelector(".identity")')
    b.navigate(ROOT + '/microphone-test/')
    b.wait('!!document.querySelector("#mic-check")')
    assert 'OFFLINE PROTOCOL REHEARSAL' in b.evaluate('document.body.innerText')
    b.evaluate('''window.__starts=0;window.__gum=0;window.__streams=[];window.__contexts=[];
      const originalFetch=window.fetch.bind(window);window.fetch=(url,...args)=>{if(String(url).endsWith('/live/start/'))window.__starts++;return originalFetch(url,...args);};
      navigator.mediaDevices.getUserMedia=async()=>{window.__gum++;throw new DOMException('Mock denial','NotAllowedError');};''')
    assert b.evaluate('window.__gum===0 && window.__starts===0 && document.querySelector("#live-start").disabled')
    b.evaluate('document.querySelector("#mic-check").click()')
    assert b.evaluate('window.__gum===0 && window.__starts===0')
    b.evaluate('document.querySelector("#live-consent").checked=true;document.querySelector("#mic-check").click()')
    b.wait('document.querySelector("#mic-check-status").textContent.includes("denied")')
    assert b.evaluate('window.__starts===0 && document.querySelector("#live-start").disabled')
    report['checks'].append('Consent and microphone denial cause zero call-start requests')
    b.evaluate('''navigator.mediaDevices.getUserMedia=async()=>{window.__gum++;
      const c=new AudioContext({sampleRate:24000});await c.resume();const o=c.createOscillator();
      const g=c.createGain();g.gain.value=.1;const d=c.createMediaStreamDestination();o.connect(g);g.connect(d);o.start();
      window.__contexts.push(c);window.__streams.push(d.stream);if(window.__delayMic)await new Promise(r=>setTimeout(r,300));return d.stream;};
      window.__delayMic=true;document.querySelector('#mic-check').click();document.querySelector('#mic-check-stop').click();''')
    b.evaluate('new Promise(resolve=>setTimeout(resolve,600))')
    assert b.evaluate('window.__starts===0 && window.__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')
    report['checks'].append('Cancel while microphone permission is pending stops late-arriving tracks without a call')
    b.evaluate('window.__delayMic=false;document.querySelector("#mic-check").click()')
    b.wait('!document.querySelector("#live-start").disabled')
    assert b.evaluate('window.__starts===0 && window.__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')
    report['checks'].append('Local generated-audio check detects sound and releases every track before any paid-start route')
    b.screenshot(OUT / 'microphone-ready-mock.jpg')
    b.evaluate('document.querySelector("#live-start").click()')
    b.wait('document.querySelector("#live-notes-save").disabled===false')
    assert b.evaluate('window.__starts===1 && window.__streams.at(-1).getAudioTracks()[0].readyState==="live"')
    report['checks'].append('Only deliberate Start sends one call-start request and opens the generated input stream')
    values={'customer':'Taylor Sample','sqft':'2000','service':'biweekly','needs':'Kitchen buildup and bathrooms',
            'initial_quote':'570','recurring_quote':'220','disposition':'request',
            'follow_up':'Availability needs confirmation; fictional service request only.','reason':''}
    b.evaluate('Object.entries('+json.dumps(values)+').forEach(([k,v])=>document.querySelector(`[name="${k}"]`).value=v);document.querySelector("#live-notes").requestSubmit()')
    b.wait('document.querySelector("#live-notes-status").textContent.includes("saved")')
    b.wait('document.querySelector("#live-captions").textContent.includes("service request")')
    report['attempt_path']=b.evaluate('location.pathname')
    b.evaluate('document.querySelector("#live-stop").click()')
    assert b.evaluate('window.__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')
    b.evaluate('window.__contexts.forEach(c=>c.close())')
    report['checks'].append('End call immediately releases microphone tracks')
    b.wait('!!document.querySelector("#full-call-audio")')
    body=b.evaluate('document.body.textContent')
    assert 'AI coaching: received' in body and 'Paid calls are disabled.' in body
    assert 'Human microphone, fictional practice' in body and 'OFFLINE PROTOCOL REHEARSAL' in body
    report['checks'].append('Fake coaching and evidence saved; one-shot provider mode automatically disabled')
    report['learner_audio']=b.evaluate('''(async()=>{const a=document.querySelector('audio[data-recording-track=learner]');const c=new AudioContext();const r=await fetch(a.src);const d=await c.decodeAudioData(await r.arrayBuffer());let peak=0;for(const x of d.getChannelData(0))peak=Math.max(peak,Math.abs(x));await c.close();return {seconds:d.duration,peak};})()''')
    assert report['learner_audio']['peak']>.01
    b.screenshot(OUT / 'microphone-saved-mock.jpg')
    b.navigate(ROOT+'/microphone-test/'); b.wait('!!document.querySelector("#mic-check")')
    assert b.evaluate('document.querySelector("#mic-check").disabled && document.querySelector("#live-start").disabled')
    report['checks'].append('Reload cannot reopen microphone checks or a second call under the consumed grant')
    report['result']='passed'
finally:
    (OUT/'microphone-mock-browser.json').write_text(json.dumps(report,indent=2)+'\n')
    b.close()
print(json.dumps(report,indent=2))
