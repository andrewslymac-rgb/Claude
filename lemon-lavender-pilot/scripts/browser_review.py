"""Local browser review using installed Chrome and a private DevTools pipe.
No packages, remote debugging port, or normal browser profile are required.
"""
import base64,json,os,select,subprocess,tempfile,time
from pathlib import Path

class Browser:
    def __init__(self, fake_audio=False):
        self.profile=tempfile.TemporaryDirectory(prefix='ll-browser-review-')
        incoming,self.write_fd=os.pipe()
        self.read_fd,outgoing=os.pipe()
        self.log=open('/tmp/ll-browser-review.log','ab')
        self.process=subprocess.Popen(['/bin/bash','-c','exec 3<&"$1" 4>&"$2"; shift 2; exec "$@"','ll-browser-pipe',str(incoming),str(outgoing),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check',
            '--disable-background-networking','--disable-component-update','--disable-sync','--mute-audio',
            '--user-data-dir='+self.profile.name, *(['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] if fake_audio else []),'about:blank'],
            stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=self.log,
            pass_fds=(incoming,outgoing),start_new_session=True)
        os.close(incoming);os.close(outgoing)
        self.buffer=b'';self.sequence=0;self.session=None
        self.call('Browser.getVersion')
        target=self.call('Target.createTarget',{'url':'about:blank'})['targetId']
        self.session=self.call('Target.attachToTarget',{'targetId':target,'flatten':True})['sessionId']
        self.call('Page.enable');self.call('Runtime.enable')
        self.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False})
    def call(self,method,params=None):
        self.sequence+=1;ident=self.sequence
        command={'id':ident,'method':method,'params':params or {}}
        if self.session:command['sessionId']=self.session
        os.write(self.write_fd,json.dumps(command).encode()+b'\0')
        end=time.monotonic()+15
        while time.monotonic()<end:
            if b'\0' in self.buffer:
                raw,self.buffer=self.buffer.split(b'\0',1)
                if not raw:continue
                response=json.loads(raw)
                if response.get('id')==ident:
                    if 'error' in response:raise RuntimeError(response['error'])
                    return response.get('result',{})
            else:
                ready,_,_=select.select([self.read_fd],[],[],max(0,end-time.monotonic()))
                if ready:
                    data=os.read(self.read_fd,1048576)
                    if not data:raise RuntimeError('Chrome pipe closed')
                    self.buffer+=data
        raise TimeoutError(method)
    def evaluate(self,expression):
        result=self.call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True,'userGesture':True})
        if 'exceptionDetails' in result:raise RuntimeError(result['exceptionDetails'])
        return result.get('result',{}).get('value')
    def wait(self,expression):
        deadline=time.monotonic()+15
        while time.monotonic()<deadline:
            try:
                if self.evaluate(expression):return
            except RuntimeError:pass
            time.sleep(.15)
        raise TimeoutError(expression)
    def navigate(self,url):
        self.call('Page.navigate',{'url':url})
        self.wait("document.readyState === 'complete'")
    def screenshot(self,path):
        data=self.call('Page.captureScreenshot',{'format':'jpeg','quality':85})['data']
        Path(path).write_bytes(base64.b64decode(data))
    def close(self):
        try:self.call('Browser.close')
        except Exception:pass
        try:self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:self.process.terminate()
        os.close(self.read_fd);os.close(self.write_fd);self.log.close()
        self.profile.cleanup()

if __name__=='__main__':
    browser=Browser()
    try:
        url='https://clienthub.getjobber.com/hubs/606c1883-bfca-488a-a201-23fc4176c4c4/public/requests/1901199/new?utm_source=google&source=social_media'
        browser.navigate(url)
        print(json.dumps(browser.evaluate("({url:location.href,title:document.title,text:document.body.innerText,fields:[...document.querySelectorAll('input,select,textarea')].map(e=>({tag:e.tagName,type:e.type,name:e.name,required:e.required,label:e.labels?.[0]?.innerText,options:e.options?[...e.options].map(o=>o.text):undefined}))})"),indent=2))
    finally:browser.close()
