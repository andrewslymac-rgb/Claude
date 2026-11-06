// Prevent simultaneous playback when reviewing the mix and original evidence.
document.addEventListener('play', event => {
  if (!(event.target instanceof HTMLAudioElement)) return;
  document.querySelectorAll('audio').forEach(player => {
    if (player !== event.target) player.pause();
  });
}, true);

// Only explicitly saved human anchors on the actual render recording are seekable.
(() => {
  const player=document.querySelector('#full-call-audio');
  if (!player) return;
  const turns=[...document.querySelectorAll('[data-audio-start][data-audio-end]')];
  function highlight() {
    for (const turn of turns) {
      const active=player.currentTime>=Number(turn.dataset.audioStart)&&player.currentTime<Number(turn.dataset.audioEnd);
      turn.classList.toggle('audio-current',active);
      if (active) turn.setAttribute('aria-current','true'); else turn.removeAttribute('aria-current');
    }
  }
  for (const button of document.querySelectorAll('.transcript-seek')) {
    button.addEventListener('click',()=>{
      const seconds=Number(button.dataset.seek);
      if (!Number.isFinite(seconds)||seconds<0||seconds>=player.duration) return;
      player.currentTime=seconds; highlight(); player.play().catch(()=>{});
    });
  }
  for (const button of document.querySelectorAll('[data-mark-audio]')) {
    button.addEventListener('click',()=>{
      const field=document.querySelector(`#transcript-alignment [name="${button.dataset.markAudio}"]`);
      if (field) field.value=player.currentTime.toFixed(3);
    });
  }
  player.addEventListener('timeupdate',highlight);player.addEventListener('seeked',highlight);
})();
