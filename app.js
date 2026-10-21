'use strict';

// ---------- Models ----------

const MODELS = {
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: '__custom', label: 'Custom…' },
  ],
  openai: [
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
    { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    { id: '__custom', label: 'Custom…' },
  ],
};

// Models that accept the server-side refusal fallback ("default" form).
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/;

const DEFAULT_SIDE = {
  A: { name: 'Claude', provider: 'anthropic', model: 'claude-opus-5-5', maxTokens: 16000 },
  B: { name: 'GPT', provider: 'openai', model: 'gpt-6-astra', maxTokens: 16000 },
};

const SIDE_FIELDS = ['name', 'provider', 'model', 'customModel', 'system', 'maxTokens',
  'aThinking', 'aEffort', 'aFallback', 'oEffort', 'oSummary', 'oVerbosity'];

const LS_SETTINGS = 'arivali.settings';
const LS_KEYS = 'arivali.keys';
const LS_RUNS = 'arivali.runs';

// ---------- Small helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const other = (side) => (side === 'A' ? 'B' : 'A');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('localStorage write failed', e);
    return false;
  }
}
function lsDel(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMarkdown(el, text) {
  if (window.marked && window.DOMPurify) {
    el.classList.remove('plain');
    el.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } else {
    el.classList.add('plain');
    el.textContent = text;
  }
}

// ---------- Settings UI ----------

function buildSideCards() {
  const tpl = $('#sideTemplate');
  document.querySelectorAll('.side-card').forEach((card) => {
    const side = card.dataset.side;
    card.appendChild(tpl.content.cloneNode(true));
    $('.side-title', card).textContent = `Side ${side}`;
    const provSel = $('[data-k=provider]', card);
    const modelSel = $('[data-k=model]', card);
    provSel.addEventListener('change', () => {
      fillModels(card, provSel.value);
      syncSideVisibility(card);
      saveSettings();
    });
    modelSel.addEventListener('change', () => { syncSideVisibility(card); saveSettings(); });
  });
}

function fillModels(card, provider, selected) {
  const sel = $('[data-k=model]', card);
  sel.innerHTML = MODELS[provider].map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  if (selected) sel.value = selected;
  if (!sel.value) sel.selectedIndex = 0;
}

function syncSideVisibility(card) {
  const provider = $('[data-k=provider]', card).value;
  card.querySelectorAll('.prov').forEach((f) => f.classList.toggle('hidden', !f.classList.contains(provider)));
  $('.custom-model', card).classList.toggle('hidden', $('[data-k=model]', card).value !== '__custom');
}

function readSide(side) {
  const card = $(`.side-card[data-side=${side}]`);
  const out = {};
  for (const k of SIDE_FIELDS) {
    const el = $(`[data-k=${k}]`, card);
    out[k] = el.type === 'checkbox' ? el.checked : el.value;
  }
  out.maxTokens = parseInt(out.maxTokens, 10) || 16000;
  out.modelId = out.model === '__custom' ? out.customModel.trim() : out.model;
  return out;
}

function writeSide(side, s) {
  const card = $(`.side-card[data-side=${side}]`);
  const merged = {
    name: '', system: '', customModel: '', maxTokens: 16000,
    aThinking: 'summarized', aEffort: 'high', aFallback: true,
    oEffort: 'medium', oSummary: 'auto', oVerbosity: '',
    ...DEFAULT_SIDE[side], ...s,
  };
  $('[data-k=provider]', card).value = merged.provider;
  fillModels(card, merged.provider, merged.model);
  for (const k of SIDE_FIELDS) {
    if (k === 'provider' || k === 'model') continue;
    const el = $(`[data-k=${k}]`, card);
    if (el.type === 'checkbox') el.checked = !!merged[k];
    else el.value = merged[k] ?? '';
  }
  syncSideVisibility(card);
}

function readSettings() {
  return {
    title: $('#runTitle').value.trim(),
    starter: $('#starter').value,
    startSide: $('#startSide').value,
    maxTurns: Math.max(1, parseInt($('#maxTurns').value, 10) || 10),
    delayMs: Math.max(0, parseInt($('#delayMs').value, 10) || 0),
    A: readSide('A'),
    B: readSide('B'),
  };
}

function writeSettings(s) {
  $('#runTitle').value = s.title || '';
  $('#starter').value = s.starter || '';
  $('#startSide').value = s.startSide || 'A';
  $('#maxTurns').value = s.maxTurns || 10;
  $('#delayMs').value = s.delayMs ?? 500;
  writeSide('A', s.A || {});
  writeSide('B', s.B || {});
}

function readKeys() {
  return { anthropic: $('#anthropicKey').value.trim(), openai: $('#openaiKey').value.trim() };
}

function saveSettings() {
  lsSet(LS_SETTINGS, readSettings());
  if ($('#rememberKeys').checked) lsSet(LS_KEYS, readKeys());
  else lsDel(LS_KEYS);
}

function loadSettings() {
  writeSettings(lsGet(LS_SETTINGS, {}));
  const keys = lsGet(LS_KEYS, null);
  $('#rememberKeys').checked = keys !== null || !localStorage.getItem(LS_SETTINGS);
  if (keys) {
    $('#anthropicKey').value = keys.anthropic || '';
    $('#openaiKey').value = keys.openai || '';
  }
}

// ---------- Runs (local storage) ----------

let runs = lsGet(LS_RUNS, []);
let run = null; // the run shown in the transcript

function persistRuns() {
  // Keep the newest runs if storage is full.
  while (!lsSet(LS_RUNS, runs) && runs.length > 1) runs.pop();
  renderRunList();
}

function saveRun() {
  if (!run) return;
  run.updatedAt = Date.now();
  const i = runs.findIndex((r) => r.id === run.id);
  if (i >= 0) runs[i] = run;
  else runs.unshift(run);
  runs.sort((a, b) => b.updatedAt - a.updatedAt);
  persistRuns();
}

function newRun(settings) {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: settings.title || `${settings.A.name || 'A'} × ${settings.B.name || 'B'}`,
    settings: JSON.parse(JSON.stringify(settings)),
    messages: [{ side: 'starter', to: settings.startSide, text: settings.starter }],
    status: 'paused',
  };
}

