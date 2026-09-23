import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// The timeline is illustrative. All destructive effects belong exclusively to
// the separate fictional finale parameter; progress=1 always retains oceans.
const TAU = Math.PI * 2;
const INITIAL_ROTATION = -Math.PI * 0.57;
const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const seededRandom = (seed) => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const commonGLSL = /* glsl */`
  uniform float uProgress;
  uniform float uAridity;
  uniform float uIceLoss;
  uniform float uSolar;
  uniform float uTectonics;
  uniform float uOxygenLoss;
  uniform float uFinale;
  uniform float uTime;
  uniform vec3 uSun;
  const float PI = 3.14159265359;
  vec2 mapUV(vec2 p) {
    float latitude = p.y * PI;
    float envelope = pow(max(0.0, sin(latitude)), 1.8);
    float drift = uTectonics * 0.066;
    vec2 offset = vec2(
      sin(p.y * 11.0 + sin(p.x * 6.2831853) * 1.25) * 0.67
        + sin(p.x * 12.5663706 + p.y * 5.0) * 0.33,
      sin(p.x * 6.2831853 + p.y * 3.5) * 0.39
    ) * drift * envelope;
    return vec2(fract(p.x + offset.x), clamp(p.y + offset.y, 0.002, 0.998));
  }
  vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  float cellEdge(vec2 p) {
    vec2 ip = floor(p), fp = fract(p);
    float closest = 8.0, second = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 r = offset + hash2(ip + offset) - fp;
        float d = dot(r, r);
        if (d < closest) { second = closest; closest = d; }
        else if (d < second) second = d;
      }
    }
    return sqrt(second) - sqrt(closest);
  }
`;

