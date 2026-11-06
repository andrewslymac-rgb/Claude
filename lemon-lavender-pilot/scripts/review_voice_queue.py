"""Exercise the production audio scheduler and render capture with generated PCM."""
import json
from pathlib import Path
from browser_review import Browser
b=Browser()
try:
 b.navigate('http://127.0.0.1:8768/sign-in/')
 result=b.evaluate('''(async()=>{
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/static/training/playback-queue.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 const context=new AudioContext({sampleRate:24000});await context.resume();await context.audioWorklet.addModule('/static/training/capture-clock.js');
 const capture=new AudioWorkletNode(context,'ll-capture-clock',{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[1]});
 const sink=context.createGain();sink.gain.value=0;capture.connect(sink);sink.connect(context.destination);
 const mic=context.createConstantSource();mic.offset.value=.2;mic.connect(capture,0,0);mic.start();
 const origin=Math.round(context.currentTime*24000),rows=[],chunks=[];let complete;
 const flushed=new Promise(r=>complete=r);capture.port.onmessage=e=>{if(e.data.flushed)complete(e.data);else if(e.data.samples)chunks.push(e.data);};
 const queue=new LLPlaybackQueue(context,origin,[[context.destination,0],[capture,1]],r=>rows.push(r));
 function event(id,epoch=0,frames=12000) {const bytes=new Uint8Array(frames*2),v=new DataView(bytes.buffer);for(let i=0;i<frames;i++)v.setInt16(i*2,13107,true);return {id,epoch,pcm:btoa(String.fromCharCode(...bytes))};}
 const scheduled=[],fake={currentTime:0,sampleRate:24000,
 createBuffer:(channels,frames,rate)=>({duration:frames/rate,getChannelData:()=>new Float32Array(frames)}),
 createBufferSource:()=>({connect(){},disconnect(){},start(at){scheduled.push(at);},stop(){}})};
 const contiguous=new LLPlaybackQueue(fake,0,[],()=>{});
 contiguous.push(event(1,0,480));fake.currentTime=.03;contiguous.push(event(2,0,480));
 const keeps_contiguous_near_queue_end=Math.abs(scheduled[1]-.05)<.000001;
 const first=event(1),second=event(2);queue.push(first);queue.push(second);queue.push(second);
 await new Promise(r=>setTimeout(r,180));const hold=context.currentTime;queue.hold();queue.push(event(3,1));
 await new Promise(r=>setTimeout(r,180));queue.resume(2);queue.push(event(4,0));queue.push(event(5,2,2880));
 let conflict=false,order=false;try{queue.push({...first,pcm:event(9,0,240).pcm});}catch(e){conflict=true;}
 try{queue.push(event(0));}catch(e){order=true;}
 await new Promise(r=>setTimeout(r,240));queue.close();capture.port.postMessage('flush');const final=await flushed;
 function mean(from,to) {let total=0,n=0;for(const c of chunks)for(let i=0;i<c.conversation.length;i++){const t=(c.frame+i)/24000;if(t>=from&&t<to){total+=c.conversation[i];n++;}}return {mean:total/n,frames:n};}
 const cancelled=rows.filter(r=>r.phase==='cancelled');
 const result={keeps_contiguous_near_queue_end,rows,cancelled_active:cancelled.find(r=>r.audio_event_id===1),cancelled_queued:cancelled.find(r=>r.audio_event_id===2),
 held_interval:mean(hold+.03,hold+.14),duplicate_scheduled_once:rows.filter(r=>r.audio_event_id===2&&r.phase==='scheduled').length===1,
 old_epoch_dropped:rows.some(r=>r.audio_event_id===4&&r.phase==='dropped'),new_epoch_played:rows.some(r=>r.audio_event_id===5&&r.phase==='ended'),
 conflict_rejected:conflict,out_of_order_rejected:order,continuous_capture:chunks.every((c,i)=>!i||c.frame===chunks[i-1].frame+chunks[i-1].samples.length),
 flush_end_matches:final.endFrame===chunks.at(-1).frame+chunks.at(-1).samples.length,provider_calls:0,physical_microphone_used:false,headless_audio_muted:true};
 mic.stop();capture.disconnect();sink.disconnect();await context.close();return result;
 })()''')
 for key in ['keeps_contiguous_near_queue_end','duplicate_scheduled_once','old_epoch_dropped','new_epoch_played','conflict_rejected','out_of_order_rejected','continuous_capture','flush_end_matches']:assert result[key],(key,result)
 assert 0<result['cancelled_active']['played_frames']<12000
 assert result['cancelled_queued']['played_frames']==0
 assert result['held_interval']['frames']>2000 and abs(result['held_interval']['mean']-.1)<.0001
 result['result']='passed';Path('artifacts/voice-queue-browser.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
finally:b.close()
