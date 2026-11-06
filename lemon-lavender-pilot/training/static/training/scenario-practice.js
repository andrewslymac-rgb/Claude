'use strict';
// Display only. The server enforces elapsed session time and response limits.
for (const clock of document.querySelectorAll('[data-deadline]')) {
  const deadline = Date.parse(clock.dataset.deadline);
  if (!Number.isFinite(deadline)) continue;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    clock.textContent = remaining ? `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining` : 'Session limit reached; saved work is preserved';
    return remaining;
  };
  tick();
  const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000);
}
