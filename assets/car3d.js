// Procedural 3D car whose state tells the story of each detailing level.
// mountCar(canvas, onCaption) -> { setLevel(1..5) }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DIRTY = new THREE.Color('#8a7f70');
const CLEAN = new THREE.Color('#f2f4f7');
const FOAM = new THREE.Color('#ffffff');
const SEAT_DIRTY = new THREE.Color('#5b4a40');
const SEAT_CLEAN = new THREE.Color('#b0141e');
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

export function mountCar(canvas, onCaption = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(6.2, 2.1, 6.4);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, .7, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = .9;
  controls.minPolarAngle = .6;
  controls.maxPolarAngle = 1.45;
  canvas.style.touchAction = 'pan-y'; // horizontal drag rotates, vertical swipe still scrolls the page

  scene.add(new THREE.HemisphereLight('#ffffff', '#202428', .6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(4, 7, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  scene.add(key);
  const sweep = new THREE.PointLight('#ffffff', 0, 6); // moving highlight = "shine" pass
  scene.add(sweep);
  const cabinLight = new THREE.PointLight('#2ee6d6', 0, 3);
  cabinLight.position.set(0, 1.05, 0);
  scene.add(cabinLight);

  // Ground: soft shadow + glow ring for premium
  const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.ShadowMaterial({ opacity: .45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.78, 96), new THREE.MeshBasicMaterial({ color: '#2ee6d6', transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .01;
  scene.add(ring);

  // ---- Car ----
  const car = new THREE.Group();
  scene.add(car);
  const paint = new THREE.MeshPhysicalMaterial({ color: DIRTY.clone(), metalness: .35, roughness: .85, clearcoat: 0, clearcoatRoughness: .05 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#22323d', metalness: .6, roughness: .04, transparent: true, opacity: .92, clearcoat: 1, envMapIntensity: 2.2 });
  const tire = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: .95 });
  const rim = new THREE.MeshStandardMaterial({ color: '#6c6862', metalness: .9, roughness: .6 });
  const seat = new THREE.MeshStandardMaterial({ color: SEAT_DIRTY.clone(), roughness: .9 });
  const dash = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: .8 });

  const W = 1.7; // body width (z), plus bevel
  const body = new THREE.Shape();
  body.moveTo(-2.3, .32);
  body.lineTo(-1.92, .32);
  body.absarc(-1.45, .36, .47, Math.PI, 0, true);
  body.lineTo(.98, .32);
  body.absarc(1.45, .36, .47, Math.PI, 0, true);
  body.lineTo(2.28, .32);
  body.quadraticCurveTo(2.42, .36, 2.4, .58);
  body.quadraticCurveTo(2.36, .84, 2.05, .9);
  body.lineTo(1.2, .98);
  body.lineTo(-1.7, 1.02);
  body.lineTo(-2.22, .98);
  body.quadraticCurveTo(-2.42, .86, -2.38, .55);
  body.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: W, bevelEnabled: true, bevelThickness: .14, bevelSize: .08, bevelSegments: 5, curveSegments: 28 });
  bodyGeo.translate(0, 0, -W / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, paint);
  bodyMesh.castShadow = true;
  car.add(bodyMesh);

  const cabin = new THREE.Shape();
  cabin.moveTo(1.25, .96);
  cabin.quadraticCurveTo(.7, 1.2, .3, 1.43);
  cabin.quadraticCurveTo(-.3, 1.52, -.95, 1.42);
  cabin.quadraticCurveTo(-1.45, 1.22, -1.78, .99);
  cabin.closePath();
  const CW = 1.42;
  const cabinGeo = new THREE.ExtrudeGeometry(cabin, { depth: CW, bevelEnabled: true, bevelThickness: .1, bevelSize: .06, bevelSegments: 4, curveSegments: 24 });
  cabinGeo.translate(0, 0, -CW / 2);
  const cabinMesh = new THREE.Mesh(cabinGeo, glass);
  cabinMesh.castShadow = true;
  car.add(cabinMesh);

  // Black side skirts + bumper lips give the slab body some definition
  const trim = new THREE.MeshStandardMaterial({ color: '#111', roughness: .5 });
  for (const z of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(1.95, .1, .06), trim);
    sk.position.set(0, .38, z * 1.0);
    car.add(sk);
  }
  for (const x of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, 1.7), trim);
    lip.position.set(x * 2.42, .4, 0);
    car.add(lip);
  }

  // Interior
  const mkSeat = (x, z, w) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(.5, .14, w), seat); base.position.y = .98;
    const back = new THREE.Mesh(new THREE.BoxGeometry(.12, .5, w), seat); back.position.set(-.25, 1.2, 0); back.rotation.z = .18;
    g.add(base, back); g.position.set(x, 0, z); car.add(g);
  };
  mkSeat(.15, .36, .48); mkSeat(.15, -.36, .48); mkSeat(-.95, 0, 1.2);
  const dashMesh = new THREE.Mesh(new THREE.BoxGeometry(.3, .2, 1.3), dash);
  dashMesh.position.set(.95, 1.08, 0);
  car.add(dashMesh);

  // Lights
  const head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dff6ff', emissiveIntensity: .4 });
  const tail = new THREE.MeshStandardMaterial({ color: '#ff2233', emissive: '#ff0018', emissiveIntensity: .8 });
  for (const z of [-.62, .62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(.06, .08, .42), head); h.position.set(2.43, .74, z); car.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(.06, .08, .5), tail); t.position.set(-2.43, .8, z); car.add(t);
  }

  // Wheels
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(.37, .37, .28, 40);
  const rimGeo = new THREE.CylinderGeometry(.25, .25, .3, 32);
  const spokeGeo = new THREE.BoxGeometry(.42, .05, .04);
  for (const x of [-1.45, 1.45]) for (const z of [-.98, .98]) {
    const w = new THREE.Group();
    const tr = new THREE.Mesh(tireGeo, tire); tr.rotation.x = Math.PI / 2; tr.castShadow = true;
    const rm = new THREE.Mesh(rimGeo, rim); rm.rotation.x = Math.PI / 2;
    w.add(tr, rm);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(spokeGeo, rim); s.position.z = Math.sign(z) * .15; s.rotation.z = i * Math.PI / 5; w.add(s); }
    w.position.set(x, .37, z);
    car.add(w); wheels.push(w);
  }

  // ---- Particles ----
  const pts = (n, size, color, blending = THREE.NormalBlending) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.PointsMaterial({ size, color, transparent: true, opacity: 0, depthWrite: false, blending, sizeAttenuation: true });
    const p = new THREE.Points(g, m); scene.add(p); return p;
  };
  const foam = pts(900, .11, '#ffffff');
  const water = pts(500, .05, '#9fe7ff');
  const sparkle = pts(160, .09, '#ffffff', THREE.AdditiveBlending);
  const gold = pts(160, .08, '#ffc24a', THREE.AdditiveBlending);
  const bubbles = pts(120, .06, '#2ee6d6', THREE.AdditiveBlending);

  // Points hugging the car surface (rough shell around body + cabin)
  const shell = () => {
    const x = (Math.random() * 2 - 1) * 2.4, side = Math.random();
    if (side < .5) return [x, .35 + Math.random() * .65, (Math.random() < .5 ? -1 : 1) * 1.03];
    const top = Math.abs(x + .3) < 1.4 ? 1.45 + Math.random() * .1 : 1.0 + Math.random() * .06;
    return [x, top, (Math.random() * 2 - 1) * .9];
  };
  const fill = (p, fn) => { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setXYZ(i, ...fn(i)); a.needsUpdate = true; };
  fill(foam, shell);
  fill(sparkle, shell);
  fill(gold, () => [(Math.random() * 2 - 1) * 2.8, Math.random() * 1.8, (Math.random() * 2 - 1) * 1.6]);
  fill(water, () => [(Math.random() * 2 - 1) * 2.5, Math.random() * 3, (Math.random() * 2 - 1) * 1.2]);
  fill(bubbles, () => [(Math.random() * 2 - 1) * 1.1, .95 + Math.random() * .45, (Math.random() * 2 - 1) * .55]);

  // ---- State & timeline ----
  const st = { dirt: 1, foam: 0, water: 0, gloss: 0, tire: 0, interior: 0, open: 0, sparkle: 0, gold: 0, ring: 0, sweep: -1, cabin: 0 };
  let tasks = [], t0 = 0;
  const S = (start, dur, fn, caption) => tasks.push({ start, dur, fn, caption, said: false });
  const to = (k, v) => { let from; return t => { if (from === undefined) from = st[k]; st[k] = lerp(from, v, ease(t)); }; };

  function plan(level) {
    tasks = [];
    Object.assign(st, { dirt: 1, foam: 0, water: 0, gloss: 0, tire: 0, interior: 0, open: 0, sparkle: 0, gold: 0, ring: 0, sweep: -1, cabin: 0 });
    const exterior = level !== 3;
    const inside = level >= 2;
    let t = .3;
    if (exterior) {
      S(t, 1.2, to('foam', 1), 'Snow foam pre-soak'); t += 1.6;
      S(t, 1.2, to('dirt', 0)); S(t, 1.2, to('foam', 0)); S(t, 2.2, to('water', 1), 'Hand wash & rinse'); t += 2.2;
      S(t, .6, to('water', 0)); S(t, 1, to('tire', 1), 'Wheels, tires & dressing'); S(t, 1.2, to('gloss', level >= 4 ? 1 : .6)); t += 1.4;
    }
    if (inside) {
      S(t, 1, to('open', 1), level === 2 ? 'Vacuum & wipe-down' : 'Interior deep clean');
      S(t, 1, to('cabin', 1));
      S(t + .4, level >= 3 ? 2.2 : 1.4, to('interior', level >= 3 ? 1 : .5)); t += level >= 3 ? 2.8 : 2;
      if (level >= 3) { S(t, .1, () => {}, level === 3 ? 'Seats, carpets & conditioning' : 'Stains, carpets & conditioning'); t += 1.2; }
      S(t, .8, to('cabin', 0)); S(t, 1, to('open', 0)); t += 1;
    }
    if (level >= 4) { S(t, 2, to('sweep', 1), level === 5 ? 'Enhanced paint protection' : 'Spray paint protection'); S(t, 1.5, to('sparkle', 1)); t += 2.2; }
    if (level === 5) { S(t, 1.4, to('gold', 1), 'Premium finish'); S(t, 1.4, to('ring', 1)); t += 1.6; }
    S(t, .1, () => {}, level === 3 ? 'Interior restored ✓' : 'Ready to roll ✓');
    t0 = performance.now() / 1000;
  }

  // ---- Render loop ----
  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep ~6.8 units of width in frame whatever the stage shape (phones, narrow columns)
      camera.position.setLength(Math.max(8, 3.0 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)));
      camera.updateProjectionMatrix();
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = clock.getDelta(), time = clock.elapsedTime;
    const now = performance.now() / 1000 - t0;
    for (const k of tasks) {
      const p = (now - k.start) / k.dur;
      if (p >= 0) { k.fn(Math.min(1, p)); if (k.caption && !k.said) { k.said = true; onCaption(k.caption); } }
    }
    // paint: dirty -> foam -> clean -> glossy
    paint.color.copy(DIRTY).lerp(CLEAN, 1 - st.dirt).lerp(FOAM, st.foam * .85);
    paint.roughness = lerp(.85, .18, 1 - st.dirt) - st.gloss * .14 + st.foam * .5;
    paint.clearcoat = (1 - st.dirt) * .5 + st.gloss * .5;
    tire.color.set('#2a2622').lerp(new THREE.Color('#0b0b0b'), st.tire);
    tire.roughness = lerp(.95, .35, st.tire);
    rim.roughness = lerp(.6, .15, st.tire);
    rim.color.set('#6c6862').lerp(new THREE.Color('#d9dde2'), st.tire);
    seat.color.copy(SEAT_DIRTY).lerp(SEAT_CLEAN, st.interior);
    seat.roughness = lerp(.9, .45, st.interior);
    glass.opacity = lerp(.88, .18, st.open);
    cabinLight.intensity = st.cabin * (2.5 + Math.sin(time * 6) * .8);
    cabinLight.position.x = Math.sin(time * 1.6) * .9;
    foam.material.opacity = st.foam;
    water.material.opacity = st.water * .8;
    sparkle.material.opacity = st.sparkle * (.4 + .6 * Math.abs(Math.sin(time * 3)));
    gold.material.opacity = st.gold * .9;
    bubbles.material.opacity = st.cabin * .9;
    ring.material.opacity = st.ring * (.5 + .3 * Math.sin(time * 2));
    ring.scale.setScalar(1 + Math.sin(time * 2) * .02);
    sweep.intensity = st.sweep > -1 && st.sweep < 1 ? 14 : 0;
    sweep.position.set(lerp(-3, 3, (st.sweep + 1) / 2 || 0), 2.1, 1.6);
    // particle motion
    if (st.water > 0) { const a = water.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 4; if (y < 0) y = 3; a.setY(i, y); } a.needsUpdate = true; }
    if (st.gold > 0) { const a = gold.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * .5; if (y > 2.2) y = 0; a.setY(i, y); } a.needsUpdate = true; }
    if (st.cabin > 0) { const a = bubbles.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * .4; if (y > 1.45) y = .95; a.setY(i, y); } a.needsUpdate = true; }
    wheels.forEach(w => (w.rotation.z -= dt * st.ring * 2));
    resize();
    controls.update();
    renderer.render(scene, camera);
  }
  frame();

  return { setLevel: plan };
}
