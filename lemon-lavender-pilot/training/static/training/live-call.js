(() => {
  'use strict';
  const panel = document.querySelector('#live-call');
  if (!panel) return;
  const status = document.querySelector('#live-status');
  const start = document.querySelector('#live-start');
  if (!start) return; // Staff can read evidence but cannot control a learner call.
  const stopButton = document.querySelector('#live-stop');
  const notes = document.querySelector('#live-notes');
  const micCheck = document.querySelector('#mic-check'), micCheckStop = document.querySelector('#mic-check-stop');
  const micLabel = document.querySelector('#mic-check-status'), micIndicator = document.querySelector('#microphone-indicator');
  let micReady = false, checkGeneration = 0, checkStream, checkContext, requestedStart = false;
  let id = panel.dataset.attempt || null, running = false, stopping = false;
  let context, source, processor, mute, media, fixture, pollTimer, callTimer;
  let sequence = 0, cursor = 0, queued = 0, sendChain = Promise.resolve();
  let playbackStart = 0, endFrame = null, playbackQueue, controlSequence = 0;
  const interruptButton=document.querySelector('#live-interrupt'), resumeButton=document.querySelector('#live-resume');
  const playbackRequests = new Set();
  const pendingPlayback = [];
  let recordingFlush = Promise.resolve(), flushResolve, flushRequested = false, captureComplete = false;
  const csrf = () => decodeURIComponent(document.cookie.split('; ').find(x => x.startsWith('ll_pilot_csrf='))?.split('=').slice(1).join('=') || '');
  function clearMicCheck() {
    checkGeneration++;
    checkStream?.getTracks().forEach(track => track.stop()); checkStream = null;
    if (checkContext && checkContext.state !== 'closed') checkContext.close(); checkContext = null;
    if (micCheckStop) micCheckStop.disabled = true;
    if (micIndicator) micIndicator.textContent = 'Microphone off.';
  }
  micCheckStop?.addEventListener('click', () => {
    clearMicCheck(); micReady = false; start.disabled = true; micCheck.disabled = false;
    micLabel.textContent = 'Microphone check stopped. No API call was made.';
  });
  micCheck?.addEventListener('click', async () => {
    if (!document.querySelector('#live-consent').checked) {micLabel.textContent = 'Read and accept the recording/data notice first.'; return;}
    clearMicCheck(); const generation = checkGeneration;
    micReady = false; start.disabled = true; micCheck.disabled = true; micCheckStop.disabled = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if (generation !== checkGeneration) {stream.getTracks().forEach(track => track.stop()); return;}
      checkStream = stream; checkContext = new AudioContext({sampleRate:24000}); await checkContext.resume();
      const analyser = checkContext.createAnalyser(); analyser.fftSize = 1024;
      checkContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      micIndicator.textContent = 'Microphone on — local check only; nothing is sent or saved.';
      micLabel.textContent = 'Say a fictional greeting now. Checking sound for three seconds…';
      let audible = 0;
      for (let step=0; step<30 && generation===checkGeneration; step++) {
        analyser.getFloatTimeDomainData(samples);
        if (samples.some(value => Math.abs(value) > .012)) audible++;
        await new Promise(resolve => setTimeout(resolve,100));
      }
      if (generation !== checkGeneration) return;
      micReady = audible >= 3;
      micLabel.textContent = micReady ? 'Sound detected. Microphone is off again. Click Start call when ready.' : 'No clear sound detected. Check your microphone and try this free local check again.';
      start.disabled = !micReady;
    } catch (_) {
      if (generation === checkGeneration) micLabel.textContent = 'Microphone access was denied or unavailable. No API call was made. Allow it in your browser/macOS settings and try the local check again.';
    } finally {
      if (generation === checkGeneration) {clearMicCheck(); micCheck.disabled = false;}
    }
  });
  async function request(url, body, timeout = 8000) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeout);
    try {
      const response = await fetch(url, {method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : {'X-CSRFToken': csrf(), ...(body instanceof FormData ? {} : {'Content-Type': 'application/json'})},
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        credentials: 'same-origin', signal: abort.signal});
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign-in or connection expired. The server will close the call; saved evidence remains.');
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'The request was not confirmed.');
      return data;
    } finally { clearTimeout(timer); }
  }
  function release() {
    if (running && endFrame === null) endFrame = Math.max(0, Math.round((context.currentTime - playbackStart) * 24000));
    running = false;
    clearTimeout(callTimer);
    if (processor && !flushRequested) {
      flushRequested = true;
      recordingFlush = new Promise(resolve => {
        let finished = false;
        const finish = complete => {
          if (finished) return; finished = true; captureComplete = complete;
          processor.port.onmessage = null; processor.disconnect();
          if (context && context.state !== 'closed') context.close();
          resolve();
        };
        flushResolve = frame => {
          if (Number.isSafeInteger(frame)) endFrame=frame-Math.round(playbackStart*24000);
          finish(Number.isSafeInteger(endFrame) && endFrame>=0);
        };
        processor.port.postMessage('flush');
        setTimeout(() => finish(false), 500);
      });
    }
    if (source) {try {source.stop?.(); source.disconnect();} catch (_) {}}
    if (mute) mute.disconnect();
    media?.getTracks().forEach(track => track.stop());
    if (micIndicator) micIndicator.textContent = 'Microphone off.';
    playbackQueue?.close();
    if (interruptButton) interruptButton.disabled=true;
    if (resumeButton) resumeButton.disabled=true;
    if (!processor && context && context.state !== 'closed') context.close();
    if (notes) document.querySelector('#live-notes-save').disabled = true;
  }
  async function end(reason) {
    if (stopping) return;
    stopping = true;
    release();
    if (stopButton) stopButton.disabled = true;
    status.textContent = reason || 'Closing the voice connection and preparing the report…';
    if (id) {
      try {await recordingFlush; await Promise.allSettled([sendChain, ...playbackRequests]); await request(`/live/${id}/stop/`, endFrame === null ? {} : {end_frame: endFrame, capture_complete: captureComplete});} catch (_) {status.textContent += ' Close acknowledgment unavailable; server disconnect cutoff remains active.';}
    }
  }
  function encode(samples) {
    const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
    let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value);
  }
  function capture() {
    processor = new AudioWorkletNode(context, 'll-capture-clock', {numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[1]});
    mute = context.createGain(); mute.gain.value = 0;
    source.connect(processor); processor.connect(mute); mute.connect(context.destination);
    processor.port.onmessage = event => {
      if (event.data.started) {
        // Anchor zero to actual render capture, before any customer playback.
        playbackStart = event.data.frame / 24000;
        if (stopping) return;
        playbackQueue=new LLPlaybackQueue(context,event.data.frame,[[context.destination,0],[processor,1]],savePlayback);
        for (const item of pendingPlayback.splice(0)) play(item);
        if (interruptButton) interruptButton.disabled=false;
        return;
      }
      if (event.data.flushed) {flushResolve?.(event.data.endFrame); return;}
      if (!running && !flushRequested) return;
      if (captureComplete) return;
      if (queued >= 8) {end('Input could not keep up. Closing to preserve reliable evidence.'); return;}
      const pcm = encode(event.data.samples), reviewPcm = encode(event.data.conversation), sentSequence = sequence++;
      const startFrame = event.data.frame - Math.round(playbackStart * 24000);
      queued++;
      sendChain = sendChain.then(() => request(`/live/${id}/input/`, {pcm, review_pcm: reviewPcm, sequence: sentSequence, start_frame: startFrame}))
        .catch(() => {end('Audio delivery failed. Closing; no automatic retry.');}).finally(() => queued--);
    };
    source.start?.();
  }
  function savePlayback(row) {
    const saved=request(`/live/${id}/playback/`,row)
      .catch(()=>end('Playback evidence could not be saved. Closing the call.'))
      .finally(()=>playbackRequests.delete(saved));
    playbackRequests.add(saved);
  }
  function play(event) {
    if (!context || context.state!=='running' || stopping) return;
    if (!playbackQueue) {
      if (pendingPlayback.length >= 24) {end('Recording did not initialize in time. Closing to preserve evidence.'); return;}
      pendingPlayback.push(event); return;
    }
    try {playbackQueue.push(event);} catch (error) {end(error.message);}
  }
  async function playbackControl(action) {
    if (!running || stopping) return;
    interruptButton.disabled=true; resumeButton.disabled=true;
    if (action==='interrupt') playbackQueue.hold();
    const frame=Math.max(0,Math.round((context.currentTime-playbackStart)*24000));
    try {
      const data=await request(`/live/${id}/control/`,{action,sequence:controlSequence,frame});
      controlSequence++;
      if (action==='resume') {
        playbackQueue.resume(data.epoch); interruptButton.disabled=false;
        status.textContent='Customer playback enabled. Interrupted audio will not be replayed.';
      } else {
        resumeButton.disabled=false;
        status.textContent='Customer playback held. Speak your point, then let the customer respond. Recording and connection time continue.';
      }
    } catch (error) {
      if (action==='interrupt') {await end('Interruption acknowledgment unavailable. Closing without automatic retry.');}
      else {resumeButton.disabled=false;status.textContent=error.message+' Playback stays held.';}
    }
  }
  interruptButton?.addEventListener('click',()=>playbackControl('interrupt'));
  resumeButton?.addEventListener('click',()=>playbackControl('resume'));
  async function poll() {
    if (!id) return;
    try {
      const data = await request(`/live/${id}/events/?after=${cursor}`);
      for (const event of data.events) {
        cursor = event.id;
        if (event.kind === 'ready' && !stopping) {
          running = true; playbackStart = context.currentTime;
          status.textContent = 'Call connected. The AI customer is listening and speaking.';
          if (panel.dataset.mode === 'microphone') micIndicator.textContent = 'Recording and sending your practice audio to OpenAI. End call stops the microphone.';
          capture();
          stopButton.disabled = false;
          if (notes) document.querySelector('#live-notes-save').disabled = false;
          callTimer = setTimeout(() => end('Time limit reached. Preparing coaching…'), Number(panel.dataset.limit) * 1000);
        } else if (event.kind === 'audio') play(event);
        else if (event.kind === 'transcript') {
          const line = document.createElement('p'); line.textContent = `${event.fragment.speaker}: ${event.fragment.text}`;
          document.querySelector('#live-captions').append(line);
        } else if (event.kind === 'closing') {
          release(); stopping = true; stopButton.disabled = true;
          recordingFlush.then(() => sendChain).then(() => request(`/live/${id}/stop/`, endFrame === null ? {} : {end_frame: endFrame, capture_complete: captureComplete})).catch(() => {});
          status.textContent = 'Call closing: ' + event.reason + '. Saving evidence and coaching…';
        }
      }
      if (data.state === 'closed' || data.state === 'failed') {
        release(); location.assign(`/live/${id}/`); return;
      }
      pollTimer = setTimeout(poll, 100);
    } catch (error) {await end(error.message); status.textContent += ' Reload the call page after it finishes saving.';}
  }
  start?.addEventListener('click', async () => {
    if (!document.querySelector('#live-consent').checked) {status.textContent = 'Confirm fictional-audio processing and local recording first.'; return;}
    start.disabled = true;
    if (!requestedStart && !id) stopping = false;
    if (panel.dataset.mode === 'microphone' && !micReady) {status.textContent = 'Complete the local microphone check first. No call was started.'; return;}
    if (micCheck) micCheck.disabled = true;
    stopButton.disabled = false;
    try {
      context = new AudioContext({sampleRate: 24000}); await context.resume();
      if (context.sampleRate !== 24000) throw new Error('This device did not provide the tested audio sample rate. No call was started.');
      await context.audioWorklet.addModule('/static/training/capture-clock.js');
      if (panel.dataset.mode === 'synthetic') {
        const response = await fetch('/live-fixture/', {credentials: 'same-origin'});
        if (!response.ok) throw new Error('The fictional test audio is unavailable. No call was started.');
        fixture = await context.decodeAudioData(await response.arrayBuffer());
        const samples = fixture.getChannelData(0);
        for (const [index, from] of [5, 20, 33, 52, 73, 93].entries()) {
          const until = [20, 33, 52, 73, 93, 112][index];
          let audible = 0;
          for (let i = from * fixture.sampleRate; i < Math.min(until * fixture.sampleRate, samples.length); i++) {
            if (Math.abs(samples[i]) > 256 / 32768) audible++;
          }
          if (audible < fixture.sampleRate / 10) throw new Error('The fictional test speech is silent or incomplete. No paid call was started.');
        }
        source = context.createBufferSource(); source.buffer = fixture;
        source.onended = () => end('Fictional test audio finished. Preparing coaching…');
      } else {
        // Reached only from a deliberate Start click in the separately armed mode.
        media = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: false});
        if (stopping) {release(); return;}
        source = context.createMediaStreamSource(media);
        media.getAudioTracks().forEach(track => track.addEventListener('ended', () => end('Microphone access ended. Closing the call.')));
        micIndicator.textContent = 'Microphone on — connecting. Recording and upload begin when connected.';
      }
      if (stopping) {release(); return;}
      requestedStart = true;
      const data = await request(`/course/${panel.dataset.assignment}/live/start/`, {consent: true, input_mode: panel.dataset.mode, mic_check_passed: micReady, persona_id:panel.dataset.persona || '', difficulty:panel.dataset.difficulty || 'beginner'});
      id = data.attempt_id; panel.dataset.attempt = id;
      if (stopping) {await request(`/live/${id}/stop/`, {}); return;}
      history.replaceState(null, '', `/live/${id}/`);
      if (data.duplicate) throw new Error('A call already exists. Reload to review it; another connection was not started.');
      status.textContent = 'Connecting to the AI customer…'; poll();
    } catch (error) {release(); stopButton.disabled = true; status.textContent = error.message;
      if (micCheck && !requestedStart) {micReady = false; micCheck.disabled = false;}
    }
  });
  stopButton?.addEventListener('click', () => end());
  notes?.addEventListener('submit', async event => {
    event.preventDefault(); const label = document.querySelector('#live-notes-status');
    if (!id) return;
    try {
      const data = await request(`/live/${id}/notes/`, new FormData(notes));
      notes.elements.revision.value = data.revision; label.textContent = 'Handoff notes saved.';
    } catch (error) {label.textContent = error.message;}
  });
  addEventListener('pagehide', () => {
    clearMicCheck();
    release(); clearTimeout(pollTimer);
    if (id && !stopping) fetch(`/live/${id}/stop/`, {method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: {'X-CSRFToken': csrf(), 'Content-Type': 'application/json'}, body: JSON.stringify(endFrame === null ? {} : {end_frame: endFrame})}).catch(() => {});
  });
  if (id) {status.textContent = 'This page was reloaded; the previous audio connection cannot resume. Closing it and preserving its evidence.'; end().then(poll);}
})();
