'use strict';
const token = document.getElementById('token');
if (token && location.hash.length > 1) {
  token.value = location.hash.slice(1);
  const confirm = document.getElementById('confirm-signin');
  if (confirm && token.value.length > 10) confirm.disabled = false;
  history.replaceState(null, '', location.pathname);
}
for (const [id, zone] of [['pacific-clock', 'America/Los_Angeles'], ['manila-clock', 'Asia/Manila']]) {
  const el = document.getElementById(id);
  if (el) el.textContent = new Intl.DateTimeFormat('en-US', {timeZone: zone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'}).format(new Date());
}

// Contextual navigation, with no inactive or imaginary destinations.
const route = location.pathname;
let section = 'learn';
if (/\/practice\/?$|\/scenarios\/?$|\/live\/?$|^\/attempt\/|^\/live\/|\/follow-up\//.test(route)) section = 'practice';
if (/\/coaching\/?$|\/practice-report\/?$/.test(route)) section = 'coaching';
if (/\/services\/?$/.test(route)) section = 'reference';
if (route === '/' || route.startsWith('/sign-in') || route.startsWith('/magic')) section = 'desk';
if (route.startsWith('/costs')) section = 'costs';
document.querySelector(`[data-nav="${section}"]`)?.setAttribute('aria-current', 'page');

for (const button of document.querySelectorAll('[data-demo-email]')) {
  button.addEventListener('click', () => {
    const email = document.querySelector('[name=email]');
    if (email) {email.value = button.dataset.demoEmail; email.focus();}
  });
}

// Evidence links reveal their folded transcript before scrolling.
function revealTarget() {
  let id;
  try {id = decodeURIComponent(location.hash.slice(1));} catch (_) {return;}
  const target = document.getElementById(id);
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  let parent = target.parentElement;
  while (parent) {if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement;}
  requestAnimationFrame(() => target.scrollIntoView({block:'start'}));
}
addEventListener('hashchange', revealTarget);
if (location.hash) revealTarget();

// Native form navigation retains the clicked action; no disabling named buttons.
for (const form of document.querySelectorAll('form[method=post]:not(#live-notes)')) {
  form.addEventListener('submit', event => {
    if (event.defaultPrevented) return;
    if (form.dataset.pending === 'true') {event.preventDefault(); return;}
    form.dataset.pending = 'true'; form.setAttribute('aria-busy', 'true');
    form.classList.add('form-pending');
    let status = form.querySelector('.form-submit-status');
    if (!status) {status = document.createElement('p'); status.className = 'form-submit-status'; status.setAttribute('role', 'status'); form.append(status);}
    status.textContent = 'Saving…';
    // A navigation failure must leave an explicit retry available.
    setTimeout(() => {form.dataset.pending = 'false'; form.removeAttribute('aria-busy'); form.classList.remove('form-pending'); status.textContent = 'Still waiting? Check your connection and try again.';}, 10000);
  });
}
addEventListener('pageshow', () => {
  for (const form of document.querySelectorAll('[data-pending]')) {
    form.dataset.pending = 'false'; form.removeAttribute('aria-busy'); form.classList.remove('form-pending');
    form.querySelector('.form-submit-status')?.remove();
  }
});

// Keep resource navigation discoverable when one of its pages is open.
const activeResource = document.querySelector('.nav-resources [aria-current="page"]');
if (activeResource) activeResource.closest('details').open = true;

// A changed checked response must be checked or saved before advancing.
const answerForm = document.querySelector('.check-form');
if (answerForm) {
  const nextForm = document.querySelector('.next-step-form');
  const original = new URLSearchParams(new FormData(answerForm)).toString();
  let dirty = false;
  const updateDraft = () => {
    dirty = new URLSearchParams(new FormData(answerForm)).toString() !== original;
    if (nextForm) nextForm.hidden = dirty;
  };
  answerForm.addEventListener('input', updateDraft);
  answerForm.addEventListener('change', updateDraft);
  answerForm.addEventListener('submit', () => {dirty = false;});
  addEventListener('beforeunload', event => {
    if (dirty) {event.preventDefault();event.returnValue = '';}
  });
}
