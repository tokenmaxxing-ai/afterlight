const $ = id => document.getElementById(id);
const PLANETS = {
  earth:{name:'Earth',type:'TERRESTRIAL WORLD'}, mars:{name:'Mars',type:'TERRESTRIAL WORLD'},
  moon:{name:'Moon',type:'ROCKY SATELLITE'}, jupiter:{name:'Jupiter',type:'GAS GIANT'}, neptune:{name:'Neptune',type:'ICE GIANT'},
};
const WEAPONS = {
  meteor:{name:'Meteor',action:'Launch meteor',description:'A fiery projectile. A crater right where it lands.',color:'#f7ad7c'},
  laser:{name:'Laser',action:'Fire laser',description:'A focused beam. Carve a glowing scar in the surface.',color:'#87dfdf'},
  moon:{name:'Moon strike',action:'Collide moon',description:'A massive collision. A much bigger dent.',color:'#becfe4'},
  blackhole:{name:'Black hole',action:'Open black hole',description:'Pull matter inward. Leave nothing but an accretion ring.',color:'#cfadf4'},
  supernova:{name:'Supernova',action:'Trigger supernova',description:'A stellar blast. Heat the whole world until it cracks.',color:'#f0d486'},
  shower:{name:'Meteor shower',action:'Rain meteors',description:'Five falling rocks. A rolling barrage across the surface.',color:'#ffa97e'},
  railgun:{name:'Railgun',action:'Charge railgun',description:'Charge. Release. Punch through the crust in a flash.',color:'#e4aaff'},
  cryo:{name:'Ice comet',action:'Launch ice comet',description:'Freeze the crust, then strike it with a rock, railgun or drill for bonus damage.',color:'#9defff'},
  drill:{name:'Orbital drill',action:'Deploy drill',description:'A spinning drill. Five pulses that bore into the same spot.',color:'#ffc276'},
};
const state = {ready:false,planet:'earth',weapon:'meteor',power:50,paused:false,speed:1,sound:false,worldsDestroyed:0};
let stats = {integrity:100,health:300,maxHealth:300,frost:0,heat:0,impacts:0,fragments:0,status:'ready'}, scene, toastTimer, flashTimer, audioContext, helpWasPaused = false;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const validOption = (options,value) => typeof value==='string'&&Object.hasOwn(options,value);
function toast(message) {
  clearTimeout(toastTimer); $('hit-message').textContent = message; $('hit-message').classList.add('show');
  toastTimer = setTimeout(() => $('hit-message').classList.remove('show'), 1800);
}
function announce(message) { $('announcement').textContent = message; }
function paint() {
  const weapon = WEAPONS[state.weapon], planet = PLANETS[state.planet];
  document.documentElement.style.setProperty('--accent',weapon.color);
  const healthColor = stats.integrity > 60 ? '#b5dbcc' : stats.integrity > 25 ? '#e7bd79' : '#f79981';
  document.documentElement.style.setProperty('--healthy',healthColor);
  $('world-name').textContent=planet.name; $('world-type').textContent=planet.type;
  document.querySelectorAll('[data-planet]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.planet===state.planet));button.disabled=!state.ready;});
  document.querySelectorAll('[data-weapon]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.weapon===state.weapon));button.disabled=!state.ready;});
  $('selected-icon').querySelector('use').setAttribute('href',`#i-${state.weapon}`);
  $('tool-description').textContent=weapon.description; $('fire-label').textContent=weapon.action;
  $('power-value').textContent=`${state.power}%`; $('power').value=state.power; $('power').setAttribute('aria-valuetext',`${state.power} percent`);
  $('integrity').textContent=Math.round(stats.integrity); $('integrity-bar').style.width=`${stats.integrity}%`;
  const visibleHealth=Math.round((stats.health??stats.integrity)*10)/10;
  $('health').textContent=visibleHealth; $('max-health').textContent=stats.maxHealth??100;
  $('health-meter').setAttribute('aria-valuenow',String(visibleHealth));$('health-meter').setAttribute('aria-valuemax',String(stats.maxHealth??100));
  $('health-meter').setAttribute('aria-valuetext',`${visibleHealth} of ${stats.maxHealth??100} health points`);
  $('game').classList.toggle('is-frozen',(stats.frost??0)>4&&stats.integrity>0);
  $('heat').textContent=`${stats.heat}%`; $('impacts').textContent=stats.impacts; $('fragments').textContent=stats.fragments;
  const condition=stats.status==='destroyed'?'Gone, but resettable.':stats.status==='destroying'?'Coming apart…':stats.integrity>99?'Pristine. For now.':stats.integrity>60?'A little worse for wear.':stats.integrity>25?'Holding on. Barely.':'One last nudge.';
  $('condition').textContent=(stats.frost??0)>4&&stats.integrity>0?'Frozen crust · strike to shatter':condition;
  $('game').classList.toggle('is-destroyed',stats.status==='destroyed'); $('game').classList.toggle('is-paused',state.paused);
  $('result').hidden=stats.status!=='destroyed';
  $('result').querySelector('h2').textContent=stats.finisher==='blackhole'?'Into the void.':'World shattered.';
  $('fire').disabled=!state.ready||state.paused||['destroying','destroyed'].includes(stats.status);
  $('fire').title=state.paused?'Resume physics to launch a weapon.':stats.status==='destroyed'?'Restore the planet to play again.':'Launch at the center, or click the planet to aim.';
  $('pause').setAttribute('aria-pressed',String(state.paused)); $('pause').setAttribute('aria-label',state.paused?'Resume physics':'Pause physics'); $('pause').textContent=state.paused?'▶':'Ⅱ';
  $('time-scale').value=state.speed; $('sound').textContent=state.sound?'Sound on':'Sound off'; $('sound').setAttribute('aria-pressed',String(state.sound));
  $('destroyed-count').textContent=state.worldsDestroyed; $('restore').disabled=!state.ready; $('rebuild').disabled=!state.ready;
}
function choosePlanet(id) {
  if (!validOption(PLANETS,id)) throw new Error('Choose Earth, Mars, Moon, Jupiter or Neptune.');
  if (!state.ready) throw new Error('The worlds are still loading.');
  state.planet=id; scene.setPlanet(id); scene.resetView();
  clearTimeout(toastTimer); $('hit-message').classList.remove('show'); $('hit-message').textContent=''; paint(); announce(`${PLANETS[id].name} restored. Ready for a little chaos.`);
}
function chooseWeapon(id) {
  if (!validOption(WEAPONS,id)) throw new Error('Unknown destruction tool.');
  state.weapon=id; scene?.setWeapon(id); paint();
}
function setPower(value) {
  if (!Number.isFinite(value)||value<5||value>100) throw new Error('Power must be from 5 to 100.');
  state.power=Math.round(value); scene?.setPower(state.power/100); paint();
}
function setTime(paused, speed=state.speed) {
  if(typeof paused!=='boolean'||![.25,.5,1,2].includes(speed)) throw new Error('Use a boolean pause state and speed 0.25, 0.5, 1 or 2.');
  state.paused=paused;state.speed=speed;scene?.setTimeScale(paused?0:speed);if(state.sound&&audioContext){if(paused)void audioContext.suspend();else void audioContext.resume();}paint();
}
function restore() {
  if (!state.ready) return;
  scene.reset();
  clearTimeout(toastTimer); $('hit-message').classList.remove('show');$('hit-message').textContent='';paint();announce(`${PLANETS[state.planet].name} is whole again.`);
}
function fire() {
  if (!state.ready) return false;
  if(state.paused){toast('Time is paused. Resume to launch.');return false;}
  const fired=scene.fireAtCenter();
  if(fired){$('fire').classList.remove('flash');requestAnimationFrame(()=>$('fire').classList.add('flash'));clearTimeout(flashTimer);flashTimer=setTimeout(()=>$('fire').classList.remove('flash'),430);}
  else if(stats.status==='destroyed')toast('Restore the planet for another round.');
  else if(stats.status!=='destroying')toast('Weapon recharging…');
  return fired;
}
// Quiet synthesized effects; audio only starts after the user opts in.
function playSound(weapon,power=.5,phase='impact') {
  if(!state.sound||state.paused||!audioContext||document.hidden)return;
  const ctx=audioContext, now=ctx.currentTime, duration=phase==='launch'?(weapon==='railgun'?.65:.24):weapon==='laser'?.30:weapon==='blackhole'?1.25:weapon==='drill'?.18:.65;
  const gain=ctx.createGain();gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.035+power*.025,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);gain.connect(ctx.destination);
  const oscillator=ctx.createOscillator();oscillator.type=['laser','drill','railgun'].includes(weapon)?'sawtooth':weapon==='cryo'?'triangle':'sine';const tone=weapon==='cryo'?1100:weapon==='laser'?600:weapon==='railgun'?220:weapon==='drill'?85:weapon==='blackhole'?140:100;oscillator.frequency.setValueAtTime(phase==='launch'?tone*.5:tone,now);oscillator.frequency.exponentialRampToValueAtTime(phase==='launch'?tone*2:weapon==='cryo'?380:28,now+duration);oscillator.connect(gain);oscillator.start(now);oscillator.stop(now+duration);
  if(phase==='impact'&&weapon!=='laser'&&weapon!=='cryo'){const buffer=ctx.createBuffer(1,ctx.sampleRate*.4,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const noise=ctx.createBufferSource();noise.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=weapon==='supernova'?1400:weapon==='railgun'?1900:550;noise.connect(filter);filter.connect(gain);noise.start(now);noise.stop(now+.4);}
  oscillator.onended=()=>gain.disconnect();
}
document.querySelectorAll('[data-planet]').forEach(button=>button.addEventListener('click',()=>choosePlanet(button.dataset.planet)));
document.querySelectorAll('[data-weapon]').forEach(button=>button.addEventListener('click',()=>chooseWeapon(button.dataset.weapon)));
$('power').addEventListener('input',()=>setPower(Number($('power').value)));
$('fire').addEventListener('click',fire);
for(const id of ['restore','rebuild'])$(id).addEventListener('click',restore);
$('camera-reset').addEventListener('click',()=>scene?.resetView());
$('pause').addEventListener('click',()=>setTime(!state.paused));
$('time-scale').addEventListener('change',()=>setTime(state.paused,Number($('time-scale').value)));
$('sound').addEventListener('click',async()=>{state.sound=!state.sound;if(state.sound){try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();if(!state.paused){await audioContext.resume();playSound('laser',.1);}else await audioContext.suspend();}catch{state.sound=false;toast('Sound is unavailable in this browser.');}}else await audioContext?.suspend();paint();});
for(const id of ['help','credits'])$(id).addEventListener('click',()=>{helpWasPaused=state.paused;setTime(true);$('help-dialog').showModal();});
document.querySelector('.close-dialog').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('close',()=>setTime(helpWasPaused));
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
document.addEventListener('keydown',event=>{
  if($('help-dialog').open||event.target.closest('input,select,textarea,[contenteditable=true]')||event.altKey||event.ctrlKey||event.metaKey)return;
  const ids=Object.keys(WEAPONS),n=Number(event.key);
  if(n>=1&&n<=9){event.preventDefault();chooseWeapon(ids[n-1]);}
  else if(event.code==='Space'&&!event.target.closest('button,a')){event.preventDefault();if(!event.repeat)fire();}
  else if(event.key.toLowerCase()==='p'&&!event.repeat)setTime(!state.paused);
  else if(event.key.toLowerCase()==='r'&&!event.repeat)restore();
});
motion.addEventListener('change',event=>scene?.setReducedMotion(event.matches));
document.addEventListener('visibilitychange',()=>{if(state.sound&&audioContext){if(document.hidden)void audioContext.suspend();else if(!state.paused)void audioContext.resume();}});

function snapshot(){return {...state,...stats,planet:state.planet,weapon:state.weapon,physics:'fictional sandbox'};}
const context=document.modelContext??navigator.modelContext,lifecycle=new AbortController();
if(context?.registerTool){
  function register(name,description,properties,required,execute,readOnly=false){
    const config={name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:readOnly},execute:async input=>{
      if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Input must be an object.');
      for(const key of Object.keys(input))if(!Object.hasOwn(properties,key))throw new Error(`Unexpected field: ${key}`);
      for(const key of required)if(!Object.hasOwn(input,key))throw new Error(`Missing field: ${key}`);
      return await execute(input);
    }};
    try{Promise.resolve(context.registerTool(config,{signal:lifecycle.signal})).catch(error=>console.warn('Optional sandbox tool:',error.message));}catch(error){console.warn('Optional sandbox tool:',error.message);}
  }
  register('get_sandbox_state','Read the fictional planet sandbox, chosen world, tool, damage and time controls.',{},[],snapshot,true);
  register('configure_sandbox','Change planet (restores it), select a destruction tool and set weapon power. All effects are fictional.',{planet:{type:'string',enum:Object.keys(PLANETS)},weapon:{type:'string',enum:Object.keys(WEAPONS)},power:{type:'number',minimum:5,maximum:100}},[],input=>{
    if(input.planet!==undefined&&!validOption(PLANETS,input.planet))throw new Error('Invalid planet.');if(input.weapon!==undefined&&!validOption(WEAPONS,input.weapon))throw new Error('Invalid weapon.');if(input.power!==undefined&&(!Number.isFinite(input.power)||input.power<5||input.power>100))throw new Error('Power must be from 5 to 100.');
    if(input.planet!==undefined)choosePlanet(input.planet);if(input.weapon!==undefined)chooseWeapon(input.weapon);if(input.power!==undefined)setPower(input.power);return snapshot();
  });
  register('fire_sandbox_weapon','Launch the selected fictional weapon at the visible planet center. Impact and damage occur after its travel animation.',{},[],()=>{if(!fire())throw new Error(state.paused?'Physics is paused.':!state.ready?'Planet is loading.':'Weapon is recharging or the planet is already breaking apart.');return {launched:true,...snapshot()};});
  register('set_sandbox_time','Pause/resume all destruction effects, or change the simulation speed.',{paused:{type:'boolean'},speed:{type:'number',enum:[.25,.5,1,2]}},['paused'],({paused,speed})=>{setTime(paused,speed??state.speed);return snapshot();});
  register('restore_sandbox_planet','Restore the current planet, clearing all damage, debris and active weapons.',{},[],()=>{if(!state.ready)throw new Error('Planet is loading.');restore();return snapshot();});
}
function failure(error){
  state.ready=false;paint();let overlay=$('loading');if(!overlay){overlay=document.createElement('div');overlay.id='loading';$('scene').append(overlay);}overlay.className='loading error';overlay.setAttribute('role','alert');overlay.replaceChildren();const title=document.createElement('strong');title.textContent='Your universe needs a moment.';const text=document.createElement('p');text.textContent='Please reload in a browser with WebGL enabled.';const button=document.createElement('button');button.textContent='Reload playground';button.onclick=()=>location.reload();overlay.append(title,text,button);console.error('Sandbox renderer:',error);
}
paint();
try{
  const {createSandboxScene}=await import('./sandbox-scene.js');
  scene=await createSandboxScene($('scene'),{
    onReady(){state.ready=true;$('loading')?.remove();paint();},
    onError:failure,
    onStats(next){stats=next;paint();},
    onLaunch({weapon,power}){playSound(weapon,power,'launch');},
    onImpact({weapon,power,damage,bonus}){const shattered=bonus==='shatter';$('hit-message').classList.toggle('shatter',shattered);toast(`${shattered?'ICE SHATTER':WEAPONS[weapon].name} · −${Math.round(damage)} HP`);playSound(weapon,power);},
    onDestroyed({finisher}){state.worldsDestroyed++;paint();announce(`${PLANETS[state.planet].name} destroyed. Restore it or choose another world.`);playSound(finisher==='blackhole'?'blackhole':'supernova',.85);},
  });
  const canvas=$('scene').querySelector('canvas');if(canvas){canvas.tabIndex=0;canvas.style.removeProperty('outline');}
  scene.setPower(state.power/100);scene.setWeapon(state.weapon);scene.setTimeScale(state.paused?0:state.speed);scene.setReducedMotion(motion.matches);paint();
}catch(error){failure(error);}
window.addEventListener('pagehide',event=>{if(!event.persisted){lifecycle.abort();scene?.dispose();audioContext?.close();clearTimeout(toastTimer);clearTimeout(flashTimer);}});
