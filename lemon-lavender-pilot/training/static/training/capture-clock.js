/* Capture microphone input and rendered customer sound on the same clock. */
class CaptureClock extends AudioWorkletProcessor {
  constructor() {
    super();
    this.learner = new Float32Array(2048);
    this.conversation = new Float32Array(2048);
    this.count = 0;
    this.firstFrame = 0;
    this.stopped = false;
    this.endFrame = null;
    this.started = false;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        this.stopped = true;
        this.emit(true);
        this.port.postMessage({flushed:true,endFrame:this.endFrame});
      }
    };
  }
  emit(final=false) {
    if (!this.count) return;
    const samples = this.learner.slice(0,this.count);
    const conversation = this.conversation.slice(0,this.count);
    this.port.postMessage({samples,conversation,frame:this.firstFrame,final},[samples.buffer,conversation.buffer]);
    this.count = 0;
  }
  process(inputs,outputs) {
    if (this.stopped) return true;
    if (!this.started) {
      this.started = true;
      this.port.postMessage({started:true,frame:currentFrame});
    }
    const microphone = inputs[0]?.[0], customer = inputs[1]?.[0];
    const length = outputs[0]?.[0]?.length || 128;
    for (let index=0; index<length; index++) {
      if (!this.count) this.firstFrame = currentFrame + index;
      const input = Math.max(-1,Math.min(1,microphone?.[index] || 0));
      const output = Math.max(-1,Math.min(1,customer?.[index] || 0));
      this.learner[this.count] = input;
      this.conversation[this.count++] = (input + output) / 2;
      if (this.count === this.learner.length) this.emit();
    }
    this.endFrame = currentFrame + length;
    return true; // Outputs are silent: this capture path never doubles playback.
  }
}
registerProcessor('ll-capture-clock', CaptureClock);
