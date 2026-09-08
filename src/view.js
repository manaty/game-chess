import { createChessView } from '../public/chess-ui.js';
const app = document.querySelector('#app');
let role, view, state;
const pending = new Map(); let sequence = 0;
const tell = (type, value = {}) => parent.postMessage({ retroMuseum: 1, type, ...value }, '*');
const notice = text => { const el = document.querySelector('#notice'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500); };
const send = (action, value) => new Promise((resolve, reject) => {
  const id = String(++sequence);
  const timeout = setTimeout(() => { pending.delete(id); reject(Error('Connection interrupted')); }, 7000);
  pending.set(id, { resolve, reject, timeout });
  tell('action', { id, action, value });
});
const toggleFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
addEventListener('message', event => {
  if (event.source !== parent || event.data?.retroMuseum !== 1) return;
  const m = event.data;
  if (m.type === 'ack' || m.type === 'error') {
    const wait = pending.get(m.id);
    if (wait) { clearTimeout(wait.timeout); pending.delete(m.id); m.type === 'ack' ? wait.resolve() : wait.reject(Object.assign(Error(m.message), { code: m.code })); }
    return;
  }
  if (m.type === 'suspend') { window.dispatchEvent(new Event('blur')); return; }
  if (m.type !== 'state') return;
  role = m.role;
  state = { ...m.state, party: { ...m.state.party, chess: m.state.party.community } };
  if (!view) view = createChessView(app, role, { send, notice });
  view.update(state, m.online);
  if (m.renderId) tell('rendered', { renderId: m.renderId });
});
app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-fullscreen')) { toggleFullscreen(); return; }
  if (button.dataset.action) send(button.dataset.action).catch(error => notice(error.message));
});
tell('ready', { renderAck: true });