function renderRunList() {
  const ul = $('#runList');
  ul.innerHTML = '';
  if (!runs.length) {
    ul.innerHTML = '<li class="run-meta">No saved runs yet.</li>';
    return;
  }
  for (const r of runs) {
    const li = document.createElement('li');
    if (run && r.id === run.id) li.className = 'active';
    const replies = r.messages.filter((m) => m.side !== 'starter').length;
    li.innerHTML = `<button class="del" title="Delete">✕</button>
      <span class="run-title">${escapeHtml(r.title)}</span>
      <span class="run-meta">${new Date(r.createdAt).toLocaleString()} · ${replies} replies · ${r.status}</span>`;
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) {
        e.stopPropagation();
        if (!confirm(`Delete "${r.title}"?`)) return;
        runs = runs.filter((x) => x.id !== r.id);
        if (run && run.id === r.id) { if (busy) pause(); run = null; renderTranscript(); }
        persistRuns();
        return;
      }
      if (busy) return;
      run = r;
      writeSettings(r.settings);
      saveSettings();
      renderTranscript();
      renderRunList();
      updateButtons();
    });
    ul.appendChild(li);
  }
}

// ---------- Transcript rendering ----------

function sideLabel(side, settings) {
  const s = settings[side];
  return `${s.name || 'Side ' + side} · ${s.modelId}`;
}