const surfaceVertex = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vEdge;
  #ifdef FRACTURED
    attribute vec3 aCenter;
    attribute vec3 aAxis;
    attribute float aSpeed;
    attribute float aSpin;
    attribute float aEdge;
    uniform float uBreak;
    mat3 axisRotation(vec3 a, float angle) {
      float c = cos(angle), s = sin(angle), t = 1.0 - c;
      return mat3(
        t*a.x*a.x+c, t*a.x*a.y+s*a.z, t*a.x*a.z-s*a.y,
        t*a.x*a.y-s*a.z, t*a.y*a.y+c, t*a.y*a.z+s*a.x,
        t*a.x*a.z+s*a.y, t*a.y*a.z-s*a.x, t*a.z*a.z+c
      );
    }
  #endif
  void main() {
    vUv = uv;
    vec3 p = position;
    vec3 n = normal;
    vEdge = 0.0;
    #ifdef FRACTURED
      float travel = pow(uBreak, 0.84);
      mat3 turn = axisRotation(aAxis, travel * aSpin);
      p = turn * (position - aCenter) + aCenter;
      p += normalize(aCenter) * travel * aSpeed;
      p += cross(normalize(aCenter), aAxis) * travel * travel * 0.18;
      n = turn * normal;
      vEdge = aEdge;
    #endif
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const surfaceFragment = /* glsl */`
  ${commonGLSL}
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uOcean;
  uniform sampler2D uClouds;
  uniform float uNightLights;
  uniform float uCloudOpacity;
  uniform float uCloudShift;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vEdge;
  void main() {
    vec2 uv = mapUV(vUv);
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float sunDot = dot(N, uSun);
    float daylight = smoothstep(-0.10, 0.15, sunDot);
    float water = smoothstep(0.14, 0.86, texture2D(uOcean, uv).r);
    vec3 tex = texture2D(uDay, uv).rgb;
    float textureLuma = dot(tex, vec3(0.2126, 0.7152, 0.0722));
    // Keep the bathymetric texture while enriching the ocean's blue response.
    vec3 ocean = mix(tex * vec3(0.64, 1.22, 1.90), vec3(0.013, 0.071, 0.195), 0.33);
    vec3 land = tex * 1.60;
    vec3 dryLand = vec3(0.42, 0.285, 0.125) * (0.47 + textureLuma * 2.1);
    land = mix(land, dryLand, uAridity * 0.79);
    vec3 surface = mix(land, ocean, water);
    // White polar pixels melt into their underlying land or ocean class.
    float polar = smoothstep(0.48, 0.73, abs(vUv.y * 2.0 - 1.0));
    float snow = smoothstep(0.29, 0.76, min(tex.r, min(tex.g, tex.b))) * polar;
    vec3 thawed = mix(vec3(0.125, 0.105, 0.074), ocean, water);
    surface = mix(surface, thawed, snow * uIceLoss * 0.98);
    vec4 cloud = texture2D(uClouds, mapUV(vec2(vUv.x + uCloudShift, vUv.y)));
    float shadow = cloud.a * uCloudOpacity * daylight * 0.16;
    float diffuse = 0.035 + 0.965 * pow(max(0.0, sunDot), 0.72);
    vec3 color = surface * diffuse * (1.0 - shadow) * (1.0 + uSolar * 0.11);
    vec3 halfVector = normalize(uSun + V);
    float spec = pow(max(dot(N, halfVector), 0.0), 90.0);
    color += vec3(0.38, 0.64, 0.87) * spec * water * daylight * 0.46;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.7);
    vec3 haze = mix(vec3(0.03, 0.20, 0.49), vec3(0.33, 0.17, 0.045), uAridity * 0.47 + uOxygenLoss * 0.13);
    color += haze * rim * (0.17 + max(sunDot, 0.0) * 0.23);
    vec3 cities = texture2D(uNight, uv).rgb;
    float citiesRemain = 1.0 - smoothstep(0.0, 0.026, uProgress);
    color += cities * vec3(1.35, 0.92, 0.53) * (1.0 - daylight) * citiesRemain * uNightLights * 1.40;
    // Everything below is deliberately a separate, fictional visual event.
    if (uFinale > 0.001) {
      float heat = smoothstep(0.015, 0.49, uFinale);
      float molten = smoothstep(0.30, 0.57, uFinale);
      float edges = cellEdge(uv * vec2(24.0, 12.0) + vec2(sin(uv.y * 37.0), sin(uv.x * 29.0)) * 0.20);
      float crack = 1.0 - smoothstep(0.009 + heat * 0.018, 0.023 + heat * 0.052, edges);
      float continents = 0.50 + textureLuma * 1.4;
      vec3 hot = mix(vec3(0.52, 0.025, 0.001), vec3(2.4, 0.48, 0.014), continents * 0.68);
      color = mix(color, hot * (0.65 + 0.35 * daylight), molten);
      color += vec3(2.5, 0.50, 0.016) * crack * heat * (1.0 - molten * 0.51);
      color += vec3(0.13, 0.007, 0.0) * heat;
      float cooling = smoothstep(0.59, 0.92, uFinale);
      vec3 crust = vec3(0.07, 0.014, 0.004) + color * 0.17;
      color = mix(color, crust, cooling * 0.88);
      color = mix(color, vec3(1.35, 0.20, 0.008), vEdge * 0.78);
      color += vec3(0.55, 0.055, 0.001) * crack * cooling;
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const shellVertex = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

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

function makeEmbers(uniforms) {
  const random = seededRandom(18092), position = [], direction = [], velocity = [], seed = [];
  for (let i = 0; i < 600; i++) {
    const z = random() * 2 - 1, theta = random() * TAU, r = Math.sqrt(1 - z * z);
    const dir = [r * Math.cos(theta), z, r * Math.sin(theta)];
    position.push(...dir); direction.push(...dir); velocity.push(1.6 + random() * 5.0); seed.push(random());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aDirection', new THREE.Float32BufferAttribute(direction, 3));
  geometry.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocity, 1));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute vec3 aDirection; attribute float aVelocity; attribute float aSeed;
      uniform float uBreak; uniform float uPixelRatio; varying float vSeed; varying float vAlpha;
      void main(){
        float p=pow(uBreak,0.82); vec3 point=aDirection*(1.0+p*aVelocity);
        point+=vec3(sin(aSeed*41.0),cos(aSeed*32.0),sin(aSeed*78.0))*p*p*0.2;
        vec4 mv=modelViewMatrix*vec4(point,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((1.0+aSeed*2.1)*uPixelRatio*3.4/max(1.0,-mv.z),0.7,8.0);
        vSeed=aSeed; vAlpha=smoothstep(0.0,0.08,uBreak)*(1.0-smoothstep(0.7,1.0,uBreak)*0.45);
      }`,
    fragmentShader: `varying float vSeed; varying float vAlpha; void main(){float d=length(gl_PointCoord-0.5);float a=pow(max(0.0,1.0-d*2.0),1.4);gl_FragColor=vec4(mix(vec3(1.0,0.19,0.01),vec3(1.0,0.78,0.21),vSeed),a*vAlpha);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function makeTrails(uniforms) {
  const random = seededRandom(18092), position = [], velocity = [], tail = [];
  for (let i = 0; i < 180; i++) {
    const z = random() * 2 - 1, theta = random() * TAU, r = Math.sqrt(1 - z * z);
    const direction = [r * Math.cos(theta), z, r * Math.sin(theta)];
    const speed = 1.6 + random() * 5;
    random();
    position.push(...direction, ...direction); velocity.push(speed, speed); tail.push(0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocity, 1));
  geometry.setAttribute('aTail', new THREE.Float32BufferAttribute(tail, 1));
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float aVelocity; attribute float aTail; uniform float uBreak; varying float vAlpha;
      void main(){float travel=pow(uBreak,0.82);float distance=1.0+travel*aVelocity;
        distance-=aTail*(0.07+travel*0.40);vAlpha=(1.0-aTail*0.94)*smoothstep(0.0,0.12,uBreak)*(1.0-uBreak*0.5);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position*distance,1.0);}`,
    fragmentShader: `varying float vAlpha;void main(){gl_FragColor=vec4(1.0,0.37,0.055,vAlpha*0.45);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  return lines;
}

/** Create and own only the renderer elements inside host. All state is 0..1. */
export async function createEarthScene(host, { onReady = () => {}, onError = () => {} } = {}) {
  if (!host) throw new Error('Earth renderer requires a host element.');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) { onError(error); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  const canvas = renderer.domElement;
  canvas.className = 'earth-canvas';
  canvas.setAttribute('aria-label', 'Interactive three-dimensional Earth. Drag to orbit; scroll to zoom.');
  canvas.setAttribute('role', 'img');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const initialCamera = new THREE.Vector3(0.0, 0.25, 3.65);
  camera.position.copy(initialCamera);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = 2.5;
  controls.maxDistance = 7.0;
  controls.rotateSpeed = 0.48;
  controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
  const planet = new THREE.Group();
  planet.rotation.y = INITIAL_ROTATION;
  planet.rotation.z = 0.035;
  scene.add(planet);
  let disposed = false, contextLost = false, frame = 0, lastTime = 0, elapsed = 0;
  let playing = true, reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  let dragging = false, settleFrames = 0;
  const state = { progress: 0, aridity: 0, iceLoss: 0, solar: 0, tectonics: 0, oxygenLoss: 0, finale: 0 };
  const layers = { clouds: true, nightLights: true };
  const assets = [];
  const loader = new THREE.TextureLoader();
  async function loadTexture(name, srgb = false) {
    const texture = await loader.loadAsync(`./assets/${name}`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    assets.push(texture);
    return texture;
  }
  let textures;
  try {
    textures = await Promise.all([
      loadTexture('earth-day.jpg', true), loadTexture('earth-night.png', true),
      loadTexture('earth-ocean.jpg'), loadTexture('earth-clouds.png'),
    ]);
  } catch (error) {
    assets.forEach(asset => asset.dispose()); controls.dispose(); renderer.dispose(); canvas.remove();
    onError(error); throw error;
  }
  const uniforms = {
    uDay: { value: textures[0] }, uNight: { value: textures[1] }, uOcean: { value: textures[2] }, uClouds: { value: textures[3] },
    uProgress: { value: 0 }, uAridity: { value: 0 }, uIceLoss: { value: 0 }, uSolar: { value: 0 }, uTectonics: { value: 0 },
    uOxygenLoss: { value: 0 }, uFinale: { value: 0 }, uBreak: { value: 0 }, uTime: { value: 0 },
    uNightLights: { value: 1 }, uCloudOpacity: { value: 1 }, uCloudShift: { value: 0 },
    uSun: { value: new THREE.Vector3(-0.83, 0.42, 0.78).normalize() },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };
  const sphereGeometry = new THREE.SphereGeometry(1, 128, 64);
  const surfaceMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: surfaceVertex, fragmentShader: surfaceFragment });
  const surface = new THREE.Mesh(sphereGeometry, surfaceMaterial);
  planet.add(surface);
  const fragmentMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: surfaceVertex, fragmentShader: surfaceFragment, defines: { FRACTURED: '' }, side: THREE.DoubleSide });
  const fragments = new THREE.Mesh(makeFragments(), fragmentMaterial);
  fragments.frustumCulled = false;
  fragments.visible = false;
  planet.add(fragments);
  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: shellVertex,
    fragmentShader: `${commonGLSL}
      uniform sampler2D uClouds; uniform float uCloudOpacity; uniform float uCloudShift;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
      void main(){
        vec4 cloud=texture2D(uClouds,mapUV(vec2(vUv.x+uCloudShift,vUv.y)));
        float light=max(dot(normalize(vNormal),uSun),0.0);
        float alpha=pow(cloud.a,1.65)*0.72*uCloudOpacity*(1.0-smoothstep(0.18,0.52,uFinale));
        vec3 tint=mix(vec3(0.67,0.79,0.95),vec3(0.97,0.79,0.54),uAridity*0.4);
        gl_FragColor=vec4(tint*(0.06+light*0.94),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`, transparent: true, depthWrite: false,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.009, 96, 48), cloudMaterial);
  clouds.renderOrder = 2;
  planet.add(clouds);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: shellVertex,
    fragmentShader: `${commonGLSL}
      varying vec3 vNormal; varying vec3 vWorld;
      void main(){
        vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);
        float rim=pow(1.0-abs(dot(N,V)),3.3);
        float sun=0.35+max(dot(N,uSun),0.0)*0.65;
        vec3 blue=mix(vec3(0.10,0.43,0.98),vec3(0.82,0.39,0.08),uAridity*0.32+uOxygenLoss*0.10);
        blue=mix(blue,vec3(1.0,0.27,0.02),smoothstep(0.05,0.5,uFinale));
        float alpha=rim*sun*0.68*(1.0-smoothstep(0.55,0.69,uFinale));
        gl_FragColor=vec4(blue,alpha);
      }`, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.044, 96, 48), atmosphereMaterial);
  atmosphere.renderOrder = 3;
  planet.add(atmosphere);
  const stars = makeStars();
  stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  scene.add(stars);
  const coreMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: shellVertex,
    fragmentShader: `uniform float uFinale; varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
      void main(){vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);
        float face=max(dot(N,V),0.0);float veins=sin(vUv.x*87.0+sin(vUv.y*65.0)*2.0)*sin(vUv.y*47.0+vUv.x*16.0);
        vec3 hot=mix(vec3(0.95,0.045,0.0),vec3(3.7,0.95,0.045),pow(face,0.8)*(0.75+veins*0.12));
        gl_FragColor=vec4(hot,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.91, 64, 32), coreMaterial);
  core.visible = false;
  planet.add(core);
  const embers = makeEmbers(uniforms);
  embers.visible = false;
  planet.add(embers);
  const trails = makeTrails(uniforms);
  trails.visible = false;
  planet.add(trails);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffb64f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.009, 160), ringMaterial);
  ring.visible = false;
  scene.add(ring);

  function updateState() {
    for (const key of Object.keys(state)) {
      const uniform = uniforms[`u${key[0].toUpperCase()}${key.slice(1)}`];
      if (uniform) uniform.value = state[key];
    }
    const breakup = smooth(0.57, 1.0, state.finale);
    uniforms.uBreak.value = breakup;
    const retreat = 1 / (1 + breakup * 2.2);
    planet.scale.setScalar(retreat);
    uniforms.uNightLights.value = layers.nightLights ? 1 : 0;
    uniforms.uCloudOpacity.value = layers.clouds ? 1 - state.aridity * 0.30 : 0;
    surface.visible = state.finale < 0.575;
    fragments.visible = state.finale >= 0.575;
    core.visible = state.finale >= 0.575;
    core.scale.setScalar(1 - breakup * 0.16);
    clouds.visible = layers.clouds && state.finale < 0.53;
    atmosphere.visible = state.finale < 0.69;
    embers.visible = state.finale > 0.575;
    trails.visible = embers.visible;
    ring.visible = breakup > 0.001 && breakup < 0.94;
    ring.scale.setScalar((1.01 + breakup * 7.0) * retreat);
    ringMaterial.opacity = Math.sin(clamp(breakup / 0.94) * Math.PI) * 0.27;
    requestRender();
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    uniforms.uPixelRatio.value = ratio; stars.material.uniforms.uPixelRatio.value = ratio;
    camera.aspect = width / height;
    // Preserve the globe's diameter against whichever stage axis is smaller.
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) / Math.min(1, width / height)));
    camera.updateProjectionMatrix();
    requestRender();
  }
  function requestRender() {
    if (!frame && !disposed && !contextLost && !document.hidden) frame = requestAnimationFrame(render);
  }
  function render(now) {
    frame = 0;
    if (disposed || contextLost || document.hidden) return;
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    if (playing && !reducedMotion && !dragging) {
      elapsed += delta;
      planet.rotation.y += delta * 0.014 * (1 - smooth(0, 0.6, state.finale));
      uniforms.uCloudShift.value = elapsed * 0.00025;
      uniforms.uTime.value = elapsed;
    }
    controls.update();
    ring.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
    if ((playing && !reducedMotion) || dragging || settleFrames-- > 0) requestRender();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function onControlChange() { requestRender(); }
  function onControlStart() { dragging = true; requestRender(); }
  function onControlEnd() { dragging = false; settleFrames = 80; requestRender(); }
  controls.addEventListener('change', onControlChange);
  controls.addEventListener('start', onControlStart);
  controls.addEventListener('end', onControlEnd);
  function onVisibility() {
    lastTime = 0;
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  }
  function onContextLost(event) {
    event.preventDefault(); contextLost = true; cancelAnimationFrame(frame); frame = 0;
    onError(new Error('The graphics context was interrupted. The globe will resume when it is available.'));
  }
  function onContextRestored() { contextLost = false; lastTime = 0; requestRender(); onReady({ restored: true }); }
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); assets.forEach(texture => texture.dispose());
    renderer.dispose(); canvas.remove();
  }
  resize(); updateState();
  // Compile before reporting ready so shader failures can reach the fallback UI.
  try { await renderer.compileAsync(scene, camera); renderer.render(scene, camera); }
  catch (error) { dispose(); onError(error); throw error; }
  onReady({ renderer: 'WebGL', fragmentCount: 180 });
  return {
    setState(next) { if (disposed) return; for (const key of Object.keys(state)) if (key in next) state[key] = clamp(next[key]); updateState(); },
    setLayers(next) { if (disposed) return; for (const key of Object.keys(layers)) if (key in next) layers[key] = !!next[key]; updateState(); },
    setPlaying(value) { playing = !!value; lastTime = 0; requestRender(); },
    setReducedMotion(value) { reducedMotion = !!value; controls.enableDamping = !reducedMotion; lastTime = 0; requestRender(); },
    resetView() { camera.position.copy(initialCamera); controls.target.set(0, 0, 0); planet.rotation.set(0, INITIAL_ROTATION, 0.035); controls.update(); requestRender(); },
    dispose,
  };
}
