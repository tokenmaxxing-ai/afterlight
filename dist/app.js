import { YEAR_NOW, END_YEAR, yearsAt, positionAt, populationAt, planetAt, clamp } from './timeline.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['app','scene','scene-loading','years','calendar','play-state','population','population-note','solar','ocean','biosphere','earth-age','chapter-number','era-kicker','era-title','era-description','evidence-tag','change-description','finale-banner','cloud-toggle','lights-toggle','reset-view','globe-caption','play','play-icon','play-label','restart','speed','scenario','finale-enabled','timeline','runtime','finale-replay','finale-controls','finale-scrub','finale-percent','back-science','science-dialog','announcement'].map(id => [id, $(id)]));
const state = { position: 0, playing: false, speed: 1, scenario: 'earlier', mode: 'science', finale: 0, finaleEnabled: true, clouds: true, nightLights: true, ready: false };
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let scene, lastTime = 0, lastPaint = 0, currentChapter = -1, lastDigits = '', endpointHold = 0;
const chapters = [
  ['THE PRESENT', 'The blue<br>moment.', 'Liquid oceans. A living surface. A thin atmosphere that makes it all possible.', 'OBSERVATION + ESTIMATE', 'Present-day geography, clouds and city lights. Drag to find your corner of the world.'],
  ['A HUMAN HORIZON', 'A world<br>of people.', 'The UN projects a population peak around the mid-2080s. Beyond 2100, a human headcount would be guesswork.', 'UN POPULATION PROJECTION', 'Geography stays familiar over a human lifetime. Surface colors are not a forecast of this century’s climate.'],
  ['MILLIONS OF YEARS', 'Nothing<br>stays still.', 'Mountains rise and wear away. Plates keep moving. The map we know becomes a memory.', 'ILLUSTRATIVE GEOGRAPHY', 'The surface slowly shifts. This is a visual interpretation of deep time, not a predicted continental map.'],
  ['A RESTLESS SURFACE', 'Worlds<br>within a world.', 'A future supercontinent is possible, but its shape and timing are uncertain. Where land meets ocean changes the climate.', 'MULTIPLE POSSIBLE FUTURES', 'Watch the coastlines deform and the land grow warmer in color. Ocean area is illustrative.'],
  ['A BRIGHTER STAR', 'Under a<br>stronger sun.', 'The Sun’s increasing brightness changes the conditions for life. Carbon cycling and plant adaptation shape what comes next.', 'RESEARCH-INFORMED SCENARIO', 'Ice recedes and dry colors spread in this illustration. Switch the biosphere scenario to compare two possibilities.'],
  ['APPROACHING A BILLION', 'A different<br>kind of blue.', 'By one billion years, the Sun is roughly 10% brighter. Oxygen-rich air may be nearing its limit in some models; others allow vegetation to persist longer.', 'UNCERTAIN BIOSPHERE FUTURE', 'Liquid oceans remain. The warm surface and haze express a possible future, not measured temperatures or oxygen levels.'],
];

