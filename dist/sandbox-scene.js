import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const TAU = Math.PI * 2;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number(v)||0));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const seededRandom = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const MAX_SCARS=32, MAX_PARTICLES=1400;
const PLANETS={
 earth:{hp:300,map:'earth-day.jpg',atmosphere:0x508fff,clouds:true,night:true},
 mars:{hp:260,map:'mars.jpg',atmosphere:0xd06c42}, moon:{hp:220,map:'moon.jpg',atmosphere:0x8d9bab},
 jupiter:{hp:450,map:'jupiter.jpg',atmosphere:0xe3ab75}, neptune:{hp:360,map:'neptune.jpg',atmosphere:0x477aff}
};
const WEAPONS={
 meteor:{damage:18,delay:.70,duration:1.5,cooldown:.30,color:0xff8f42},
 laser:{damage:11,delay:.10,duration:.65,cooldown:.20,color:0x64ebee},
 moon:{damage:36,delay:1.0,duration:1.8,cooldown:.85,color:0xffd69a},
 blackhole:{damage:43,delay:1.10,duration:3.0,cooldown:1.0,color:0xac8dff},
 supernova:{damage:57,delay:.85,duration:2.0,cooldown:1.0,color:0xffc773},
 shower:{damage:9,delay:.72,duration:1.40,cooldown:1.25,color:0xffb06d},
 railgun:{damage:31,delay:.65,duration:1.25,cooldown:.85,color:0xbca0ff},
 cryo:{damage:7,delay:.84,duration:1.65,cooldown:.72,color:0x9aefff},
 drill:{damage:8,delay:.60,duration:2.25,cooldown:1.20,color:0xffa04a}
};
function makeFragments() {
  const random = seededRandom(7614);
  const arrays = { position: [], normal: [], uv: [], aCenter: [], aAxis: [], aSpeed: [], aSpin: [], aEdge: [] };
  const base = new THREE.IcosahedronGeometry(1, 2);
  const positions = base.getAttribute('position');
  const subdivisions = 5;
  const uvFor = p => [((Math.atan2(p.z, -p.x) / TAU) % 1 + 1) % 1, Math.asin(Math.max(-1, Math.min(1, p.y))) / Math.PI + 0.5];
  for (let face = 0; face < positions.count; face += 3) {
    const corners = [0, 1, 2].map(i => {
      const p = new THREE.Vector3().fromBufferAttribute(positions, face + i);
      // A continuous perturbation preserves shared patch boundaries.
      p.add(new THREE.Vector3(Math.sin(p.y*37+p.z*19), Math.sin(p.z*29+p.x*23), Math.sin(p.x*31+p.y*17)).multiplyScalar(0.031));
      return p.normalize();
    });
    const center = corners[0].clone().add(corners[1]).add(corners[2]).normalize().multiplyScalar(0.96);
    const centerU = uvFor(center.clone().normalize())[0];
    const axis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    const speed = 1.1 + random() * 2.65, spin = (random() - 0.5) * 5.6;
    const point = (i, j) => corners[0].clone().multiplyScalar(1 - (i + j) / subdivisions).addScaledVector(corners[1], i / subdivisions).addScaledVector(corners[2], j / subdivisions).normalize();
    function vertex(direction, radius, edge, faceNormal) {
      const p = direction.clone().multiplyScalar(radius);
      const n = faceNormal || direction.clone().multiplyScalar(radius < 1 ? -1 : 1);
      const uv = uvFor(direction);
      if (uv[0] - centerU > 0.5) uv[0] -= 1;
      if (uv[0] - centerU < -0.5) uv[0] += 1;
      arrays.position.push(p.x,p.y,p.z); arrays.normal.push(n.x,n.y,n.z); arrays.uv.push(...uv);
      arrays.aCenter.push(center.x,center.y,center.z); arrays.aAxis.push(axis.x,axis.y,axis.z);
      arrays.aSpeed.push(speed); arrays.aSpin.push(spin); arrays.aEdge.push(edge);
    }
    function triangle(a,b,c) {
      for(const p of [a,b,c]) vertex(p,1,0);
      for(const p of [c,b,a]) vertex(p,0.925,1);
    }
    for(let i=0;i<subdivisions;i++) for(let j=0;j<subdivisions-i;j++) {
      triangle(point(i,j),point(i+1,j),point(i,j+1));
      if(i+j<subdivisions-1) triangle(point(i+1,j),point(i+1,j+1),point(i,j+1));
    }
    for(let edge=0;edge<3;edge++) {
      const a=corners[edge], b=corners[(edge+1)%3];
      const normal=new THREE.Vector3().crossVectors(a,b).normalize();
      for(let i=0;i<subdivisions;i++) {
        const p=a.clone().lerp(b,i/subdivisions).normalize();
        const q=a.clone().lerp(b,(i+1)/subdivisions).normalize();
        for(const [v,r] of [[p,1],[q,1],[p,.925],[q,1],[q,.925],[p,.925]]) vertex(v,r,1,normal);
      }
    }
  }
  base.dispose();
  const geometry = new THREE.BufferGeometry();
  for (const [key, values] of Object.entries(arrays)) {
    geometry.setAttribute(key, new THREE.Float32BufferAttribute(values, key === 'uv' ? 2 : key === 'aSpeed' || key === 'aSpin' || key === 'aEdge' ? 1 : 3));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function makeStars() {
  const random = seededRandom(2642026), position = [], color = [], size = [];
  for (let i = 0; i < 1400; i++) {
    const z = random() * 2 - 1, phi = random() * TAU, radius = 22 + random() * 30;
    const r = Math.sqrt(1 - z * z);
    position.push(r * Math.cos(phi) * radius, z * radius, r * Math.sin(phi) * radius);
    const warmth = random();
    color.push(0.52 + warmth * 0.34, 0.63 + warmth * 0.23, 0.84 + warmth * 0.13);
    size.push(0.65 + Math.pow(random(), 5) * 1.4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: `attribute float aSize; varying vec3 vColor; uniform float uPixelRatio;
      void main(){vColor=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uPixelRatio;}`,
    fragmentShader: `varying vec3 vColor; void main(){float d=length(gl_PointCoord-0.5);float a=1.0-smoothstep(0.1,0.5,d);gl_FragColor=vec4(vColor,a*0.65);}`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

const lavaNoiseGLSL=/* glsl */`
 float lavaHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float lavaNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(lavaHash(i),lavaHash(i+vec3(1,0,0)),f.x),mix(lavaHash(i+vec3(0,1,0)),lavaHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(lavaHash(i+vec3(0,0,1)),lavaHash(i+vec3(1,0,1)),f.x),mix(lavaHash(i+vec3(0,1,1)),lavaHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
const craterGLSL=/* glsl */`
 float craterField(vec3 direction,vec4 scar){
  vec3 center=scar.xyz;vec3 tangent=normalize(cross(abs(center.y)>.85?vec3(1.,0.,0.):vec3(0.,1.,0.),center));vec3 bitangent=cross(center,tangent);vec3 delta=direction-center;
  float angle=atan(dot(delta,bitangent),dot(delta,tangent));float seed=dot(center,vec3(23.37,47.79,13.21));
  float shape=1.+.13*sin(angle*3.+seed)+.078*sin(angle*7.-seed*1.6)+.037*sin(angle*11.+seed*.7);
  return length(delta)/max(.001,scar.w*shape);
 }
`;
const surfaceVertex=/* glsl */`
 varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vLocal; varying float vEdge;
 uniform vec4 uScars[32];uniform float uScarDepth[32];uniform float uDestruction;
 ${craterGLSL}
 #ifdef FRACTURED
 attribute vec3 aCenter; attribute vec3 aAxis; attribute float aSpeed; attribute float aSpin; attribute float aEdge; uniform float uBreak; uniform float uCollapse; uniform vec3 uAttractor;
 mat3 turn(vec3 a,float n){float c=cos(n),s=sin(n),t=1.-c;return mat3(t*a.x*a.x+c,t*a.x*a.y+s*a.z,t*a.x*a.z-s*a.y,t*a.x*a.y-s*a.z,t*a.y*a.y+c,t*a.y*a.z+s*a.x,t*a.x*a.z+s*a.y,t*a.y*a.z-s*a.x,t*a.z*a.z+c);}
 #endif
 void main(){vUv=uv;vLocal=normalize(position);vec3 p=position;vec3 n=normal;vEdge=0.;
 float dent=0.,lip=0.;for(int i=0;i<32;i++){if(uScars[i].w>.001){float d=craterField(vLocal,uScars[i]);dent=max(dent,(1.-smoothstep(.15,1.,d))*uScarDepth[i]);lip=max(lip,(1.-smoothstep(.035,.17,abs(d-.94)))*uScarDepth[i]*.10);}}
 p+=normalize(p)*(lip-min(dent,.24));
 #ifdef FRACTURED
 float travel=pow(uBreak,.83);mat3 rot=turn(aAxis,travel*aSpin);p=rot*(p-aCenter)+aCenter+normalize(aCenter)*travel*aSpeed;p+=cross(normalize(aCenter),aAxis)*travel*travel*.13;
 if(uCollapse>.5){vec3 radial=aCenter-normalize(uAttractor)*dot(aCenter,normalize(uAttractor));vec3 swirl=cross(normalize(uAttractor),radial);vec3 curling=radial*cos(travel*5.+aSpeed)+swirl*sin(travel*5.+aSpeed);p=rot*(position-aCenter)*(1.-travel*.92)+mix(aCenter,uAttractor,travel*.94)+curling*sin(travel*3.14159)*.58;}
 n=rot*n;vEdge=aEdge;
 #endif
 vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*n);gl_Position=projectionMatrix*viewMatrix*world;}
`;
const surfaceFragment=/* glsl */`
 uniform sampler2D uDay;uniform sampler2D uNight;uniform sampler2D uOcean;uniform float uEarth;
 uniform vec3 uSun;uniform vec4 uScars[32];uniform float uScarHeat[32];uniform float uScarCut[32];uniform float uDestruction;uniform float uBreak;uniform float uSolarPulse;uniform float uColdBreak;uniform float uFrost;uniform vec4 uFrostPatches[8];
 varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vLocal;varying float vEdge;
 ${craterGLSL}${lavaNoiseGLSL}
 vec2 hash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
 float edge(vec2 p){vec2 ip=floor(p),fp=fract(p);float first=8.,second=8.;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 o=vec2(float(x),float(y));vec2 r=o+hash2(ip+o)-fp;float d=dot(r,r);if(d<first){second=first;first=d;}else if(d<second){second=d;}}}return sqrt(second)-sqrt(first);}
 void main(){vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);float craterMask=0.;
 for(int i=0;i<32;i++){if(uScars[i].w>.001){float d=craterField(normalize(vLocal),uScars[i]);if(vEdge<.5&&uScarCut[i]>.001&&d<uScarCut[i])discard;craterMask=max(craterMask,1.-smoothstep(.8,1.16,d));}}
 vec3 geometric=normalize(cross(dFdx(vWorld),dFdy(vWorld)));if(dot(geometric,N)<0.)geometric=-geometric;N=normalize(mix(N,geometric,craterMask*.96));
 float nd=dot(N,uSun);float light=.085+.915*pow(max(nd,0.),.65);vec3 tex=texture2D(uDay,vUv).rgb;float water=texture2D(uOcean,vUv).r*uEarth;
 vec3 base=mix(tex*1.32,mix(tex*vec3(.72,1.15,1.60),vec3(.006,.046,.125),.20),water);
 vec3 color=base*light;color+=vec3(.36,.61,.94)*pow(max(dot(N,normalize(V+uSun)),0.),75.)*water*.38*(1.-craterMask);
 color+=texture2D(uNight,vUv).rgb*vec3(1.5,1.04,.59)*(1.-smoothstep(-.08,.18,nd))*uEarth*(1.-uDestruction)*(1.-craterMask);
 for(int i=0;i<32;i++){if(uScars[i].w>.001){float d=craterField(normalize(vLocal),uScars[i]);float scorch=1.-smoothstep(.75,1.18,d);float cut=uScarCut[i];float grain=.5+.5*sin(vLocal.x*147.+sin(vLocal.z*113.)*2.)*sin(vLocal.y*129.+vLocal.z*31.);
 color=mix(color,color*.12+vec3(.017,.009,.006)*(light+.24),scorch*.94);
 float exposed=(1.-smoothstep(cut+.10,cut+.27,d))*smoothstep(cut+.015,cut+.065,d);
 float fissure=(1.-smoothstep(.02,.095,abs(d-.83)))*.10;
 color+=vec3(2.15,.245,.010)*(exposed+fissure)*(.16+uScarHeat[i]*.55)*(.40+grain*.60);
 }}
 if(uDestruction>.005){float edges=edge(vUv*vec2(26.,13.)+sin(vUv.yx*49.)*.12);float crack=1.-smoothstep(.012,.035+uDestruction*.035,edges);color+=vec3(2.7,.39,.01)*crack*uDestruction;
 color=mix(color,vec3(.27,.035,.004)+color*.7,smoothstep(.25,.95,uDestruction)*.58);float grain=.5+.5*sin(vLocal.x*93.)*sin(vLocal.y*111.+vLocal.z*53.);vec3 inner=vec3(.19,.015,.002)+vec3(1.0,.15,.007)*grain*.75;color=mix(color,inner,vEdge*.94);}
 float freeze=0.;if(uFrost>.001){for(int i=0;i<8;i++){if(uFrostPatches[i].w>.001){float d=distance(normalize(vLocal),uFrostPatches[i].xyz);freeze=max(freeze,1.-smoothstep(uFrostPatches[i].w*.35,uFrostPatches[i].w,d));}}freeze*=min(1.,uFrost*2.2)*(1.-smoothstep(.1,.7,uDestruction));
 float frostNoise=lavaNoise(normalize(vLocal)*72.);float crystal=1.-smoothstep(.016,.115,abs(frostNoise-.51));vec3 ice=vec3(.20,.49,.65)*(light+.35)+vec3(.48,.82,1.0)*crystal*.38;color=mix(color,ice,freeze*.84);color+=vec3(.3,.65,.8)*pow(max(dot(N,normalize(V+uSun)),0.),40.)*freeze*.44;}
 float warmRim=pow(1.-max(dot(N,V),0.),2.8);color=mix(color,color*vec3(1.18,.81,.59)+vec3(.12,.017,.001),uSolarPulse*.48);color+=vec3(.55,.11,.008)*warmRim*uSolarPulse*.50;
 color=mix(color,vec3(.035,.15,.23)+color*vec3(.20,.69,1.02),uColdBreak*uDestruction);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }
`;
const shellVertex=/* glsl */`varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;void main(){vUv=uv;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`;

/** Fictional interactive planet sandbox. No physical forecasts are implied. */
export async function createSandboxScene(host,{onReady=()=>{},onError=()=>{},onStats=()=>{},onImpact=()=>{},onDestroyed=()=>{},onLaunch=()=>{}}={}){
 if(!host)throw new Error('A renderer host is required.');
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch(error){onError(error);throw error;}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 const canvas=renderer.domElement;canvas.className='sandbox-canvas';canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline:none';canvas.setAttribute('aria-label','Interactive planet. Click or tap to strike. Drag to orbit and scroll to zoom.');canvas.setAttribute('role','img');host.appendChild(canvas);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.08,100);camera.position.set(0,.16,3.70);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.rotateSpeed=.58;controls.minDistance=2.4;controls.maxDistance=8;controls.zoomSpeed=.75;
 const planet=new THREE.Group();planet.rotation.y=-Math.PI*.57;planet.rotation.z=.055;scene.add(planet);
 const directional=new THREE.DirectionalLight(0xffead2,3.5);directional.position.set(-3,3,4);scene.add(directional,new THREE.AmbientLight(0x8aa5ca,1.5));
 let disposed=false,contextLost=false,frame=0,lastTime=0,elapsed=0,statsTime=0,timeScale=1,reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let planetId='earth',weaponId='meteor',power=.55,integrity=100,health=300,maxHealth=300,heat=0,frost=0,frostIndex=0,impacts=0,destruction=0,destroying=false,destroyed=false,lastFire=-100,scarIndex=0,particleIndex=0,finisher=null,solarFlash=0,totalChips=0,chipIndex=0;
 let dragging=false,pointerStart=null,moveDistance=0,multiTouch=false;const pointers=new Set();
 const loader=new THREE.TextureLoader(),textures={},loaded=[];
 async function texture(file,srgb=false){const t=await loader.loadAsync('./assets/'+file);t.wrapS=THREE.RepeatWrapping;t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=Math.min(6,renderer.capabilities.getMaxAnisotropy());loaded.push(t);return t;}
 try{const entries=await Promise.all(Object.entries(PLANETS).map(async([id,p])=>[id,await texture(p.map,true)]));for(const[id,t]of entries)textures[id]=t;
 [textures.night,textures.ocean,textures.clouds]=await Promise.all([texture('earth-night.png',true),texture('earth-ocean.jpg'),texture('earth-clouds.png')]);
 }catch(error){loaded.forEach(t=>t.dispose());controls.dispose();renderer.dispose();canvas.remove();onError(error);throw error;}
 const uniforms={uDay:{value:textures.earth},uNight:{value:textures.night},uOcean:{value:textures.ocean},uEarth:{value:1},uSun:{value:new THREE.Vector3(-.75,.43,.83).normalize()},uScars:{value:Array.from({length:MAX_SCARS},()=>new THREE.Vector4(0,0,0,0))},uScarHeat:{value:new Float32Array(MAX_SCARS)},uScarDepth:{value:new Float32Array(MAX_SCARS)},uScarCut:{value:new Float32Array(MAX_SCARS)},uDestruction:{value:0},uBreak:{value:0},uSolarPulse:{value:0},uColdBreak:{value:0},uFrost:{value:0},uFrostPatches:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,0,0))},uCollapse:{value:0},uAttractor:{value:new THREE.Vector3(0,0,1.52)}};
 const frostRadii=new Float32Array(8);
 const surfaceMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:surfaceVertex,fragmentShader:surfaceFragment.replace('vec4(color,1.);#include','vec4(color,1.);\n #include')});
 const surface=new THREE.Mesh(new THREE.SphereGeometry(1,160,96),surfaceMaterial);planet.add(surface);
 const fragmentMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:surfaceVertex,fragmentShader:surfaceMaterial.fragmentShader,defines:{FRACTURED:''},side:THREE.DoubleSide});
 const fragments=new THREE.Mesh(makeFragments(),fragmentMaterial);fragments.frustumCulled=false;fragments.visible=false;planet.add(fragments);
 const cloudUniforms={uClouds:{value:textures.clouds},uSun:uniforms.uSun,uShift:{value:0},uOpacity:{value:.78},uScars:uniforms.uScars};
 const cloudMaterial=new THREE.ShaderMaterial({uniforms:cloudUniforms,vertexShader:shellVertex,fragmentShader:`${craterGLSL} uniform vec4 uScars[32];uniform sampler2D uClouds;uniform vec3 uSun;uniform float uShift;uniform float uOpacity;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;void main(){vec4 c=texture2D(uClouds,vec2(vUv.x+uShift,vUv.y));float l=.065+max(dot(normalize(vNormal),uSun),0.)*.935;float cover=1.;vec3 local=vec3(-cos(vUv.x*6.2831853)*sin(vUv.y*3.14159265),-cos(vUv.y*3.14159265),sin(vUv.x*6.2831853)*sin(vUv.y*3.14159265));for(int i=0;i<32;i++){if(uScars[i].w>.001)cover*=smoothstep(.85,1.28,craterField(local,uScars[i]));}gl_FragColor=vec4(vec3(.78,.87,1.)*l,pow(c.a,1.55)*uOpacity*cover);}`,transparent:true,depthWrite:false});
 const clouds=new THREE.Mesh(new THREE.SphereGeometry(1.008,80,40),cloudMaterial);planet.add(clouds);
 const atmosphereUniforms={uColor:{value:new THREE.Color(0x508fff)},uOpacity:{value:.65},uSun:uniforms.uSun,uSolarPulse:uniforms.uSolarPulse,uFrost:uniforms.uFrost};
 const atmosphereMaterial=new THREE.ShaderMaterial({uniforms:atmosphereUniforms,vertexShader:shellVertex,fragmentShader:`uniform vec3 uColor;uniform float uOpacity;uniform vec3 uSun;uniform float uSolarPulse;uniform float uFrost;varying vec3 vNormal;varying vec3 vWorld;void main(){vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);float rim=pow(1.-abs(dot(n,v)),3.0);vec3 tint=mix(mix(uColor,vec3(.25,.88,1.),uFrost*.72),vec3(1.,.34,.065),uSolarPulse*.9);gl_FragColor=vec4(tint,rim*(uOpacity+uSolarPulse*.16)*(.38+max(dot(n,uSun),0.)*.62));}`,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending});
 const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.038,80,40),atmosphereMaterial);planet.add(atmosphere);
 const coreUniforms={uTime:{value:0},uColdBreak:uniforms.uColdBreak};
 const coreMaterial=new THREE.ShaderMaterial({uniforms:coreUniforms,vertexShader:shellVertex,fragmentShader:`uniform float uTime;uniform float uColdBreak;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;void main(){float n=sin(vUv.x*71.+sin(vUv.y*45.+uTime)*2.)*sin(vUv.y*48.-uTime*.7);float f=max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);vec3 c=mix(vec3(.65,.035,.001),vec3(3.2,.73,.03),f*(.74+n*.22));c=mix(c,vec3(.025,.13,.22)+c*vec3(.11,.58,1.),uColdBreak);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
 const core=new THREE.Mesh(new THREE.SphereGeometry(.86,64,32),coreMaterial);core.visible=false;planet.add(core);
 const innerMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:shellVertex,fragmentShader:`uniform vec3 uSun;uniform vec4 uScars[32];uniform float uScarHeat[32];varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;${craterGLSL}${lavaNoiseGLSL}void main(){vec3 n=normalize(vNormal);vec3 local=vec3(-cos(vUv.x*6.2831853)*sin(vUv.y*3.14159265),-cos(vUv.y*3.14159265),sin(vUv.x*6.2831853)*sin(vUv.y*3.14159265));float hot=.12;for(int i=0;i<32;i++){if(uScars[i].w>.001)hot=max(hot,(1.-smoothstep(.25,1.3,craterField(local,uScars[i])))*(.27+uScarHeat[i]*.65));}float noise=(lavaNoise(local*39.)+lavaNoise(local*83.)*.45)/1.45;float vein=pow(1.-smoothstep(.018,.14,abs(noise-.53)),1.5);float l=.15+max(dot(n,uSun),0.)*.85;vec3 c=vec3(.033,.009,.005)*l+mix(vec3(.16,.012,.001),vec3(1.75,.25,.007),vein)*hot;gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
 const underCrust=new THREE.Mesh(new THREE.SphereGeometry(.80,96,64),innerMaterial);planet.add(underCrust);
 const stars=makeStars();stars.material.uniforms.uPixelRatio.value=renderer.getPixelRatio();scene.add(stars);
 const particlePositions=new Float32Array(MAX_PARTICLES*3),particleColors=new Float32Array(MAX_PARTICLES*3),particleSizes=new Float32Array(MAX_PARTICLES),particleAlphas=new Float32Array(MAX_PARTICLES);
 const particles=Array.from({length:MAX_PARTICLES},()=>({active:false,p:new THREE.Vector3(),v:new THREE.Vector3(),life:0,age:0,size:0,drag:.985,color:new THREE.Color()}));
 const particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));particleGeometry.setAttribute('color',new THREE.BufferAttribute(particleColors,3));particleGeometry.setAttribute('aSize',new THREE.BufferAttribute(particleSizes,1));particleGeometry.setAttribute('aAlpha',new THREE.BufferAttribute(particleAlphas,1));
 const particleMaterial=new THREE.ShaderMaterial({uniforms:{uRatio:{value:renderer.getPixelRatio()}},vertexShader:`attribute float aSize;attribute float aAlpha;uniform float uRatio;varying vec3 vColor;varying float vAlpha;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uRatio*80./max(1.,-mv.z),0.,32.);vColor=color;vAlpha=aAlpha;}`,fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);float a=pow(max(0.,1.-d*2.),1.5);gl_FragColor=vec4(vColor,a*vAlpha);}`,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
 const particleMesh=new THREE.Points(particleGeometry,particleMaterial);particleMesh.frustumCulled=false;scene.add(particleMesh);
 const CHIP_CAPACITY=144;
 const chipGeometry=new THREE.IcosahedronGeometry(1,0);const chipPositions=chipGeometry.getAttribute('position');const chipFaces=new Float32Array(chipPositions.count);
 for(let i=0;i<chipPositions.count;i++){const x=chipPositions.getX(i),y=chipPositions.getY(i),z=chipPositions.getZ(i),warp=1+Math.sin(x*17+y*13+z*23)*.12;chipPositions.setXYZ(i,x*warp,y*warp*.63,z*warp*.82);chipFaces[i]=Math.floor(i/3)%4===0?1:0;}
 chipGeometry.computeVertexNormals();chipGeometry.setAttribute('aInnerFace',new THREE.BufferAttribute(chipFaces,1));
 const chipUvs=new Float32Array(CHIP_CAPACITY*2),chipHeats=new Float32Array(CHIP_CAPACITY),chipIce=new Float32Array(CHIP_CAPACITY);chipGeometry.setAttribute('aChipUv',new THREE.InstancedBufferAttribute(chipUvs,2));chipGeometry.setAttribute('aChipHeat',new THREE.InstancedBufferAttribute(chipHeats,1));chipGeometry.setAttribute('aChipIce',new THREE.InstancedBufferAttribute(chipIce,1));
 const chipMaterial=new THREE.ShaderMaterial({uniforms:{uDay:uniforms.uDay,uSun:uniforms.uSun},vertexShader:`attribute float aInnerFace;attribute vec2 aChipUv;attribute float aChipHeat;attribute float aChipIce;varying float vIce;varying vec2 vChipUv;varying float vInner;varying float vHeat;varying vec3 vN;void main(){vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix*instanceMatrix)*normal);vChipUv=aChipUv+uv*.028;vInner=aInnerFace;vHeat=aChipHeat;vIce=aChipIce;gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`uniform sampler2D uDay;uniform vec3 uSun;varying float vIce;varying vec2 vChipUv;varying float vInner;varying float vHeat;varying vec3 vN;void main(){float light=.14+max(dot(normalize(vN),uSun),0.)*.86;vec3 crust=texture2D(uDay,vChipUv).rgb*1.4+vec3(.022,.014,.009);vec3 hot=vec3(.065,.015,.008)+vec3(1.45,.21,.009)*vHeat;vec3 color=mix(crust*light,hot,vInner);vec3 ice=mix(vec3(.06,.25,.38),vec3(.70,1.05,1.30),light*.65+vInner*.35);color=mix(color,ice,vIce);gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
 const chipMesh=new THREE.InstancedMesh(chipGeometry,chipMaterial,CHIP_CAPACITY);chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chipMesh.frustumCulled=false;chipMesh.visible=false;scene.add(chipMesh);
 const chips=Array.from({length:CHIP_CAPACITY},()=>({active:false,p:new THREE.Vector3(),v:new THREE.Vector3(),axis:new THREE.Vector3(),spin:0,angle:0,scale:0,age:0,life:0}));const chipDummy=new THREE.Object3D();chipDummy.scale.setScalar(0);chipDummy.updateMatrix();for(let i=0;i<CHIP_CAPACITY;i++)chipMesh.setMatrixAt(i,chipDummy.matrix);
 const effects=[];const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),forward=new THREE.Vector3(),cameraRight=new THREE.Vector3(),cameraUp=new THREE.Vector3();
 const unitZ=new THREE.Vector3(0,0,1),unitY=new THREE.Vector3(0,1,0),tempV=new THREE.Vector3();
 function safeCallback(callback,data){try{callback(data);}catch(error){console.warn('Sandbox callback failed:',error);}}
 function stats(force=false){if(!force&&elapsed-statsTime<.10)return;statsTime=elapsed;safeCallback(onStats,{integrity:Math.round(integrity*10)/10,health:Math.round(health*10)/10,maxHealth,frost:Math.round(frost*100),heat:Math.round(heat*100),impacts,fragments:totalChips+(destruction>1?180:0),status:destroyed?'destroyed':destroying?'destroying':impacts?'active':'ready',planet:planetId,weapon:weaponId,finisher});}
 function spawnParticles(origin,normal,count,color,force=1,life=1.7){const tint=new THREE.Color(color);for(let i=0;i<count;i++){const p=particles[particleIndex++%MAX_PARTICLES];p.active=true;p.p.copy(origin);p.v.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(.12+Math.random()*force);p.v.addScaledVector(normal,.30+Math.random()*force*.55);p.age=0;p.life=life*(.5+Math.random());p.size=.035+Math.random()*.11;p.color.copy(tint).lerp(new THREE.Color(0xffecd2),Math.random()*.6);p.drag=.988;}}
 function spawnChips(a,radius,ice=false,amountScale=1){const multiplier=a.id==='moon'?1.65:a.id==='laser'?.48:a.id==='shower'?.60:a.id==='railgun'?.8:a.id==='cryo'?.70:a.id==='drill'?.54:a.id==='blackhole'?.8:1;const count=Math.max(3,Math.round(((a.id==='laser'||a.id==='drill'||a.id==='shower'?8:17)+a.power*(a.id==='moon'?29:a.id==='shower'?11:20))*amountScale));const amount=reducedMotion?Math.ceil(count*.6):count;totalChips+=amount;
 const normal=a.normal.clone(),tangent=new THREE.Vector3().crossVectors(normal,Math.abs(normal.y)>.85?new THREE.Vector3(1,0,0):unitY).normalize(),bitangent=new THREE.Vector3().crossVectors(normal,tangent);
 for(let j=0;j<amount;j++){const index=chipIndex++%CHIP_CAPACITY,c=chips[index],angle=Math.random()*TAU,spread=Math.sqrt(Math.random())*radius*.72;c.active=true;c.p.copy(a.target).addScaledVector(tangent,Math.cos(angle)*spread).addScaledVector(bitangent,Math.sin(angle)*spread);c.v.copy(tangent).multiplyScalar(Math.cos(angle)*(.14+Math.random()*.50)).addScaledVector(bitangent,Math.sin(angle)*(.14+Math.random()*.50)).addScaledVector(normal,(.20+Math.random()*.72)*(.65+a.power));if(a.id==='blackhole')c.v.multiplyScalar(.38);c.axis.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();c.spin=(Math.random()-.5)*5;c.angle=Math.random()*TAU;c.scale=(.018+Math.random()*.035)*multiplier*(.72+a.power*.6);c.age=0;c.life=5.5+Math.random()*3.5;chipUvs[index*2]=((Math.atan2(a.local.z,-a.local.x)/TAU)%1+1)%1+(Math.random()-.5)*radius*.12;chipUvs[index*2+1]=Math.asin(clamp(a.local.y,-1,1))/Math.PI+.5+(Math.random()-.5)*radius*.10;chipHeats[index]=1;chipIce[index]=ice?1:0;}
 chipGeometry.attributes.aChipUv.needsUpdate=true;chipGeometry.attributes.aChipIce.needsUpdate=true;chipMesh.visible=true;}
 function updateChips(dt){let any=false;const holes=effects.filter(a=>a.id==='blackhole');for(let i=0;i<CHIP_CAPACITY;i++){const c=chips[i];if(c.active&&dt>0){c.age+=dt;for(const hole of holes){const direction=hole.meshes.hole.position.clone().sub(c.p),distance=direction.length();if(distance<2.4&&distance>.17)c.v.addScaledVector(direction.normalize(),dt*1.15/(distance+.2));if(distance<.22)c.age=c.life;}if(c.age>=c.life)c.active=false;else{c.p.addScaledVector(c.v,dt);c.v.multiplyScalar(Math.pow(.989,dt*60));c.angle+=c.spin*dt;}}
 if(c.active){any=true;chipDummy.position.copy(c.p);chipDummy.quaternion.setFromAxisAngle(c.axis,c.angle);chipDummy.scale.setScalar(c.scale*(1-smooth(.78,1,c.age/c.life)));chipHeats[i]=Math.max(.08,1-c.age/c.life*.92);}else chipDummy.scale.setScalar(0);chipDummy.updateMatrix();chipMesh.setMatrixAt(i,chipDummy.matrix);}
 chipMesh.visible=any;chipMesh.instanceMatrix.needsUpdate=true;chipGeometry.attributes.aChipHeat.needsUpdate=true;}
 function glowMaterial(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});}
 function beamBetween(mesh,start,end,width){mesh.position.copy(start).add(end).multiplyScalar(.5);const d=end.clone().sub(start);mesh.scale.set(width,d.length(),width);mesh.quaternion.setFromUnitVectors(unitY,d.normalize());}
 function disposeObject(root){root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)m.dispose();}});root.removeFromParent();}
 function makeAttack(id,local,options={}){const shotPower=options.power??power;const spec=WEAPONS[id],group=new THREE.Group();scene.add(group);planet.updateMatrixWorld();const target=planet.localToWorld(local.clone());const normal=target.clone().normalize();camera.getWorldDirection(forward);cameraRight.setFromMatrixColumn(camera.matrixWorld,0);cameraUp.setFromMatrixColumn(camera.matrixWorld,1);
 const start=target.clone().addScaledVector(cameraRight,-1.28).addScaledVector(cameraUp,.52).addScaledVector(forward,-.35);
 const a={id,age:-(options.delay||0),power:shotPower,local:local.clone(),group,target,normal,start,right:cameraRight.clone(),up:cameraUp.clone(),spec,hit:false,meshes:{},trail:0,pulsesDone:0};
 group.visible=a.age>=0;if(id==='shower')a.start.addScaledVector(a.right,(Math.random()-.5)*.50).addScaledVector(a.up,Math.random()*.25);
 if(id==='meteor'||id==='moon'||id==='cryo'||id==='shower'){
 const radius=id==='moon'?.24+shotPower*.14:id==='cryo'?.13+shotPower*.065:id==='shower'?.058+shotPower*.035:.105+shotPower*.06;
 const rock=new THREE.Mesh(id==='moon'?new THREE.SphereGeometry(radius,40,24):new THREE.IcosahedronGeometry(radius,id==='cryo'?1:0),new THREE.MeshStandardMaterial({map:id==='moon'?textures.moon:null,color:id==='cryo'?0x9befff:id==='moon'?0xe8dfd4:0x35291f,roughness:id==='cryo'?.23:.96,metalness:id==='cryo'?.12:0,emissive:id==='cryo'?0x167ea0:id==='moon'?0x030201:0x8d2207,emissiveIntensity:id==='cryo'?.8:id==='moon'?0:1.2}));group.add(rock);a.meshes.rock=rock;
 const halo=new THREE.Mesh(new THREE.SphereGeometry(radius*1.30,24,16),new THREE.ShaderMaterial({uniforms:{uGlow:{value:new THREE.Color(spec.color)}},vertexShader:shellVertex,fragmentShader:`uniform vec3 uGlow;varying vec3 vNormal;varying vec3 vWorld;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),2.5);gl_FragColor=vec4(uGlow,rim*.54);}`,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending}));group.add(halo);a.meshes.halo=halo;
 }else if(id==='laser'||id==='railgun'){
 a.start.copy(target).addScaledVector(cameraRight,-2.0).addScaledVector(cameraUp,1.35).addScaledVector(forward,-1.1);
 if(id==='railgun')a.start.copy(target).addScaledVector(cameraRight,-1.0).addScaledVector(cameraUp,.5).addScaledVector(forward,-.25);
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,10),glowMaterial(spec.color,.86));const center=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,8),glowMaterial(0xd9ffff,1));group.add(beam,center);a.meshes.beam=beam;a.meshes.center=center;
 if(id==='railgun'){const charge=new THREE.Mesh(new THREE.IcosahedronGeometry(.075,2),glowMaterial(0xd5c2ff,.9));group.add(charge);a.meshes.charge=charge;a.meshes.coils=[];for(let i=0;i<3;i++){const coil=new THREE.Mesh(new THREE.TorusGeometry(.09+i*.045,.006,8,48),glowMaterial(i===1?0xffffff:0x9a72ff,.8));group.add(coil);a.meshes.coils.push(coil);}}
 }else if(id==='blackhole'){
 const hole=new THREE.Mesh(new THREE.SphereGeometry(.21+shotPower*.11,40,24),new THREE.MeshBasicMaterial({color:0x000003}));group.add(hole);a.meshes.hole=hole;
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.35+shotPower*.11,.032,12,80),glowMaterial(0xffb576,.92));const ring2=new THREE.Mesh(new THREE.TorusGeometry(.32+shotPower*.10,.012,8,80),glowMaterial(0xaf91ff,.70));group.add(ring,ring2);a.meshes.ring=ring;a.meshes.ring2=ring2;
 const halo=new THREE.Mesh(new THREE.SphereGeometry(.25+shotPower*.13,32,20),new THREE.ShaderMaterial({vertexShader:shellVertex,fragmentShader:`varying vec3 vNormal;varying vec3 vWorld;void main(){float r=pow(1.-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),2.);gl_FragColor=vec4(.53,.30,1.,r*.48);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.BackSide}));group.add(halo);a.meshes.halo=halo;
 }else if(id==='drill'){
 const rig=new THREE.Group();group.add(rig);a.meshes.rig=rig;
 const cone=new THREE.Mesh(new THREE.ConeGeometry(.135+shotPower*.04,.48,12),new THREE.MeshStandardMaterial({color:0x413426,metalness:.75,roughness:.32,emissive:0x852c06,emissiveIntensity:.6}));cone.rotation.z=Math.PI;cone.position.y=-.04;rig.add(cone);
 const collar=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.09,24),new THREE.MeshStandardMaterial({color:0x8b929d,metalness:.9,roughness:.25}));collar.position.y=.24;rig.add(collar);
 for(let i=0;i<4;i++){const band=new THREE.Mesh(new THREE.TorusGeometry(.055+i*.028,.012,8,36),glowMaterial(i%2?0xff8b36:0xffcd85,.85));band.rotation.x=Math.PI/2;band.position.y=-.20+i*.10;rig.add(band);}
 a.meshes.bores=[];for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.94,1,64),glowMaterial(0xff913a,.0));ring.material.side=THREE.DoubleSide;group.add(ring);a.meshes.bores.push(ring);}
 }else{
 const sun=new THREE.Mesh(new THREE.SphereGeometry(.26+shotPower*.10,40,24),new THREE.ShaderMaterial({uniforms:{uAge:{value:0},uAlpha:{value:1}},vertexShader:shellVertex,fragmentShader:`uniform float uAge;uniform float uAlpha;varying vec3 vNormal;varying vec3 vWorld;void main(){vec3 n=normalize(vNormal);float face=max(dot(n,normalize(cameraPosition-vWorld)),0.);float grain=sin(n.x*87.+sin(n.z*61.+uAge)*3.)*sin(n.y*79.+sin(n.x*53.)*2.);float swirl=.5+.5*sin(n.z*31.+sin(n.y*37.)*1.5+uAge);vec3 color=mix(vec3(1.05,.105,.003),vec3(3.5,1.25,.12),face*.52+.15+grain*.13+swirl*.15);gl_FragColor=vec4(color,uAlpha);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,transparent:true,depthWrite:false}));group.add(sun);a.meshes.sun=sun;
 const corona=new THREE.Mesh(new THREE.SphereGeometry(.39+shotPower*.15,32,20),new THREE.ShaderMaterial({uniforms:{uAge:{value:0}},vertexShader:shellVertex,fragmentShader:`uniform float uAge;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;void main(){float r=pow(1.-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),1.6);float f=.7+.3*sin(vUv.x*70.+sin(vUv.y*42.+uAge*8.));gl_FragColor=vec4(1.,.34,.035,r*f*.7);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));group.add(corona);a.meshes.corona=corona;
 const wave=new THREE.Mesh(new THREE.RingGeometry(.974,1,96),new THREE.MeshBasicMaterial({color:0xffb64a,side:THREE.DoubleSide,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));group.add(wave);a.meshes.wave=wave;
 }
 effects.push(a);return a;}
 function impact(a){if(a.hit||health<=0)return;a.hit=true;planet.updateMatrixWorld();a.target.copy(a.local).applyMatrix4(planet.matrixWorld);a.normal.copy(a.target).normalize();
 const physical=['meteor','moon','shower','railgun','drill'].includes(a.id);let bonus;
 let damage=a.spec.damage*(.55+a.power*1.3);
 if(physical&&frost>.04){damage*=1+.75*frost;bonus='shatter';a.shatter=true;frost=0;uniforms.uFrost.value=0;frostRadii.fill(0);uniforms.uFrostPatches.value.forEach(v=>v.set(0,0,0,0));}
 damage=Math.min(health,damage);health=Math.max(0,health-damage);if(health<.000001)health=0;integrity=health/maxHealth*100;impacts++;
 if(a.id==='cryo'){frost=Math.min(1,frost+.30+a.power*.40);uniforms.uFrost.value=frost;const index=frostIndex++%8;uniforms.uFrostPatches.value[index].set(a.local.x,a.local.y,a.local.z,.07);frostRadii[index]=.62+a.power*.37;heat=Math.max(0,heat-.24-a.power*.20);for(let i=0;i<MAX_SCARS;i++)uniforms.uScarHeat.value[i]*=.68;}
 else{heat=Math.min(1,heat+damage/maxHealth*2.25);if(a.id==='supernova')frost=Math.max(0,frost-.30);}
 const radius=(a.id==='laser'?.095:a.id==='railgun'?.105:a.id==='drill'?.085+a.pulsesDone*.015:a.id==='shower'?.095:a.id==='meteor'?.14:a.id==='moon'?.27:a.id==='blackhole'?.30:a.id==='cryo'?.20:.42)*(.70+a.power*.75);
 if(a.id!=='cryo'){const idx=a.id==='drill'&&a.scarSlot!==undefined?a.scarSlot:scarIndex++%MAX_SCARS;if(a.id==='drill')a.scarSlot=idx;uniforms.uScars.value[idx].set(a.local.x,a.local.y,a.local.z,radius);uniforms.uScarHeat.value[idx]=1;uniforms.uScarDepth.value[idx]=Math.min(.26,.085+radius*.32+(a.id==='drill'?a.pulsesDone*.021:0));uniforms.uScarCut.value[idx]=a.id==='laser'?(a.power>.65?.23:0):a.id==='railgun'?.53:a.id==='drill'?.20+a.pulsesDone*.052:a.id==='meteor'||a.id==='shower'?.30+a.power*.21:a.id==='moon'?.41+a.power*.20:a.id==='blackhole'?.53:.43;}
 const ring=new THREE.Mesh(new THREE.RingGeometry(.88,1,64),glowMaterial(a.spec.color,.9));ring.material.side=THREE.DoubleSide;ring.position.copy(a.target).multiplyScalar(1.018);ring.quaternion.setFromUnitVectors(unitZ,a.normal);ring.scale.setScalar(.035);scene.add(ring);
 const flash=new THREE.Mesh(new THREE.SphereGeometry(a.id==='drill'?.06:.13,20,12),glowMaterial(a.id==='cryo'||bonus?0xc6f8ff:a.id==='railgun'?0xe3d6ff:0xffe2a5,1));flash.position.copy(a.target);scene.add(flash);
 effects.push({id:'shock',age:0,duration:a.id==='drill'?.60:1.2,group:ring,flash,target:a.target.clone(),normal:a.normal.clone(),radius,power:a.power});
 spawnParticles(a.target,a.normal,reducedMotion?20:a.id==='drill'?35:70,a.spec.color,.45+a.power*1.25,2.1);spawnChips(a,radius,a.id==='cryo');if(bonus){spawnChips(a,radius*1.15,true,.72);spawnParticles(a.target,a.normal,reducedMotion?25:85,0x9cf0ff,.9+a.power,2.4);}
 if(!reducedMotion)shake=Math.max(shake,(a.id==='drill'?.004:.008)+a.power*.021+(bonus?.012:0));
 safeCallback(onImpact,{weapon:a.id,power:a.power,damage:Math.round(damage*10)/10,integrity:Math.round(integrity),health:Math.round(health*10)/10,maxHealth,bonus,frost:Math.round(frost*100),pulse:a.id==='drill'?a.pulsesDone+1:undefined});
 if(a.id==='supernova')solarFlash=Math.max(solarFlash,.78+a.power*.22);
 if(health<=0){destroying=true;destruction=0;finisher=a.id;heat=a.id==='cryo'?0:1;uniforms.uColdBreak.value=a.id==='cryo'?1:0;if(a.id==='blackhole'){a.persistent=true;uniforms.uCollapse.value=1;uniforms.uAttractor.value.copy(a.local).multiplyScalar(1.52);}}
 stats(true);}
 function fire(local){const required=weaponId==='shower'?5:1;if(disposed||contextLost||destroying||destroyed||timeScale===0||effects.filter(a=>a.id!=='shock').length+required>12)return false;const now=performance.now()/1000;if(now-lastFire<WEAPONS[weaponId].cooldown)return false;lastFire=now;
 safeCallback(onLaunch,{weapon:weaponId,power});
 if(weaponId==='shower'){const tangent=new THREE.Vector3().crossVectors(local,Math.abs(local.y)>.85?new THREE.Vector3(1,0,0):unitY).normalize(),bitangent=new THREE.Vector3().crossVectors(local,tangent);for(let i=0;i<5;i++){const angle=i*TAU/5+Math.random()*.45,radius=i===0?0:.12+power*.15;const target=local.clone().addScaledVector(tangent,Math.cos(angle)*radius).addScaledVector(bitangent,Math.sin(angle)*radius).normalize();makeAttack('shower',target,{power,delay:i*.17});}}
 else makeAttack(weaponId,local);requestRender();return true;}
 function fireAtCenter(){if(surface.visible){planet.updateMatrixWorld();const local=camera.position.clone().normalize();planet.worldToLocal(local);return fire(local.normalize());}return false;}
 let shake=0;const cameraJitter=new THREE.Vector3();
 function updateEffects(dt){for(let i=effects.length-1;i>=0;i--){const a=effects[i];a.age+=dt;if(a.id==='shock'){const p=clamp(a.age/a.duration);a.group.scale.setScalar(.06+p*(.65+a.radius*1.5));a.group.material.opacity=Math.pow(1-p,2)*.8;a.flash.scale.setScalar(.65+p*4);a.flash.material.opacity=Math.pow(1-p,5);if(p>=1){disposeObject(a.group);disposeObject(a.flash);effects.splice(i,1);}continue;}
 a.group.visible=a.age>=0;if(a.age<0)continue;planet.updateMatrixWorld();a.target.copy(a.local).applyMatrix4(planet.matrixWorld);a.normal.copy(a.target).normalize();const p=clamp(a.age/a.spec.delay);const m=a.meshes;
 if(a.id==='meteor'||a.id==='moon'||a.id==='cryo'||a.id==='shower'){
 const move=p*p*(2-p);m.rock.position.copy(a.start).lerp(a.target,move);m.rock.rotation.x+=dt*2;m.rock.rotation.y+=dt*1.7;m.halo.position.copy(m.rock.position);m.rock.visible=m.halo.visible=!a.hit;m.halo.scale.setScalar(1+Math.sin(a.age*25)*.1);
 if(!a.hit&&dt>0){a.trail+=dt;while(a.trail>.025){a.trail-=.025;const normal=a.start.clone().sub(a.target).normalize();spawnParticles(m.rock.position,normal,a.id==='cryo'?7:a.id==='meteor'?5:a.id==='shower'?3:2,a.spec.color,.08,.48);}}
 }else if(a.id==='laser'){
 const width=(.011+a.power*.018)*Math.sin(clamp(a.age/a.spec.duration)*Math.PI);beamBetween(m.beam,a.start,a.target,width*2.3);beamBetween(m.center,a.start,a.target,width*.60);m.beam.material.opacity=.38+Math.sin(a.age*60)*.15;
 }else if(a.id==='railgun'){
 const charge=smooth(0,a.spec.delay,a.age)*(1-smooth(a.spec.delay,a.spec.delay+.16,a.age));m.charge.position.copy(a.start);m.charge.scale.setScalar(.10+charge*2.1);m.charge.material.opacity=.30+charge*.65;
 const axis=a.target.clone().sub(a.start).normalize();for(let j=0;j<m.coils.length;j++){const coil=m.coils[j];coil.position.copy(a.start).addScaledVector(axis,.03+j*.10);coil.quaternion.setFromUnitVectors(unitZ,axis);coil.rotateZ(a.age*(4+j));coil.scale.setScalar(.5+charge*.85);coil.material.opacity=charge*.78;}
 const envelope=a.age<a.spec.delay?0:Math.exp(-(a.age-a.spec.delay)*7.5);const width=(.012+a.power*.024)*envelope;beamBetween(m.beam,a.start,a.target,Math.max(.001,width*3.6));beamBetween(m.center,a.start,a.target,Math.max(.0005,width*.65));m.beam.material.opacity=envelope>.01?.72:.035;m.center.material.opacity=envelope;
 if(a.age<a.spec.delay&&dt>0){a.trail+=dt;while(a.trail>.055){a.trail-=.055;spawnParticles(a.start,axis,3,0xbea6ff,.07,.32);}}
 }else if(a.id==='drill'){
 const active=a.age>=a.spec.delay&&a.pulsesDone<5,engage=smooth(0,.48,a.age),leave=1-smooth(1.96,2.25,a.age);const drillAxis=a.normal.clone().addScaledVector(a.right,.62).normalize();m.rig.position.copy(a.target).addScaledVector(drillAxis,.73-engage*.38-a.pulsesDone*.014);m.rig.quaternion.setFromUnitVectors(unitY,drillAxis);m.rig.rotateY(a.age*24);m.rig.scale.setScalar(Math.max(.001,engage*leave));
 for(let j=0;j<m.bores.length;j++){const ring=m.bores[j],phase=(a.age*1.7+j/3)%1;ring.position.copy(a.target).multiplyScalar(1.012);ring.quaternion.setFromUnitVectors(unitZ,a.normal);ring.scale.setScalar(.09+phase*(.24+a.power*.12));ring.material.opacity=(1-phase)*engage*leave*.54;}
 if(active&&dt>0){a.trail+=dt;while(a.trail>.065){a.trail-=.065;spawnParticles(a.target,a.normal,3,0xffa35b,.25,.55);}}
 while(a.pulsesDone<5&&a.age>=a.spec.delay+a.pulsesDone*.29&&!destroying&&!destroyed){a.hit=false;impact(a);a.pulsesDone++;}
 }else if(a.id==='blackhole'){
 const pos=a.target.clone().addScaledVector(a.normal,.52);m.hole.position.copy(pos);m.ring.position.copy(pos);m.ring2.position.copy(pos);m.halo.position.copy(pos);
 const grow=smooth(0,.45,a.age)*(a.persistent?1:1-smooth(2.25,3,a.age));m.hole.scale.setScalar(grow);m.ring.scale.setScalar(grow);m.ring2.scale.setScalar(grow);m.halo.scale.setScalar(grow);m.ring.rotation.set(1.15,.4,a.age*1.7);m.ring2.rotation.set(-.6,a.age*.4,a.age*2.1);
 if(dt>0){a.trail+=dt;while(a.trail>.045){a.trail-=.045;const n=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();spawnParticles(pos.clone().addScaledVector(n,.6+Math.random()*.5),n.clone().negate(),4,a.spec.color,.08,1.2);}}
 }else{
 if(!a.hit)solarFlash=Math.max(solarFlash,smooth(.15,.8,a.age)*(.50+a.power*.4));
 const pos=a.target.clone().addScaledVector(a.normal,.70).addScaledVector(a.right,.83).addScaledVector(a.up,.50);m.sun.position.copy(pos);m.corona.position.copy(pos);m.wave.position.copy(pos);m.wave.quaternion.copy(camera.quaternion);const grow=.5+smooth(0,.7,a.age)*.8;const fade=1-smooth(1.2,2,a.age);m.sun.scale.setScalar(grow);m.sun.material.uniforms.uAlpha.value=fade;m.sun.material.uniforms.uAge.value=a.age;m.corona.scale.setScalar(grow);m.corona.material.uniforms.uAge.value=a.age;m.corona.visible=fade>.05;
 const wave=smooth(.5,1.5,a.age);m.wave.scale.setScalar(.15+wave*3.6);m.wave.material.opacity=Math.sin(wave*Math.PI)*.13;
 }
 if(a.id!=='drill'&&a.age>=a.spec.delay&&!a.hit)impact(a);
 if(a.age>=a.spec.duration&&!a.persistent){disposeObject(a.group);effects.splice(i,1);}
 }}
 function updateParticles(dt){let any=false;for(let i=0;i<MAX_PARTICLES;i++){const p=particles[i];if(p.active&&dt>0){p.age+=dt;if(p.age>=p.life){p.active=false;}else{for(const a of effects)if(a.id==='blackhole'){const pos=a.meshes.hole.position;const dir=pos.clone().sub(p.p);const d=dir.length();if(d<2.2&&d>.09)p.v.addScaledVector(dir.normalize(),dt*1.1/(d+.2));if(d<.19)p.age=p.life;}p.p.addScaledVector(p.v,dt);p.v.multiplyScalar(Math.pow(p.drag,dt*60));}}
 if(p.active){any=true;p.p.toArray(particlePositions,i*3);p.color.toArray(particleColors,i*3);particleSizes[i]=p.size;particleAlphas[i]=Math.pow(1-p.age/p.life,.8);}else{particleSizes[i]=0;particleAlphas[i]=0;}}
 particleMesh.visible=any;for(const a of Object.values(particleGeometry.attributes))a.needsUpdate=true;}
 function updateDestruction(dt){if(!destroying)return;const before=destruction;destruction=Math.min(5.5,destruction+dt);uniforms.uDestruction.value=smooth(0,1.35,destruction);const breakup=smooth(1.0,5.3,destruction);uniforms.uBreak.value=breakup;
 underCrust.visible=destruction<1.02;surface.visible=destruction<1.02;fragments.visible=!surface.visible;core.visible=fragments.visible;clouds.visible=false;atmosphere.visible=destruction<1.3;atmosphereUniforms.uColor.value.set(finisher==='cryo'?0x86eaff:0xff733c);atmosphereUniforms.uOpacity.value=.7;
 planet.scale.setScalar(finisher==='blackhole'?1:1/(1+breakup*2.05));core.scale.setScalar(finisher==='blackhole'?Math.max(.001,1-breakup*1.5):1-breakup*.25);heat=finisher==='cryo'?0:1-breakup*.20;
 if(before<1.02&&destruction>=1.02){for(let i=0;i<(reducedMotion?40:170);i++){const n=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();spawnParticles(n.clone(),n,3,finisher==='cryo'?0x9aeaff:0xff822c,1.3,5.6);}if(!reducedMotion)shake=.06;}
 if(destruction>=5.5&&!destroyed){destroyed=true;destroying=false;safeCallback(onDestroyed,{planet:planetId,impacts,finisher,fragments:totalChips+180});stats(true);}}
 function render(now){frame=0;if(disposed||contextLost||document.hidden)return;const raw=lastTime?Math.min((now-lastTime)/1000,.045):0;lastTime=now;const dt=raw*timeScale;elapsed+=dt;
 if(dt>0){frost=Math.max(0,frost-dt*.0045);uniforms.uFrost.value=frost;for(let i=0;i<8;i++)uniforms.uFrostPatches.value[i].w+= (frostRadii[i]-uniforms.uFrostPatches.value[i].w)*(1-Math.exp(-dt*3.2));solarFlash=Math.max(0,solarFlash-dt*.21);if(!dragging&&!reducedMotion&&!destroyed)planet.rotation.y+=dt*.015;cloudUniforms.uShift.value+=dt*.0006;coreUniforms.uTime.value+=dt;heat=Math.max(destroyed&&finisher!=='cryo'?.7:0,heat-dt*.008);for(let i=0;i<MAX_SCARS;i++)uniforms.uScarHeat.value[i]=Math.max(.06,uniforms.uScarHeat.value[i]-dt*.023);updateEffects(dt);updateDestruction(dt);uniforms.uSolarPulse.value=solarFlash;}
 updateParticles(dt);updateChips(dt);controls.update();cameraJitter.set(0,0,0);if(shake>.0001&&dt>0&&!reducedMotion){cameraJitter.set(Math.sin(elapsed*73),Math.cos(elapsed*89),0).multiplyScalar(shake);camera.position.add(cameraJitter);shake*=Math.pow(.04,dt);}
 renderer.render(scene,camera);camera.position.sub(cameraJitter);stats();requestRender();}
 function requestRender(){if(!frame&&!disposed&&!contextLost&&!document.hidden)frame=requestAnimationFrame(render);}
 function resize(){if(disposed)return;const w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1),ratio=Math.min(devicePixelRatio||1,1.5);renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(20))/Math.min(1,w/h)));camera.updateProjectionMatrix();stars.material.uniforms.uPixelRatio.value=ratio;particleMaterial.uniforms.uRatio.value=ratio;requestRender();}
 function clearEffects(){for(const a of effects){disposeObject(a.group);if(a.flash)disposeObject(a.flash);}effects.length=0;for(const p of particles)p.active=false;for(const c of chips)c.active=false;chipMesh.visible=false;particleAlphas.fill(0);particleSizes.fill(0);particleMesh.visible=false;}
 function reset(){clearEffects();maxHealth=PLANETS[planetId].hp;health=maxHealth;integrity=100;heat=0;frost=0;frostIndex=0;frostRadii.fill(0);uniforms.uFrost.value=0;uniforms.uFrostPatches.value.forEach(v=>v.set(0,0,0,0));impacts=0;destruction=0;destroying=false;destroyed=false;lastFire=-100;scarIndex=0;shake=0;finisher=null;solarFlash=0;totalChips=0;uniforms.uSolarPulse.value=0;uniforms.uColdBreak.value=0;uniforms.uCollapse.value=0;uniforms.uScars.value.forEach(v=>v.set(0,0,0,0));uniforms.uScarHeat.value.fill(0);uniforms.uScarDepth.value.fill(0);uniforms.uScarCut.value.fill(0);underCrust.visible=true;uniforms.uDestruction.value=uniforms.uBreak.value=0;planet.scale.setScalar(1);surface.visible=true;fragments.visible=core.visible=false;const config=PLANETS[planetId];clouds.visible=!!config.clouds;atmosphere.visible=planetId!=='moon';atmosphereUniforms.uColor.value.set(config.atmosphere);atmosphereUniforms.uOpacity.value=planetId==='mars'?.22:.65;stats(true);requestRender();}
 function setPlanet(id){if(!PLANETS[id])return false;planetId=id;uniforms.uDay.value=textures[id];uniforms.uEarth.value=id==='earth'?1:0;planet.rotation.set(.055,-Math.PI*.57,0);reset();return true;}
 function onPointerDown(e){pointers.add(e.pointerId);if(pointers.size>1)multiTouch=true;if(e.button!==0)return;pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};moveDistance=0;}
 function onPointerMove(e){if(pointerStart&&pointerStart.id===e.pointerId)moveDistance=Math.max(moveDistance,Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y));}
 function onPointerUp(e){pointers.delete(e.pointerId);if(pointerStart&&pointerStart.id===e.pointerId){const click=moveDistance<7&&!multiTouch&&e.button===0;pointerStart=null;if(click){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);planet.updateMatrixWorld();const hit=raycaster.intersectObject(surface,false)[0];if(hit&&surface.visible)fire(planet.worldToLocal(hit.point.clone()).normalize());}}if(!pointers.size)multiTouch=false;}
 function onCancel(e){pointers.delete(e.pointerId);pointerStart=null;if(!pointers.size)multiTouch=false;}
 function onVisibility(){lastTime=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else requestRender();}
 function onContextLost(e){e.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;safeCallback(onError,new Error('Graphics were interrupted. The scene will resume when available.'));}
 function onContextRestored(){contextLost=false;lastTime=0;requestRender();safeCallback(onReady,{restored:true});}
 const observer=new ResizeObserver(resize);observer.observe(host);canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onCancel);canvas.addEventListener('webglcontextlost',onContextLost);canvas.addEventListener('webglcontextrestored',onContextRestored);document.addEventListener('visibilitychange',onVisibility);controls.addEventListener('start',()=>{dragging=true;});controls.addEventListener('end',()=>{dragging=false;});
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();clearEffects();canvas.removeEventListener('pointerdown',onPointerDown);canvas.removeEventListener('pointermove',onPointerMove);canvas.removeEventListener('pointerup',onPointerUp);canvas.removeEventListener('pointercancel',onCancel);canvas.removeEventListener('webglcontextlost',onContextLost);canvas.removeEventListener('webglcontextrestored',onContextRestored);document.removeEventListener('visibilitychange',onVisibility);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});loaded.forEach(t=>t.dispose());renderer.dispose();canvas.remove();}
 resize();try{await renderer.compileAsync(scene,camera);}catch(error){safeCallback(onError,error);dispose();throw error;}requestRender();stats(true);safeCallback(onReady,{planet:planetId});
 return {setPlanet,setWeapon(id){if(!WEAPONS[id])return false;weaponId=id;stats(true);return true;},setPower(value){power=clamp(value);},setTimeScale(value){if([0,.25,.5,1,2].includes(Number(value)))timeScale=Number(value);lastTime=0;requestRender();},fireAtCenter,reset,resetView(){camera.position.set(0,.16,3.70);controls.target.set(0,0,0);controls.update();requestRender();},setReducedMotion(value){reducedMotion=!!value;controls.enableDamping=!reducedMotion;shake=0;},dispose};
}
