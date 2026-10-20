// 3D car whose state tells the story of each detailing level.
// Model: "Car Concept" by Eric Chadwick / Darmstadt Graphics Group, CC BY 4.0 (Khronos glTF Sample Assets),
// modified: plate logo replaced with MV, Draco-compressed. See README.
// mountCar(canvas, onCaption) -> { setLevel(1..5) }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL = '/models/car.glb';
const DIRTY = new THREE.Color('#6f6253');
const FOAM = new THREE.Color('#ffffff');
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const LENGTH = 4.6; // car length in scene units

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
  controls.target.set(0, .6, 0);
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
  scene.add(cabinLight);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.ShadowMaterial({ opacity: .45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.78, 96), new THREE.MeshBasicMaterial({ color: '#2ee6d6', transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .01;
  scene.add(ring);

  // ---- Particles (positions filled once the model's shape is known) ----
  const pts = (n, size, color, blending = THREE.NormalBlending) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.PointsMaterial({ size, color, transparent: true, opacity: 0, depthWrite: false, blending, sizeAttenuation: true });
    const p = new THREE.Points(g, m); scene.add(p); return p;
  };
  const foam = pts(1400, .1, '#ffffff');
  const water = pts(500, .05, '#9fe7ff');
  const sparkle = pts(200, .08, '#ffffff', THREE.AdditiveBlending);
  const gold = pts(160, .08, '#ffc24a', THREE.AdditiveBlending);
  const bubbles = pts(120, .05, '#2ee6d6', THREE.AdditiveBlending);
  const fill = (p, fn) => { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setXYZ(i, ...fn(i)); a.needsUpdate = true; };

  // ---- Model ----
  // Materials we animate, with their original (clean) values so "dirty" can blend back to the real look.
  const M = { paint: [], glass: [], tires: [], rims: [], seats: [], lights: [] };
  let cabin = { y0: .9, y1: 1.2, x: 0, w: 1, d: .5 };
  let ready = false, pending = null;

  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  onCaption('Loading 3D…');
  new GLTFLoader().setDRACOLoader(draco).load(MODEL, gltf => {
    const car = gltf.scene;
    // Normalize: length along X, LENGTH units long, centered, wheels on the ground
    let box = new THREE.Box3().setFromObject(car), size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) { car.rotation.y = Math.PI / 2; car.updateMatrixWorld(true); box.setFromObject(car); box.getSize(size); }
    car.scale.setScalar(LENGTH / size.x);
    car.updateMatrixWorld(true);
    box.setFromObject(car); box.getSize(size);
    const c = box.getCenter(new THREE.Vector3());
    car.position.set(-c.x, -box.min.y, -c.z);
    car.updateMatrixWorld(true);
    scene.add(car);

    const seen = new Set(), paintMeshes = [];
    car.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material, n = m.name || '';
      if (n.startsWith('Paint')) paintMeshes.push(o);
      if (seen.has(m)) return;
      seen.add(m);
      const keep = { m, color: m.color.clone(), rough: m.roughness, coat: m.clearcoat ?? 0, metal: m.metalness };
      if (n.startsWith('Paint')) M.paint.push(keep);
      else if (n === 'Glass') M.glass.push(keep);
      else if (n.startsWith('Tire')) M.tires.push(keep);
      else if (n.startsWith('Rim')) M.rims.push(keep);
      else if (n.startsWith('Interior 3')) M.seats.push(keep);
      else if (/light/i.test(n)) M.lights.push({ ...keep, glow: m.emissiveIntensity });
    });

    // Foam/sparkle sit on the real body: sample vertices of the painted panels
    const samples = [];
    const v = new THREE.Vector3();
    for (const mesh of paintMeshes) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 400))) {
        v.fromBufferAttribute(pos, i); mesh.localToWorld(v); samples.push(v.toArray());
      }
    }
    const onBody = () => { const s = samples[Math.random() * samples.length | 0] || [0, 1, 0]; return [s[0], s[1] + .02, s[2]]; };
    fill(foam, onBody);
    fill(sparkle, onBody);
    const H = size.y, W = size.z;
    fill(gold, () => [(Math.random() * 2 - 1) * LENGTH * .6, Math.random() * H * 1.4, (Math.random() * 2 - 1) * W * .9]);
    fill(water, () => [(Math.random() * 2 - 1) * LENGTH * .55, Math.random() * 3, (Math.random() * 2 - 1) * W * .65]);
    cabin = { y0: H * .55, y1: H * .85, x: 0, w: LENGTH * .2, d: W * .3 };
    fill(bubbles, () => [(Math.random() * 2 - 1) * cabin.w, lerp(cabin.y0, cabin.y1, Math.random()), (Math.random() * 2 - 1) * cabin.d]);
    cabinLight.position.set(0, H * .7, 0);
    controls.target.set(0, H * .45, 0);

    ready = true;
    plan(pending ?? 4);
  }, undefined, () => onCaption('3D preview unavailable'));

  // ---- State & timeline ----
  const st = { dirt: 1, foam: 0, water: 0, gloss: 0, tire: 0, interior: 0, open: 0, sparkle: 0, gold: 0, ring: 0, sweep: -1, cabin: 0 };
  let tasks = [], t0 = 0;
  const S = (start, dur, fn, caption) => tasks.push({ start, dur, fn, caption, said: false });
  const to = (k, v) => { let from; return t => { if (from === undefined) from = st[k]; st[k] = lerp(from, v, ease(t)); }; };

  function plan(level) {
    if (!ready) { pending = level; return; }
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
      // keep the whole car in frame whatever the stage shape (phones, narrow columns)
      camera.position.setLength(Math.max(8, 3.0 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)));
      camera.updateProjectionMatrix();
    }
  }

  const tmp = new THREE.Color();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = clock.getDelta(), time = clock.elapsedTime;
    const now = performance.now() / 1000 - t0;
    for (const k of tasks) {
      const p = (now - k.start) / k.dur;
      if (p >= 0) { k.fn(Math.min(1, p)); if (k.caption && !k.said) { k.said = true; onCaption(k.caption); } }
    }
    // paint: dusty -> foam -> original -> extra gloss
    for (const p of M.paint) {
      p.m.color.copy(p.color).lerp(DIRTY, st.dirt * .8).lerp(FOAM, st.foam * .85);
      p.m.roughness = Math.max(.05, lerp(p.rough, .85, st.dirt) - st.gloss * .15 + st.foam * .4);
      p.m.clearcoat = Math.min(1, p.coat * (1 - st.dirt) + st.gloss * .4);
    }
    for (const g of M.glass) { g.m.roughness = lerp(g.rough, .45, st.dirt * (1 - st.open)); g.m.color.copy(g.color).lerp(tmp.set('#6f6253'), st.dirt * .2); }
    for (const t of M.tires) { t.m.color.copy(t.color).lerp(tmp.set('#5a5148'), (1 - st.tire) * .7); t.m.roughness = lerp(.95, Math.min(t.rough, .4), st.tire); }
    for (const r of M.rims) { r.m.color.copy(r.color).lerp(tmp.set('#4d463d'), (1 - st.tire) * .7); r.m.roughness = lerp(.75, r.rough, st.tire); }
    for (const s of M.seats) { s.m.color.copy(s.color).lerp(tmp.set('#5b4a40'), (1 - st.interior) * .75); s.m.roughness = lerp(.95, s.rough, st.interior); }
    for (const l of M.lights) l.m.emissiveIntensity = (l.glow ?? 1) * (1 + st.ring * 1.5);
    cabinLight.intensity = st.cabin * (2.5 + Math.sin(time * 6) * .8);
    cabinLight.position.x = Math.sin(time * 1.6) * cabin.w;
    foam.material.opacity = st.foam;
    water.material.opacity = st.water * .8;
    sparkle.material.opacity = st.sparkle * (.4 + .6 * Math.abs(Math.sin(time * 3)));
    gold.material.opacity = st.gold * .9;
    bubbles.material.opacity = st.cabin * .9;
    ring.material.opacity = st.ring * (.5 + .3 * Math.sin(time * 2));
    ring.scale.setScalar(1 + Math.sin(time * 2) * .02);
    sweep.intensity = st.sweep > -1 && st.sweep < 1 ? 14 : 0;
    sweep.position.set(lerp(-3, 3, (st.sweep + 1) / 2 || 0), 2.1, 1.6);
    if (st.water > 0) { const a = water.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 4; if (y < 0) y = 3; a.setY(i, y); } a.needsUpdate = true; }
    if (st.gold > 0) { const a = gold.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * .5; if (y > 2.2) y = 0; a.setY(i, y); } a.needsUpdate = true; }
    if (st.cabin > 0) { const a = bubbles.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * .4; if (y > cabin.y1) y = cabin.y0; a.setY(i, y); } a.needsUpdate = true; }
    resize();
    controls.update();
    renderer.render(scene, camera);
  }
  frame();

  return { setLevel: plan };
}