const tracks = [];
for (let i = 0; i < 10; i++) {
  if (i && (10 - i) % 3 === 0) { const comma = document.createElement('span'); comma.className = 'number-comma'; comma.textContent = ','; comma.setAttribute('aria-hidden', 'true'); ui.years.append(comma); }
  const digit = document.createElement('span'); digit.className = 'digit'; digit.setAttribute('aria-hidden', 'true');
  const track = document.createElement('span'); track.className = 'digit-track';
  for (let n = 0; n < 10; n++) { const row = document.createElement('span'); row.textContent = n; track.append(row); }
  digit.append(track); ui.years.append(digit); tracks.push(track);
}
function setYears(years) {
  const digits = String(years).padStart(10, '0');
  if (digits === lastDigits) return;
  tracks.forEach((track, i) => { if (digits[i] !== lastDigits[i]) track.style.transform = `translateY(-${Number(digits[i]) * 10}%)`; track.parentElement.classList.toggle('leading-zero', i < 9 && Number(digits.slice(0, i + 1)) === 0); });
  lastDigits = digits; ui.years.setAttribute('aria-label', `${years.toLocaleString()} years from now`);
}
function chapterAt(p) { return p < .015 ? 0 : p <= .14 ? 1 : p < .36 ? 2 : p < .57 ? 3 : p < .86 ? 4 : 5; }
function paint() {
  const years = yearsAt(state.position), fictional = state.mode === 'finale';
  setYears(years);
  ui.calendar.textContent = fictional ? 'Time stops here · artistic sequence' : years <= 74 ? `${YEAR_NOW + years} CE` : years < 1e6 ? `+${years.toLocaleString()} years` : `+${years >= 1e9 ? '1 billion' : (years / 1e6).toFixed(years < 1e7 ? 2 : 1).replace(/\.0$/, '') + ' million'} years`;
  ui['play-state'].textContent = fictional ? 'FICTION' : state.playing ? 'TRAVELING' : 'PAUSED';
  const pop = populationAt(years);
  ui.population.classList.toggle('unknown', pop === null);
  ui.population.innerHTML = pop === null ? 'Unknown' : `${pop.toFixed(2)}<span>billion</span>`;
  ui['population-note'].textContent = pop === null ? 'Beyond demographic forecasts' : years === 0 ? 'UN projection · 2026' : 'UN projection · interpolated';
  ui.solar.innerHTML = fictional ? '—' : `+${(years / END_YEAR * 10).toFixed(1)}<span>%</span>`;
  ui.ocean.textContent = fictional ? 'Not modeled' : 'Liquid';
  ui.biosphere.textContent = fictional ? 'Artistic sequence' : years === 0 ? 'Flourishing' : years < 74 ? 'Changing' : years < 600e6 ? 'Uncertain' : state.scenario === 'longer' ? 'May persist' : 'Under pressure';
  ui['earth-age'].textContent = `~${(4.54 + years / END_YEAR).toFixed(2)} billion years`;
  const chapter = chapterAt(state.position);
  if (chapter !== currentChapter) {
    const [kicker, title, description, evidence, change] = chapters[chapter];
    ui['chapter-number'].textContent = String(chapter + 1).padStart(2, '0');
    ui['era-kicker'].textContent = kicker; ui['era-title'].innerHTML = title.replace('<br>', '<br> '); ui['era-description'].textContent = description;
    ui['evidence-tag'].textContent = evidence; ui['change-description'].textContent = change;
    ui.announcement.textContent = `${kicker}. ${title.replace('<br>', ' ')}`;
    currentChapter = chapter;
  }
  ui.app.classList.toggle('is-finale', fictional);
  ui['finale-banner'].hidden = !fictional; ui['finale-controls'].hidden = !fictional;
  ui['finale-replay'].hidden = state.position < 1 || !state.finaleEnabled || (fictional && state.finale < 1);
  ui['finale-replay'].textContent = fictional ? 'Replay the finale ↗' : 'Watch the finale ↗';
  ui['finale-scrub'].value = Math.round(state.finale * 1000); ui['finale-percent'].textContent = `${Math.round(state.finale * 100)}%`;
  ui['finale-scrub'].setAttribute('aria-valuetext', `${Math.round(state.finale * 100)} percent of the fictional cinematic sequence`);
  ui.timeline.value = Math.round(state.position * 10000); ui.timeline.style.setProperty('--fill', `${state.position * 100}%`);
  ui.timeline.setAttribute('aria-valuetext', `${years.toLocaleString()} years from now`);
  $('mobile-timeline').value = Math.round((fictional ? state.finale : state.position) * 10000);
  $('mobile-timeline').setAttribute('aria-label', fictional ? 'Quick fictional finale progress' : 'Quick Earth timeline');
  $('mobile-timeline').setAttribute('aria-valuetext', fictional ? `${Math.round(state.finale * 100)} percent of fictional sequence` : `${years.toLocaleString()} years from now`);
  $('mobile-time-start').textContent = fictional ? 'Fictional heating' : 'Today';
  $('mobile-time-end').textContent = fictional ? 'Breakup' : '+1 billion years';
  document.querySelectorAll('[data-position]').forEach(button => button.setAttribute('aria-current', String(Math.abs(Number(button.dataset.position) - state.position) < .003)));
  ui['play-icon'].textContent = state.playing ? 'Ⅱ' : '▶';
  ui['play-label'].textContent = state.playing ? 'Pause journey' : fictional && state.finale >= 1 ? 'Replay finale' : fictional ? 'Play finale' : state.position >= 1 ? state.finaleEnabled ? 'Play finale' : 'Replay journey' : 'Play journey';
  ui.play.setAttribute('aria-label', ui['play-label'].textContent);
  $('mobile-play').textContent = `${state.playing ? 'Ⅱ' : '▶'}  ${ui['play-label'].textContent}`;
  $('mobile-play').disabled = !state.ready;
  ui['globe-caption'].textContent = fictional ? 'Fictional heating & breakup · not an Earth-system prediction' : years <= 74 ? 'Present-day surface imagery · clouds & city lights' : 'Illustrative geography, ice & surface colors · liquid oceans retained';
  ui['lights-toggle'].disabled = years > 74;
  ui['lights-toggle'].title = years > 74 ? 'Modern city lights are hidden beyond the population forecast horizon.' : 'Toggle present-day city lights';
  ui['lights-toggle'].setAttribute('aria-pressed', String(state.nightLights && years <= 74));
  ui['cloud-toggle'].setAttribute('aria-pressed', String(state.clouds));
  ui['runtime'].textContent = state.speed === 1 ? 'A 2-minute journey' : `${120 / state.speed}-second journey`;
  if (scene) {
    scene.setState(planetAt(years, state.scenario, fictional ? state.finale : 0));
    scene.setLayers({ clouds: state.clouds, nightLights: state.nightLights && years <= 74 });
  }
}
function setPlaying(value) {
  if (!state.ready && value) return;
  if (value && state.position >= 1 && state.mode === 'science') {
    if (state.finaleEnabled) { state.mode = 'finale'; state.finale = 0; }
    else state.position = 0;
  } else if (value && state.mode === 'finale' && state.finale >= 1) state.finale = 0;
  state.playing = !!value; lastTime = 0; endpointHold = 0;
  scene?.setPlaying(state.playing); paint();
  if (value && matchMedia('(max-width: 760px)').matches) document.querySelector('.observatory').scrollIntoView({behavior: motion.matches ? 'instant' : 'smooth', block: 'start'});
}
function seek(position) {
  state.position = clamp(position); state.mode = 'science'; state.finale = 0; setPlaying(false);
}
function runFinale() {
  state.position = 1; state.mode = 'finale'; state.finale = 0;
  state.finaleEnabled = true; ui['finale-enabled'].checked = true;
  setPlaying(true);
  ui.announcement.textContent = 'The scientific timeline is complete. Starting the fictional cinematic finale.';
}
ui.play.addEventListener('click', () => setPlaying(!state.playing));
$('mobile-play').addEventListener('click', () => setPlaying(!state.playing));
ui.restart.addEventListener('click', () => { seek(0); scene?.resetView(); });
ui.timeline.addEventListener('input', () => seek(Number(ui.timeline.value) / 10000));
$('mobile-timeline').addEventListener('input', () => { const value = Number($('mobile-timeline').value) / 10000; if (state.mode === 'finale') { state.finale = value; setPlaying(false); } else seek(value); });
document.querySelectorAll('[data-position]').forEach(button => button.addEventListener('click', () => seek(Number(button.dataset.position))));
ui.speed.addEventListener('change', () => { state.speed = Number(ui.speed.value); paint(); });
ui.scenario.addEventListener('change', () => { state.scenario = ui.scenario.value; paint(); });
ui['finale-enabled'].addEventListener('change', () => { state.finaleEnabled = ui['finale-enabled'].checked; if (!state.finaleEnabled && state.mode === 'finale') seek(1); else paint(); });
ui['finale-replay'].addEventListener('click', runFinale);
ui['back-science'].addEventListener('click', () => seek(1));
ui['finale-scrub'].addEventListener('input', () => { state.position = 1; state.mode = 'finale'; state.finale = Number(ui['finale-scrub'].value) / 1000; setPlaying(false); });
ui['cloud-toggle'].addEventListener('click', () => { state.clouds = !state.clouds; paint(); });
ui['lights-toggle'].addEventListener('click', () => { state.nightLights = !state.nightLights; paint(); });
ui['reset-view'].addEventListener('click', () => scene?.resetView());
for (const id of ['science-open', 'credits-open']) $(id).addEventListener('click', () => { setPlaying(false); ui['science-dialog'].showModal(); });
document.querySelector('.dialog-close').addEventListener('click', () => ui['science-dialog'].close());
ui['science-dialog'].addEventListener('click', event => { if (event.target === ui['science-dialog']) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
document.addEventListener('keydown', event => { if (event.code === 'Space' && !ui['science-dialog'].open && !event.target.closest('input,select,button,a,textarea')) { event.preventDefault(); setPlaying(!state.playing); } });
document.addEventListener('visibilitychange', () => { lastTime = 0; });
motion.addEventListener('change', event => scene?.setReducedMotion(event.matches));

function frame(now) {
  if (!document.hidden) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0;
    if (state.playing) {
      if (state.mode === 'science') {
        state.position = Math.min(1, state.position + dt * state.speed / 120);
        if (state.position >= 1) {
          endpointHold += dt;
          if (endpointHold > 1.5) { if (state.finaleEnabled) runFinale(); else setPlaying(false); }
        }
      } else {
        state.finale = Math.min(1, state.finale + dt * Math.min(state.speed, 2) / 17);
        if (state.finale >= 1) setPlaying(false);
      }
      scene?.setState(planetAt(yearsAt(state.position), state.scenario, state.mode === 'finale' ? state.finale : 0));
      if (now - lastPaint > 80) { paint(); lastPaint = now; }
    }
    lastTime = now;
  }
  requestAnimationFrame(frame);
}

// Optional WebMCP controls mirror the visible UI and use the same validated state.
function snapshot() {
  const years = yearsAt(state.position);
  return { ready: state.ready, yearsFromNow: years, calendarYear: years <= 74 ? YEAR_NOW + years : null, mode: state.mode, fictional: state.mode === 'finale', finaleProgress: state.finale, playing: state.playing, speed: state.speed, scenario: state.scenario, populationBillions: populationAt(years), solarIncreasePercent: state.mode === 'finale' ? null : years / END_YEAR * 10, layers: { clouds: state.clouds, nightLights: state.nightLights && years <= 74 } };
}
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const tool = (name, description, properties, required, execute, readOnly = false) => ({ name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: readOnly }, execute: async args => { try { return result(await execute(args)); } catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true }; } } });
const finiteIn = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
if (navigator.modelContext?.registerTool) {
  const controls = [
    tool('get_earth_state', 'Read the Earth timeline, counters, playback and fictional-finale state.', {}, [], snapshot, true),
    tool('set_earth_time', 'Pause and seek the scientific Earth timeline to 0–1,000,000,000 years from 2026. Exits the fictional finale.', { years: { type: 'number', minimum: 0, maximum: END_YEAR } }, ['years'], ({years}) => { if (!finiteIn(years, 0, END_YEAR)) throw new Error('years must be a finite number from 0 to 1,000,000,000.'); seek(positionAt(years)); return snapshot(); }),
    tool('set_earth_playback', 'Play or pause the visible journey, optionally selecting speed. The enabled cinematic finale is explicitly fictional.', { playing: { type: 'boolean' }, speed: { type: 'number', enum: [1,2,4,8] } }, ['playing'], ({playing,speed}) => { if (typeof playing !== 'boolean' || (speed !== undefined && ![1,2,4,8].includes(speed))) throw new Error('Use boolean playing and speed 1, 2, 4 or 8.'); if (playing && !state.ready) throw new Error('The globe is still loading.'); if (speed !== undefined) { state.speed = speed; ui.speed.value = speed; } setPlaying(playing); return snapshot(); }),
    tool('set_earth_finale', 'Pause and inspect the fictional heating and breakup sequence after the scientific timeline. This is artistic, not a prediction.', { progress: { type: 'number', minimum: 0, maximum: 1 } }, ['progress'], ({progress}) => { if (!finiteIn(progress,0,1)) throw new Error('progress must be a finite number from 0 to 1.'); state.position = 1; state.mode = 'finale'; state.finale = progress; state.finaleEnabled = true; ui['finale-enabled'].checked = true; setPlaying(false); return snapshot(); }),
  ];
  for (const control of controls) { try { navigator.modelContext.registerTool(control); } catch (error) { console.warn('Optional model control unavailable:', error.message); } }
}

function showError(error) {
  state.ready = false; setPlaying(false); ui.play.disabled = true;
  let overlay = $('scene-loading');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'scene-loading'; ui.scene.append(overlay); }
  overlay.className = 'scene-loading error';
  overlay.replaceChildren();
  const heading = document.createElement('span'); heading.textContent = 'The globe needs a moment.';
  const note = document.createElement('span'); note.className = 'loading-note'; note.textContent = 'Please reload in a browser with WebGL enabled.';
  const retry = document.createElement('button'); retry.textContent = 'Reload globe'; retry.onclick = () => location.reload();
  overlay.append(heading, note, retry); console.error('Earth renderer:', error);
}
paint(); requestAnimationFrame(frame);
try {
  const { createEarthScene } = await import('./earth-scene.js');
  scene = await createEarthScene(ui.scene, { onReady() { $('scene-loading')?.remove(); state.ready = true; ui.play.disabled = false; }, onError: showError });
  scene.setReducedMotion(motion.matches); scene.setPlaying(false); paint();
} catch (error) { showError(error); }
window.addEventListener('pagehide', event => { if (!event.persisted) scene?.dispose(); });
