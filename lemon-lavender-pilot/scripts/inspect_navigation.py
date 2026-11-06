import json,os,socket,subprocess,tempfile,time
from pathlib import Path
from browser_review import Browser
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'artifacts'
qa=Path(tempfile.mkdtemp(prefix='ll-guided-qa-nav-before-',dir='/tmp'))
env={**os.environ,'DJANGO_SETTINGS_MODULE':'config.browser_qa_settings','LL_BROWSER_QA_DIR':str(qa)}
for args in [['migrate','--noinput'],['seed_demo']]:subprocess.run([str(ROOT/'.venv/bin/python'),'manage.py',*args],cwd=ROOT,env=env,check=True,stdout=subprocess.DEVNULL)
log=open(qa/'server.log','w');server=subprocess.Popen([str(ROOT/'.venv/bin/python'),'manage.py','runserver','127.0.0.1:8766','--noreload','--nothreading'],cwd=ROOT,env=env,stdout=log,stderr=log)
b=None;report={}
try:
    end=time.monotonic()+8
    while True:
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',8766))==0:break
        if time.monotonic()>end:raise RuntimeError('Server unavailable')
        time.sleep(.1)
    b=Browser();base='http://127.0.0.1:8766'
    b.navigate(base+'/course/1/learn/pricing/2/');b.wait('location.pathname==="/sign-in/"')
    b.evaluate('document.querySelector("[name=email]").value="learner@example.invalid";document.querySelector("[name=email]").form.requestSubmit()')
    b.wait('!!document.querySelector("a[href^=\'/magic/#\']")');b.navigate(base+b.evaluate('document.querySelector("a[href^=\'/magic/#\']").getAttribute("href")'))
    b.wait('document.querySelector("#token")?.value.length>10');b.evaluate('document.querySelector("#token").form.requestSubmit()');b.wait('!!document.querySelector(".identity")')
    report['deep_link_after_login']=b.evaluate('location.pathname')
    for name,path in [('home','/course/1/'),('lesson','/course/1/learn/welcome/1/'),('practice','/course/1/practice/'),('coaching','/course/1/coaching/')]:
        b.navigate(base+path);b.wait('location.pathname==='+json.dumps(path)+' && document.readyState==="complete"')
        b.screenshot(OUT/f'navigation-before-{name}.jpg')
        report[name]=b.evaluate('({headings:[...document.querySelectorAll("h1,h2,h3")].filter(e=>e.checkVisibility()).map(e=>e.innerText),actions:[...document.querySelectorAll("main a,main button")].filter(e=>e.checkVisibility()).map(e=>e.innerText.trim()),height:document.documentElement.scrollHeight})')
    (OUT/'navigation-before.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
finally:
    if b:b.close()
    server.terminate();server.wait(timeout=5);log.close()