function messageEl(msg, settings) {
  const div = document.createElement('div');
  if (msg.side === 'starter') {
    div.className = 'msg starter';
    div.innerHTML = `<div class="msg-head"><span class="who">Starter prompt → Side ${msg.to}</span></div><div class="body"></div>`;
    renderMarkdown($('.body', div), msg.text || '');
    return div;
  }
  div.className = `msg ${msg.side}`;
  div.innerHTML = `<div class="msg-head"><span class="who"></span><span class="meta"></span></div>
    <details class="thinking hidden"><summary>Thinking</summary><div class="think-body"></div></details>
    <div class="body"></div>`;
  $('.who', div).textContent = `${msg.name || 'Side ' + msg.side} · ${msg.model}`;
  setMeta(div, msg);
  if (msg.thinking) {
    $('details', div).classList.remove('hidden');
    $('.think-body', div).textContent = msg.thinking;
  }
  renderMarkdown($('.body', div), msg.text || '');
  return div;
}

function setMeta(div, msg) {
  const parts = [`Side ${msg.side}`];
  if (msg.usage) parts.push(`${msg.usage.output ?? '?'} out tok`);
  if (msg.stopReason && !['end_turn', 'completed'].includes(msg.stopReason)) parts.push(msg.stopReason);
  $('.meta', div).textContent = parts.join(' · ');
}

function renderTranscript() {
  const main = $('#transcript');
  main.innerHTML = '';
  if (!run) {
    main.innerHTML = `<div class="empty"><p>Open settings (☰), pick a model for each side, paste your keys and a starter prompt, then press <b>Start</b>.</p></div>`;
    return;
  }
  for (const m of run.messages) main.appendChild(messageEl(m, run.settings));
}

function notice(text) {
  const div = document.createElement('div');
  div.className = 'msg notice';
  div.textContent = text;
  $('#transcript').appendChild(div);
  scrollToBottom(true);
}

function scrollToBottom(force) {
  const main = $('#transcript');
  const near = main.scrollHeight - main.scrollTop - main.clientHeight < 160;
  if (force || near) main.scrollTop = main.scrollHeight;
}

// ---------- SSE parsing ----------

async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message';
      const data = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) continue;
      const raw = data.join('\n');
      if (raw === '[DONE]') return;
      try {
        yield { event, data: JSON.parse(raw) };
      } catch {
        /* skip non-JSON keepalives */
      }
    }
  }
}

async function httpError(res) {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    msg += ': ' + (j.error?.message || JSON.stringify(j));
  } catch { /* ignore */ }
  return new Error(msg);
}

// ---------- Conversation history per side ----------

// From `side`'s point of view, its own replies are "assistant" and everything
// the other side said (plus the starter, if addressed to it) is "user".
function historyFor(side) {
  const out = [];
  for (const m of run.messages) {
    if (m.side === 'starter') {
      if (m.to === side) out.push({ role: 'user', text: m.text });
    } else if (m.side === side) {
      out.push({ role: 'assistant', text: m.text, blocks: m.blocks, provider: m.provider });
    } else {
      out.push({ role: 'user', text: m.text });
    }
  }
  return out;
}

// ---------- Anthropic ----------

function anthropicThinking(cfg) {
  const model = cfg.modelId;
  if (cfg.aThinking === 'summarized') return { type: 'adaptive', display: 'summarized' };
  if (cfg.aThinking === 'omitted') return { type: 'adaptive', display: 'omitted' };
  // "off": each model family has its own rule.
  if (/sonnet-5-5/.test(model)) return { type: 'between_tools' };
  if (/opus-5-5|fable/.test(model)) return { type: 'adaptive', display: 'omitted' };
  return { type: 'disabled' };
}

