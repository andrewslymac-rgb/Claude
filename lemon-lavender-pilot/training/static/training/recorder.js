'use strict';
(() => {
  const box = document.querySelector('[data-recorder]');
  if (!box) return;
  const start = box.querySelector('[data-record]');
  const stop = box.querySelector('[data-stop]');
  const save = box.querySelector('[data-save]');
  const discard = box.querySelector('[data-discard]');
  const status = box.querySelector('[role=status]');
  const preview = box.querySelector('audio');
  let stream, context, node, source, gain, timer, blob, url;
  let chunks = [], count = 0, rate = 0, recording = false, pending = false, closed = false, saving = false;
  const say = text => { status.textContent = text; };

  function cleanup() {
    recording = false;
    clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    node?.disconnect(); source?.disconnect(); gain?.disconnect();
    context?.close().catch(() => {});
    context = null;
  }
  function clearClip() {
    blob = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
    preview.pause(); preview.removeAttribute('src'); preview.hidden = true;
    save.disabled = true; discard.disabled = true;
    chunks = []; count = 0;
  }
  function encodeWav() {
    const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
    let offset = 44;
    for (const part of chunks) for (const sample of part) {
      view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
    return new Blob([buffer], {type: 'audio/wav'});
  }
  function finish() {
    if (!recording) return;
    cleanup(); stop.disabled = true;
    if (!count) { start.disabled = false; say('No audio captured. Try again.'); return; }
    blob = encodeWav(); url = URL.createObjectURL(blob);
    preview.src = url; preview.hidden = false;
    // A new recording cannot silently erase the unsaved preview.
    start.disabled = true; save.disabled = false; discard.disabled = false;
    say('Preview ready. ' + (count / rate).toFixed(1) + ' seconds. Save it locally or discard it before recording again.');
  }
  start.addEventListener('click', async () => {
    if (recording || pending || saving || blob) return;
    pending = true; start.disabled = true;
    say('Waiting for microphone permission…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1}, video: false});
      if (closed) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new AudioContext({sampleRate: 24000}); rate = context.sampleRate;
      if (![8000, 16000, 22050, 24000, 44100, 48000].includes(rate)) throw new Error('Unsupported sample rate');
      await context.resume();
      if (closed) { cleanup(); return; }
      source = context.createMediaStreamSource(stream);
      node = context.createScriptProcessor(4096, 1, 1); gain = context.createGain(); gain.gain.value = 0;
      source.connect(node); node.connect(gain); gain.connect(context.destination); recording = true;
      stream.getTracks().forEach(track => track.addEventListener('ended', finish));
      node.onaudioprocess = event => {
        if (!recording) return;
        const data = event.inputBuffer.getChannelData(0), size = Math.min(data.length, rate * 120 - count);
        if (size > 0) { chunks.push(new Float32Array(data.slice(0, size))); count += size; }
        if (count >= rate * 120) finish();
      };
      stop.disabled = false; say('Recording locally… 0 seconds');
      timer = setInterval(() => say('Recording locally… ' + Math.floor(count / rate) + ' / 120 seconds'), 500);
    } catch (error) {
      cleanup(); start.disabled = false;
      say('Microphone could not start. Allow it in this browser, or continue with written practice.');
    } finally { pending = false; }
  });
  stop.addEventListener('click', finish);
  discard.addEventListener('click', () => {
    if (saving) return;
    clearClip(); start.disabled = false; say('Recording discarded. Nothing was saved.');
  });
  save.addEventListener('click', async () => {
    if (!blob || saving) return;
    saving = true; save.disabled = true; discard.disabled = true; start.disabled = true;
    const data = new FormData(); data.append('recording', blob, 'response.wav');
    data.append('label', box.querySelector('[name=clip_label]').value || 'Practice response');
    const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('ll_pilot_csrf='))?.split('=')[1]
      || box.querySelector('[name=csrfmiddlewaretoken]').value;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    say('Saving locally… keep this page open.');
    try {
      const response = await fetch(box.dataset.recorder, {method: 'POST', headers: {'X-CSRFToken': csrf},
        body: data, credentials: 'same-origin', signal: controller.signal});
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      if (response.redirected || response.status === 401 || response.status === 403 || (response.ok && !isJson)) {
        throw new Error('Sign-in could not be confirmed. Keep this preview, sign in again in another tab, then retry.');
      }
      if (!response.ok) {
        const message = response.status < 500 ? (await response.text()).slice(0, 250) : 'The local server could not save the clip. Keep the preview and retry.';
        throw new Error(message);
      }
      const result = await response.json();
      if (result.saved !== true || !result.recording_id) throw new Error('The server did not confirm this recording was saved. Retry with the same preview.');
      clearClip(); location.reload();
    } catch (error) {
      say('Not saved: ' + (error.name === 'AbortError' ? 'The save timed out. Keep the preview and retry; repeated uploads do not create another copy.' : error.message));
      save.disabled = false; discard.disabled = false;
      // Only explicit Save or Discard releases the existing preview.
      start.disabled = true;
    } finally { clearTimeout(timeout); saving = false; }
  });
  window.addEventListener('pagehide', () => { closed = true; cleanup(); clearClip(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      closed = false; pending = false; saving = false;
      start.disabled = false; stop.disabled = true;
      say('Ready when you are. Unsaved audio was discarded when you left; saved clips remain below.');
    }
  });
  window.addEventListener('beforeunload', event => {
    if (recording || blob) { event.preventDefault(); event.returnValue = ''; }
  });
})();
