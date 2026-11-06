/* Application playback control. GPT-Live supplies no output-done/cancel event. */
(() => {
  'use strict';
  class PlaybackQueue {
    constructor(context, origin, destinations, report, lead = .03) {
      this.context=context; this.origin=origin; this.destinations=destinations;
      this.report=report; this.lead=lead; this.next=0; this.epoch=0;
      this.held=false; this.closed=false; this.lastId=0; this.seen=new Map(); this.nodes=new Map();
    }
    frame(time) { return Math.max(0,Math.round(time*this.context.sampleRate)-this.origin); }
    push(event) {
      const fingerprint=JSON.stringify([event.pcm,event.epoch ?? 0,event.suppressed ?? false]);
      if (this.seen.has(event.id)) {
        if (this.seen.get(event.id)!==fingerprint) throw new Error('Conflicting audio delivery.');
        return;
      }
      if (!Number.isSafeInteger(event.id)||event.id<=this.lastId||this.seen.size>=6000) throw new Error('Audio order or limit changed.');
      this.lastId=event.id; this.seen.set(event.id,fingerprint);
      const raw=atob(event.pcm), count=raw.length/2;
      if (!Number.isInteger(count)||!count||count>48000) throw new Error('Invalid customer audio.');
      const epoch=event.epoch ?? 0;
      if (this.closed||this.held||event.suppressed||epoch<this.epoch) {
        this.report({version:2,audio_event_id:event.id,epoch,phase:'dropped',frames:count,played_frames:0}); return;
      }
      if (epoch!==this.epoch) throw new Error('Playback recovery was not confirmed.');
      const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)), view=new DataView(bytes.buffer);
      const buffer=this.context.createBuffer(1,count,24000), channel=buffer.getChannelData(0);
      for (let i=0;i<count;i++) channel[i]=view.getInt16(i*2,true)/32768;
      const now=this.context.currentTime;
      // Keep a contiguous queue when at least one render quantum remains.
      // Reapplying the startup margin to each packet can insert needless gaps.
      const at=this.next-now>=128/24000 ? this.next : now+this.lead;
      if (at-this.context.currentTime>2) throw new Error('Customer playback fell behind.');
      const node=this.context.createBufferSource(); node.buffer=buffer;
      for (const [target,input] of this.destinations) node.connect(target,0,input || 0);
      const row={version:2,audio_event_id:event.id,epoch,scheduled_frame:this.frame(at),frames:count};
      const entry={node,row,at,done:false}; this.nodes.set(event.id,entry);
      node.onended=()=>this.finish(entry,'ended',count);
      node.start(at); this.next=at+buffer.duration;
      this.report({...row,phase:'scheduled',played_frames:0});
    }
    finish(entry,phase,played) {
      if (entry.done) return; entry.done=true;
      this.nodes.delete(entry.row.audio_event_id); entry.node.disconnect();
      this.report({...entry.row,phase,played_frames:played});
    }
    hold() {
      this.held=true; const now=this.context.currentTime;
      for (const entry of [...this.nodes.values()]) {
        entry.node.stop(now);
        this.finish(entry,'cancelled',Math.min(entry.row.frames,Math.max(0,Math.round((now-entry.at)*24000))));
      }
      this.next=now;
    }
    resume(epoch) {
      if (this.closed||!this.held||!Number.isSafeInteger(epoch)||epoch<=this.epoch) throw new Error('Invalid playback recovery.');
      this.epoch=epoch; this.held=false; this.next=this.context.currentTime;
    }
    close() { this.hold(); this.closed=true; }
  }
  window.LLPlaybackQueue=PlaybackQueue;
})();