async function callAnthropic(cfg, history, key, signal, ui) {
  const thinking = anthropicThinking(cfg);
  let effort = cfg.aEffort;
  if ((thinking.type === 'between_tools' || thinking.type === 'disabled') && ['xhigh', 'max'].includes(effort)) {
    effort = 'high';
  }
  const messages = history.map((h) => {
    if (h.role === 'assistant' && h.provider === 'anthropic' && h.blocks?.length) {
      return { role: 'assistant', content: h.blocks };
    }
    return { role: h.role, content: h.text || '(empty)' };
  });
  const body = {
    model: cfg.modelId,
    max_tokens: cfg.maxTokens,
    stream: true,
    messages,
    thinking,
    output_config: { effort },
  };
  if (cfg.system.trim()) body.system = cfg.system;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (cfg.aFallback && FALLBACK_MODELS.test(cfg.modelId)) {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw await httpError(res);

  const blocks = [];
  const result = { text: '', thinking: '', blocks, stopReason: null, usage: {} };
  for await (const { data } of readSSE(res)) {
    switch (data.type) {
      case 'message_start':
        result.usage.input = data.message?.usage?.input_tokens;
        if (data.message?.model) result.servedModel = data.message.model;
        break;
      case 'content_block_start': {
        const b = { ...data.content_block };
        if (b.type === 'thinking') { b.thinking = b.thinking || ''; b.signature = b.signature || ''; }
        if (b.type === 'text') b.text = b.text || '';
        blocks[data.index] = b;
        if (b.type === 'thinking' && result.thinking) ui.thinking((result.thinking += '\n\n'));
        break;
      }
      case 'content_block_delta': {
        const b = blocks[data.index];
        const d = data.delta;
        if (d.type === 'thinking_delta') {
          b.thinking += d.thinking;
          ui.thinking((result.thinking += d.thinking));
        } else if (d.type === 'signature_delta') {
          b.signature += d.signature;
        } else if (d.type === 'text_delta') {
          b.text += d.text;
          ui.text((result.text += d.text));
        }
        break;
      }
      case 'message_delta':
        if (data.delta?.stop_reason) result.stopReason = data.delta.stop_reason;
        if (data.usage?.output_tokens != null) result.usage.output = data.usage.output_tokens;
        break;
      case 'error':
        throw new Error(data.error?.message || 'Stream error');
    }
  }
  // Empty text blocks are rejected when replayed.
  result.blocks = blocks.filter((b) => b && !(b.type === 'text' && !b.text));
  return result;
}

// ---------- OpenAI (Responses API) ----------

async function callOpenAI(cfg, history, key, signal, ui) {
  const body = {
    model: cfg.modelId,
    stream: true,
    store: false,
    max_output_tokens: cfg.maxTokens,
    input: history.map((h) => ({ role: h.role, content: h.text || '(empty)' })),
  };
  if (cfg.system.trim()) body.instructions = cfg.system;
  const reasoning = {};
  if (cfg.oEffort) reasoning.effort = cfg.oEffort;
  if (cfg.oSummary !== 'off' && cfg.oEffort !== 'none') reasoning.summary = cfg.oSummary;
  if (Object.keys(reasoning).length) body.reasoning = reasoning;
  if (cfg.oVerbosity) body.text = { verbosity: cfg.oVerbosity };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await httpError(res);

  const result = { text: '', thinking: '', stopReason: null, usage: {} };
  for await (const { data } of readSSE(res)) {
    switch (data.type) {
      case 'response.reasoning_summary_part.added':
        if (result.thinking) ui.thinking((result.thinking += '\n\n'));
        break;
      case 'response.reasoning_summary_text.delta':
        ui.thinking((result.thinking += data.delta));
        break;
      case 'response.output_text.delta':
        ui.text((result.text += data.delta));
        break;
      case 'response.completed':
      case 'response.incomplete': {
        const r = data.response || {};
        result.stopReason = r.status === 'incomplete'
          ? `incomplete: ${r.incomplete_details?.reason || 'unknown'}`
          : 'completed';
        result.usage = { input: r.usage?.input_tokens, output: r.usage?.output_tokens };
        break;
      }
      case 'response.failed':
        throw new Error(data.response?.error?.message || 'Response failed');
      case 'error':
        throw new Error(data.message || data.error?.message || 'Stream error');
    }
  }
  return result;
}

// ---------- Run loop ----------

let busy = false;
let controller = null;

function setStatus(text, cls = 'idle') {
  const el = $('#status');
  el.textContent = text;
  el.className = `status ${cls}`;
}

// A run can be continued if it has replies and hasn't reached the (possibly raised) reply limit.
function canResume() {
  if (!run || run.messages.length < 2) return false;
  const replies = run.messages.filter((m) => m.side !== 'starter').length;
  return replies < readSettings().maxTurns;
}

function updateButtons() {
  $('#startBtn').textContent = canResume() ? 'Resume' : 'Start';
  $('#startBtn').disabled = busy;
  $('#pauseBtn').disabled = !busy;
  $('#clearBtn').disabled = busy;
  $('#downloadBtn').disabled = !run;
}

function validate(settings, keys) {
  for (const side of ['A', 'B']) {
    const s = settings[side];
    if (!s.modelId) return `Side ${side}: pick a model or enter a custom model ID.`;
    if (!keys[s.provider]) return `Side ${side}: add your ${s.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key.`;
  }
  if (!settings.starter.trim()) return 'Add a starter prompt.';
  return null;
}

async function start() {
  saveSettings();
  const settings = readSettings();
  const keys = readKeys();
  const err = validate(settings, keys);
  if (err) { alert(err); return; }

  const resuming = canResume();
  if (resuming) {
    // Pick up edited settings (models, prompts, thinking) but keep the transcript.
    run.settings = { ...JSON.parse(JSON.stringify(settings)), starter: run.settings.starter, startSide: run.settings.startSide };
    renderTranscript();
    run.title = settings.title || run.title;
  } else {
    run = newRun(settings);
    renderTranscript();
  }
  run.status = 'running';
  saveRun();
  busy = true;
  updateButtons();

  try {
    await loop(keys);
  } finally {
    busy = false;
    controller = null;
    if (run.status === 'running') run.status = 'paused';
    saveRun();
    updateButtons();
  }
}

async function loop(keys) {
  while (busy) {
    const replies = run.messages.filter((m) => m.side !== 'starter').length;
    if (replies >= run.settings.maxTurns) {
      run.status = 'done';
      setStatus(`Done · ${replies} replies`);
      return;
    }
    const last = run.messages[run.messages.length - 1];
    const side = last.side === 'starter' ? last.to : other(last.side);
    const ok = await turn(side, keys);
    if (!ok) return;
    saveRun();
    if (busy && run.settings.delayMs) await sleep(run.settings.delayMs);
  }
}

async function turn(side, keys) {
  const cfg = run.settings[side];
  const msg = { side, name: cfg.name || `Side ${side}`, provider: cfg.provider, model: cfg.modelId, text: '', thinking: '' };
  const el = messageEl(msg, run.settings);
  const body = $('.body', el);
  const details = $('details', el);
  const thinkBody = $('.think-body', el);
  body.classList.add('cursor');
  $('#transcript').appendChild(el);
  scrollToBottom(true);
  setStatus(`${msg.name} is writing…`, 'running');

  let pending = false;
  let latestText = '';
  const ui = {
    thinking(t) {
      if (details.classList.contains('hidden')) { details.classList.remove('hidden'); details.open = true; }
      thinkBody.textContent = t;
      thinkBody.scrollTop = thinkBody.scrollHeight;
      scrollToBottom();
    },
    text(t) {
      latestText = t;
      if (details.open && !msg._closed) { details.open = false; msg._closed = true; }
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        renderMarkdown(body, latestText);
        scrollToBottom();
      });
    },
  };

  controller = new AbortController();
  try {
    const call = cfg.provider === 'anthropic' ? callAnthropic : callOpenAI;
    const r = await call(cfg, historyFor(side), keys[cfg.provider], controller.signal, ui);
    delete msg._closed;
    Object.assign(msg, {
      text: r.text,
      thinking: r.thinking,
      stopReason: r.stopReason,
      usage: r.usage,
      at: Date.now(),
    });
    if (r.blocks) msg.blocks = r.blocks;
    if (r.servedModel && r.servedModel !== msg.model) msg.model = r.servedModel;
    body.classList.remove('cursor');
    renderMarkdown(body, msg.text);
    setMeta(el, msg);
    $('.who', el).textContent = `${msg.name} · ${msg.model}`;

    if (r.stopReason === 'refusal') {
      el.remove();
      notice(`${msg.name} declined to continue (refusal). The run is paused; edit the prompts or switch models, then Resume.`);
      busy = false;
      setStatus('Paused (refusal)', 'error');
      return false;
    }
    if (!msg.text.trim()) {
      el.remove();
      notice(`${msg.name} returned no text (${r.stopReason || 'unknown stop'}). Try raising max output tokens or lowering effort, then Resume.`);
      busy = false;
      setStatus('Paused (empty reply)', 'error');
      return false;
    }
    run.messages.push(msg);
    return true;
  } catch (e) {
    el.remove();
    if (e.name === 'AbortError') {
      setStatus('Paused');
      return false;
    }
    notice(`${msg.name}: ${e.message}`);
    busy = false;
    setStatus('Paused (error)', 'error');
    return false;
  }
}

