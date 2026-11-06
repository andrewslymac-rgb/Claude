"""Browser render-clock fixture: two generated sources, overlap and actual stop."""
import json
from pathlib import Path
from browser_review import Browser
b=Browser();out=Path(__file__).resolve().parent.parent/'artifacts'
try:
 b.navigate('http://127.0.0.1:8766/sign-in/')
 result=b.evaluate('''(async()=>{
 const context=new AudioContext({sampleRate:24000});await context.resume();
 await context.audioWorklet.addModule('/static/training/capture-clock.js');
 const node=new AudioWorkletNode(context,'ll-capture-clock',{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[1]});
 const sink=context.createGain();sink.gain.value=0;node.connect(sink);sink.connect(context.destination);
 const microphone=context.createConstantSource(),customer=context.createConstantSource();
 microphone.offset.value=.2;customer.offset.value=.4;microphone.connect(node,0,0);customer.connect(node,0,1);
 const chunks=[];let done;const flushed=new Promise(r=>done=r);
 node.port.onmessage=e=>{if(e.data.flushed)done();else if(e.data.samples)chunks.push(e.data);};
 const rate=context.sampleRate,origin=Math.ceil((context.currentTime+.08)*rate),time=origin/rate;
 microphone.start(time);microphone.stop(time+.3);customer.start(time+.1);customer.stop(time+.2);
 await new Promise(r=>setTimeout(r,500));node.port.postMessage('flush');await flushed;
 function mean(from,to,key){let sum=0,count=0;for(const c of chunks)for(let i=0;i<c[key].length;i++){
 const t=(c.frame+i-origin)/rate;if(t>=from&&t<to){sum+=c[key][i];count++;}}return {mean:count?sum/count:null,frames:count};}
 const result={sample_rate:rate,input:mean(.02,.08,'samples'),before_customer:mean(.02,.08,'conversation'),
 overlap:mean(.12,.18,'conversation'),after_customer_stop:mean(.22,.28,'conversation'),
 final_flushed:chunks.some(c=>c.final),continuous_chunks:chunks.every((c,i)=>!i||c.frame===chunks[i-1].frame+chunks[i-1].samples.length),
 microphone_used:false,provider_requests:0,headless_audio_muted:true};
 microphone.disconnect();customer.disconnect();node.disconnect();sink.disconnect();await context.close();return result;
 })()''')
 assert result['sample_rate']==24000 and result['continuous_chunks']
 for key,expected in [('input',.2),('before_customer',.1),('overlap',.3),('after_customer_stop',.1)]:
  assert result[key]['frames']>1000 and abs(result[key]['mean']-expected)<.00001,(key,result)
 result['result']='passed';(out/'render-clock-browser.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
finally:b.close()
