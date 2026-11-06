"""Browser call rehearsal. Default mock; --provider uses the approved 8767 process.

Fictional fixture input only. It deliberately asserts that getUserMedia is never
called. The one call starts only through the normal UI and CSRF-protected route.
"""
import argparse
import json
from pathlib import Path
import time
from browser_review import Browser

parser = argparse.ArgumentParser(); parser.add_argument('--provider', action='store_true'); args = parser.parse_args()
ROOT = 'http://127.0.0.1:' + ('8767' if args.provider else '8768')
OUT = Path(__file__).resolve().parent.parent / 'artifacts'
label = 'provider' if args.provider else 'mock'
b = Browser()
report = {'mode': label, 'physical_microphone': 'not used', 'checks': []}


def login(role):
    b.navigate(ROOT + '/sign-in/')
    b.evaluate('document.querySelector("[name=email]").value=' + json.dumps(role + '@example.invalid') + ';document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")')
    url = b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")')
    b.navigate(ROOT + url); b.wait('document.querySelector("#token")?.value.length > 10')
    b.evaluate('document.querySelector("#token").form.requestSubmit()')
    b.wait('!!document.querySelector(".identity")')


def fill(data):
    b.evaluate('Object.entries(' + json.dumps(data) + ').forEach(([name,value])=>{document.querySelector(`[name="${name}"]`).value=value;})')


try:
    login('learner'); b.navigate(ROOT + '/course/1/live/')
    b.evaluate('window.__micCalls=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micCalls++;throw new Error("Physical microphone forbidden in this synthetic test")};')
    assert not b.evaluate('document.querySelector("#live-start").disabled'), 'Paid test process is not armed.'
    b.evaluate('document.querySelector("#live-consent").checked=true;document.querySelector("#live-start").click()')
    deadline = time.monotonic() + 30
    connected = False
    while time.monotonic() < deadline:
        state = b.evaluate('({url:location.pathname,status:document.querySelector("#live-status")?.textContent,text:document.body.innerText,save:document.querySelector("#live-notes-save")?.disabled})')
        if state.get('save') is False:
            connected = True; break
        if 'Saved call' in state['text'] or 'unavailable' in (state.get('status') or ''): break
        time.sleep(.2)
    report['connected'] = connected
    report['attempt_path'] = b.evaluate('location.pathname')
    if not connected:
        report['startup_result'] = state
        raise RuntimeError('The call did not reach connected state; inspect the sanitized report. No retry was attempted.')
    fill({'customer': 'Taylor Sample', 'sqft': '2000', 'service': 'biweekly',
        'needs': 'Kitchen buildup and bathrooms', 'initial_quote': '570', 'recurring_quote': '220',
        'disposition': 'request', 'follow_up': 'Preferred next week; team to confirm availability. Service request only.', 'reason': ''})
    b.evaluate('document.querySelector("#live-notes").requestSubmit()')
    b.wait('document.querySelector("#live-notes-status").textContent.includes("saved")')
    report['checks'].append('Fictional CRM notes saved through normal UI during call')
    assert b.evaluate('window.__micCalls') == 0
    report['checks'].append('Browser never requested physical microphone access')
    if not args.provider:
        b.wait('document.querySelector("#live-captions").textContent.includes("service request")')
        b.evaluate('new Promise(resolve=>setTimeout(resolve,8500))')
        b.evaluate('document.querySelector("#live-stop").click()')
    else:
        print('Live provider connected; fictional audio running. No microphone in use.', flush=True)
    deadline = time.monotonic() + (155 if args.provider else 30)
    while time.monotonic() < deadline:
        if b.evaluate('document.body.innerText.includes("Saved call")'): break
        time.sleep(.3)
    else: raise RuntimeError('Saved report did not appear within the bounded review window.')
    report['saved_text'] = b.evaluate('document.body.innerText')
    report['provider_coaching_received'] = b.evaluate('document.querySelector("#provider-coaching-status")?.textContent.trim() === "AI coaching: received"')
    b.screenshot(OUT / ('live-' + label + '-saved.jpg'))
    assert 'Provisional coaching' in report['saved_text']
    report['checks'].append('End call produced saved report with provisional coaching')
    playback = []
    for index in range(2):
        result = b.evaluate('''(async()=>{const a=document.querySelectorAll('audio[data-recording-track]')[INDEX];a.load();await new Promise((resolve,reject)=>{a.onloadedmetadata=resolve;a.onerror=()=>reject(new Error('audio not playable'));if(a.readyState>=1)resolve();});await a.play();await new Promise(r=>setTimeout(r,120));const result={duration:a.duration,playing:!a.paused,error:a.error?.code||null};a.pause();return result;})()'''.replace('INDEX', str(index)))
        playback.append(result)
    report['audio_playback'] = playback
    report['audio_signal'] = b.evaluate('''(async()=>{const context=new AudioContext({sampleRate:24000});const results=[];for(const element of document.querySelectorAll('audio[data-recording-track]')){const response=await fetch(element.src);const buffer=await context.decodeAudioData(await response.arrayBuffer());const samples=buffer.getChannelData(0);let peak=0,active=0;for(const value of samples){peak=Math.max(peak,Math.abs(value));if(Math.abs(value)>256/32768)active++;}results.push({peak,active_samples:active});}await context.close();return results;})()''')
    b.evaluate('document.querySelector(".identity form").requestSubmit()'); b.wait('location.pathname === "/sign-in/"')
    login('trainer'); b.navigate(ROOT + report['attempt_path'])
    assert b.evaluate('!!document.querySelector("[name=coaching]")')
    report['checks'].append('Trainer can open the call, evidence, and manager review form')
    if not args.provider:
        fill({'decision': 'retry', 'coaching': 'Ask a complete discovery question before explaining the price.',
              'keep_doing': 'Keep the request distinct from a confirmed booking.',
              'retry_task': 'Practice one discovery question and listen before quoting.'})
        b.evaluate('document.querySelector("[name=coaching]").form.requestSubmit()')
        b.wait('document.body.innerText.includes("Manager feedback")')
        report['checks'].append('Manager coaching and retry saved; no automatic readiness')
    b.screenshot(OUT / ('live-' + label + '-manager.jpg'))
    assert report['audio_signal'][0]['active_samples'] >= 2400, 'Trainee recording is silent; this is not a successful voice test.'
    if args.provider:
        assert report['audio_signal'][1]['active_samples'] >= 2400, 'Customer recording is silent.'
    assert report['provider_coaching_received'], 'No provider coaching was returned; the fallback section is not a passed test.'
    report['result'] = 'passed'
finally:
    OUT.mkdir(exist_ok=True)
    (OUT / ('live-' + label + '-browser.json')).write_text(json.dumps(report, indent=2) + '\n')
    b.close()
print(json.dumps({k: v for k, v in report.items() if k != 'saved_text'}, indent=2))