function pause() {
  busy = false;
  if (controller) controller.abort();
  if (run) run.status = 'paused';
  setStatus('Paused');
  updateButtons();
}

function clearRun() {
  if (busy) return;
  run = null;
  renderTranscript();
  renderRunList();
  setStatus('Idle');
  updateButtons();
}

// ---------- Markdown export ----------

function sideSummary(s) {
  const bits = [`${s.provider} / \`${s.modelId}\``];
  if (s.provider === 'anthropic') bits.push(`thinking: ${s.aThinking}`, `effort: ${s.aEffort}`);
  else bits.push(`effort: ${s.oEffort || 'default'}`, `summary: ${s.oSummary}`, s.oVerbosity ? `verbosity: ${s.oVerbosity}` : null);
  return bits.filter(Boolean).join(', ');
}

function toMarkdown(r) {
  const s = r.settings;
  const lines = [`# ${r.title}`, '', `_${new Date(r.createdAt).toLocaleString()}_`, ''];
  for (const side of ['A', 'B']) {
    lines.push(`- **Side ${side} — ${s[side].name || 'Side ' + side}:** ${sideSummary(s[side])}`);
  }
  lines.push('');
  for (const side of ['A', 'B']) {
    if (s[side].system.trim()) {
      lines.push(`## System prompt — ${s[side].name || 'Side ' + side}`, '', s[side].system.trim(), '');
    }
  }
  lines.push('## Transcript', '');
  let n = 0;
  for (const m of r.messages) {
    if (m.side === 'starter') {
      lines.push(`### Starter prompt → Side ${m.to}`, '', m.text.trim(), '');
      continue;
    }
    n += 1;
    lines.push(`### ${n}. ${m.name} (Side ${m.side}, \`${m.model}\`)`, '');
    if (m.thinking && m.thinking.trim()) {
      lines.push('<details><summary>Thinking</summary>', '', m.thinking.trim().split('\n').map((l) => '> ' + l).join('\n'), '', '</details>', '');
    }
    lines.push(m.text.trim(), '');
  }
  return lines.join('\n');
}

function download() {
  if (!run) return;
  const blob = new Blob([toMarkdown(run)], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${run.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'run'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Wire up ----------

function init() {
  buildSideCards();
  loadSettings();
  renderRunList();
  updateButtons();

  $('#settings').addEventListener('input', () => { saveSettings(); updateButtons(); });
  $('#settings').addEventListener('change', () => { saveSettings(); updateButtons(); });
  $('#toggleSettings').addEventListener('click', () => $('#settings').classList.toggle('open'));
  $('#toggleHistory').addEventListener('click', () => $('#history').classList.toggle('open'));
  $('#startBtn').addEventListener('click', start);
  $('#pauseBtn').addEventListener('click', pause);
  $('#clearBtn').addEventListener('click', clearRun);
  $('#downloadBtn').addEventListener('click', download);
  if (window.innerWidth < 820) $('#settings').classList.remove('open');
}

init();
