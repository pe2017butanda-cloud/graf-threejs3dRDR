import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

/* =====================================================================
   CONFIGURACIÓN: aquí cambias rutas y ajustes sin tocar el resto
   ===================================================================== */
const CONFIG = {
  // Modelo de John Marston (FBX con skin)
  model: 'assets/models/JohnMarston.fbx',
  // Animaciones de Mixamo (FBX "Without Skin", marcar "In Place")
  // Cada estado prueba los archivos en orden y usa el primero que exista
  animsPath: 'assets/models/anims/',
  anims: {
    idle: ['Idle.fbx', 'Rifle Idle.fbx', 'Breathing Idle.fbx'],
    walk: ['Walking.fbx', 'Walk With Rifle.fbx', 'Start Walking.fbx'],
    run:  ['Running.fbx', 'Rifle Run.fbx', 'Rifle Run In Place.fbx'],
    jump: ['Jump.fbx', 'Rifle Jump.fbx', 'Rifle Jump In Place.fbx'],
    aim:   ['Rifle Aiming Idle.fbx', 'Aiming Idle.fbx', 'Rifle Aim.fbx'],   // apuntar (en bucle)
    aimWalk: ['Rifle Walking.fbx', 'Walking With Rifle.fbx', 'Rifle Walk.fbx'], // (opcional) caminar apuntando
    shoot: ['Firing Rifle.fbx', 'Shooting Rifle.fbx', 'Rifle Fire.fbx'],    // disparo (una vez)
  },
  // Texturas del modelo (se asignan a mano para no depender de las rutas internas del FBX)
  heroTextures: {
    body:   'assets/models/player_default_intro_alphakill_d1.png',
    lasso:  'assets/models/melee_lasso01.png',
    rifle:  'assets/models/repeater_carabine01.png',
  },
  hdr: 'assets/hdr/sunset.hdr',               // ambiente 360° HDR
  groundTexture: 'assets/textures/ground.jpg', // textura del piso (opcional)
  music: 'assets/audio/rdr2.mp3',             // música de fondo

  characterHeight: 1.8,   // el modelo se escala automáticamente a esta altura (m)
  modelYawOffset: 0,      // pon Math.PI si el modelo aparece mirando hacia atrás
  lockHipsY: false,       // true si el personaje se ve hundido o flotando al animar

  // Retargeting Mixamo → tu esqueleto
  boneMap: {},            // override manual, ej: { LeftForeArm: 'elbow_l', RightHand: 'hand_r' }
  retargetYaw: null,      // null = autodetecta hacia dónde mira el modelo; o pon un ángulo en rad
  useBindPose: true,      // pone el esqueleto en su pose de reposo real antes de retargetear (arregla brazos raros)

  // Rifle: al apuntar, el cañón se alinea con la mira y el punto de agarre se pega a la mano derecha.
  // Ajústalo en vivo desde la consola, por ejemplo:
  //   CONFIG.rifleFlipFwd = false     (si el cañón apunta hacia atrás)
  //   CONFIG.rifleFlipUp = true       (si el rifle sale boca abajo)
  //   CONFIG.rifleGrip.rot[2] = 90    (giro alrededor del cañón: prueba 90, 180, 270)
  //   CONFIG.rifleGrip.pos = [0.05, 0, 0.1]   ([derecha, arriba, adelante] en metros)
  rifleBone: 'carbine_root',
  rifleGrip: { pos: [0, 0, 0], rot: [0, 0, 0] },
  rifleMaxPitch: 35,      // inclinación máxima (grados) del rifle hacia arriba/abajo
  rifleGripFrac: 0.35,    // punto del rifle que agarra la mano (0 = culata, 1 = boca del cañón)
  rifleFlipFwd: true,     // corrige el cañón que apuntaba hacia atrás (pon false si queda al revés)
  rifleFlipUp: false,
  rifleAlwaysHeld: true,  // true = el rifle siempre va en la mano (false = a la espalda cuando no apuntas)
  rifleCarryPitch: -20,   // inclinación (grados) del rifle cuando no apuntas; negativo = hacia abajo
  shootCooldown: 0.35,    // segundos entre disparos
  shotSpeed: 5,           // m/s que gana un objeto al recibir un disparo

  walkSpeed: 2.6,
  runSpeed: 6.0,
  aimWalkSpeed: 2.2,      // velocidad al moverte mientras apuntas
  mouseSensitivity: 0.0022, // sensibilidad de la cámara (rad por píxel); súbela o bájala a gusto
  invertY: false,         // true = invierte el eje vertical del mouse
  shoulderOffset: 0.16,   // cámara "sobre el hombro": qué tanto se corre el personaje a la izquierda (proporción de la distancia; 0 = centrado)
  camHeight: 0.7,         // altura (sobre el centro del cuerpo) del punto al que mira la cámara
  defaultDistance: 3.2,   // zoom inicial: distancia de la cámara al personaje (m). Menor = más cerca
  defaultPolar: 1.45,     // ángulo vertical inicial de la cámara en rad (1.57 = a la altura del personaje, menor = más desde arriba)
  jumpSpeed: 7.5,
  turnSpeed: 6.0,         // rad/s del giro suave de 90°

  arenaHalf: 40,          // el escenario mide (2*arenaHalf)² metros
  fog: { color: 0xcbc8c2, near: 14, far: 80 }, // niebla gris clara
  sunPosition: new THREE.Vector3(40, 22, 30),  // ajústala para que coincida con el sol del HDR
};
window.CONFIG = CONFIG; // para ajustar valores desde la consola del navegador

/* =====================================================================
   UTILIDADES
   ===================================================================== */
const missing = [];
function report(url) {
  missing.push(url);
  console.warn('[Archivo no encontrado, usando respaldo]', url);
}

const barFill = document.getElementById('barFill');
const loadText = document.getElementById('loadText');
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  barFill.style.width = `${Math.round((loaded / total) * 100)}%`;
};

const fbxLoader = new FBXLoader(manager);
const rgbeLoader = new RGBELoader(manager);
const texLoader = new THREE.TextureLoader(manager);

const loadFBX = (url) => new Promise((res) =>
  fbxLoader.load(url, res, undefined, () => { report(url); res(null); }));

const loadFBXQuiet = (url) => new Promise((res) =>
  fbxLoader.load(url, res, undefined, () => res(null)));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* =====================================================================
   RENDERER, ESCENA, CÁMARA
   ===================================================================== */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
stage.insertBefore(renderer.domElement, stage.firstChild);

const scene = new THREE.Scene();
// Niebla gris clara: los objetos se desvanecen al alejarse de la cámara
scene.fog = new THREE.Fog(CONFIG.fog.color, CONFIG.fog.near, CONFIG.fog.far);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

/* =====================================================================
   CIELO HDR 360° (con respaldo procedural si falta el .hdr)
   ===================================================================== */
async function setupSky() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let tex = await new Promise((res) =>
    rgbeLoader.load(CONFIG.hdr, res, undefined, () => { report(CONFIG.hdr); res(null); }));

  if (tex) {
    tex.mapping = THREE.EquirectangularReflectionMapping;
  } else {
    // Atardecer procedural: degradado cielo + resplandor del sol
    tex = canvasTex(1024, 512, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0.00, '#27355a');
      grad.addColorStop(0.30, '#8a6a7a');
      grad.addColorStop(0.46, '#f0a95f');
      grad.addColorStop(0.50, '#f6c98a');
      grad.addColorStop(0.51, '#5a4330');
      grad.addColorStop(1.00, '#2a1d12');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      const sun = g.createRadialGradient(w * 0.72, h * 0.47, 4, w * 0.72, h * 0.47, 150);
      sun.addColorStop(0, 'rgba(255,240,200,1)');
      sun.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = sun; g.fillRect(0, 0, w, h);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.mapping = THREE.EquirectangularReflectionMapping;
  }
  scene.background = tex;
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
}

/* =====================================================================
   FÍSICA (Cannon-es)
   ===================================================================== */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

const matGround = new CANNON.Material('ground');
const matHero = new CANNON.Material('hero');
const matObj = new CANNON.Material('obj');
const matBall = new CANNON.Material('ball');
const addContact = (a, b, o) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, o));
addContact(matHero, matGround, { friction: 0, restitution: 0 });
addContact(matHero, matObj, { friction: 0, restitution: 0 });
addContact(matHero, matBall, { friction: 0, restitution: 0.3 });
addContact(matObj, matGround, { friction: 0.6, restitution: 0.1 });
addContact(matObj, matObj, { friction: 0.5, restitution: 0.1 });
addContact(matBall, matGround, { friction: 0.3, restitution: 0.65 });
addContact(matBall, matObj, { friction: 0.3, restitution: 0.4 });

const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: matGround });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const dynamics = []; // { mesh, body, home }

function addStaticBox(x, y, z, hx, hy, hz, rotY = 0) {
  const b = new CANNON.Body({ mass: 0, material: matObj });
  b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  b.position.set(x, y, z);
  b.quaternion.setFromEuler(0, rotY, 0);
  world.addBody(b);
  return b;
}

function addDynamic({ mesh, shape, mass, pos, material = matObj, damping = 0.25 }) {
  const b = new CANNON.Body({ mass, material, linearDamping: damping, angularDamping: damping });
  b.addShape(shape);
  b.position.set(pos[0], pos[1], pos[2]);
  b.allowSleep = true;
  b.sleepSpeedLimit = 0.15;
  b.sleepTimeLimit = 0.8;
  world.addBody(b);
  mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(mesh);
  dynamics.push({ mesh, body: b, home: { p: b.position.clone(), q: b.quaternion.clone() } });
  return b;
}

function resetObjects() {
  for (const d of dynamics) {
    d.body.position.copy(d.home.p);
    d.body.quaternion.copy(d.home.q);
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    d.body.wakeUp();
  }
}

/* =====================================================================
   MATERIALES Y TEXTURAS PROCEDURALES
   ===================================================================== */
const woodBase = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#5d3f24' : '#7a5632';
    g.fillRect(0, i * 32, w, 30);
  }
  g.strokeStyle = 'rgba(0,0,0,.25)';
  for (let i = 0; i < 120; i++) {
    const y = Math.random() * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 6); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,.55)';
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 32 + 30, w, 2);
});

function woodMat(rx = 1, ry = 1, tint = 0xffffff) {
  const t = woodBase.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, color: tint, roughness: 0.92 });
}

/* =====================================================================
   PISO CON TEXTURA (respaldo procedural de tierra del desierto)
   ===================================================================== */
async function setupGround() {
  const tex = await new Promise((res) =>
    texLoader.load(CONFIG.groundTexture, res, undefined, () => { report(CONFIG.groundTexture); res(null); }));

  let map = tex;
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
  } else {
    map = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#a07f55'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const l = 30 + Math.random() * 40;
        g.fillStyle = `hsla(30, 35%, ${l}%, ${0.15 + Math.random() * 0.25})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(70,50,32,${0.25 + Math.random() * 0.3})`;
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2, 0, 0, 7);
        g.fill();
      }
    });
  }
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(60, 60);
  map.anisotropy = 8;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/* =====================================================================
   ILUMINACIÓN: sol bajo + hemisférica + fogata + farol
   ===================================================================== */
scene.add(new THREE.HemisphereLight(0xffd9a8, 0x4a3524, 0.8));

// Luz de relleno fría que sigue a la cámara: levanta los detalles oscuros del personaje
const fill = new THREE.DirectionalLight(0xbfd2ff, 0.9);
scene.add(fill, fill.target);

const sun = new THREE.DirectionalLight(0xffc78a, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* =====================================================================
   ESCENARIO: saloon, molino, cactus, fogata, farol, cerca perimetral
   ===================================================================== */
const animated = { blades: null, fire: null, fireLight: null, lanternSwing: null };

function buildSaloon() {
  const g = new THREE.Group();
  g.position.set(-14, 0, -24);

  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 8), woodMat(4, 2, 0xd8c3a5));
  body.position.y = 3;
  const facade = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 0.5), woodMat(4, 1, 0xe0cba8));
  facade.position.set(0, 7.3, 3.9);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 3.4), woodMat(4, 1, 0x9a8468));
  roof.position.set(0, 4.8, 5.6);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 1.8),
    new THREE.MeshStandardMaterial({
      map: canvasTex(512, 128, (c, w, h) => {
        c.fillStyle = '#3a2412'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#d9a441'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
        c.fillStyle = '#e8c36a'; c.font = 'bold 78px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('SALOON', w / 2, h / 2 + 4);
      }),
      roughness: 0.8,
    })
  );
  sign.position.set(0, 7.3, 4.2);

  g.add(body, facade, roof, sign);
  for (const px of [-6.8, 6.8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.8, 0.3), woodMat(1, 4));
    post.position.set(px, 2.4, 7.1);
    g.add(post);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);

  addStaticBox(-14, 3, -24, 7, 3, 4);
  addStaticBox(-14, 7.3, -20.1, 7, 1.3, 0.3);
  addStaticBox(-14 - 6.8, 2.4, -24 + 7.1, 0.15, 2.4, 0.15);
  addStaticBox(-14 + 6.8, 2.4, -24 + 7.1, 0.15, 2.4, 0.15);
}

function buildWindmill() {
  const g = new THREE.Group();
  g.position.set(26, 0, -22);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.7, 12, 8), woodMat(2, 6, 0xcdb592));
  tower.position.y = 6;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x555049, metalness: 0.6, roughness: 0.5 }));
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 12.4, 1.1);

  const blades = new THREE.Group();
  blades.position.copy(hub.position);
  const bladeMat = woodMat(1, 1, 0xe2d2b4);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.2, 0.08), bladeMat);
    b.position.y = 2.3;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 6) * Math.PI * 2;
    arm.add(b);
    blades.add(arm);
  }
  g.add(tower, hub, blades);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  animated.blades = blades;
  addStaticBox(26, 6, -22, 1.3, 6, 1.3);
}

function buildCactus(x, z, s = 1) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4e7a43, roughness: 0.9 });
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.4 * s, 3 * s, 10), mat);
  trunk.position.y = 1.5 * s;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 10, 8), mat);
  cap.position.y = 3 * s;
  g.add(trunk, cap);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 1.1 * s, 8), mat);
    arm.position.set(side * 0.65 * s, (1.7 + (side > 0 ? 0.3 : 0)) * s, 0);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.5 * s, 8), mat);
    link.rotation.z = Math.PI / 2;
    link.position.set(side * 0.4 * s, arm.position.y - 0.45 * s, 0);
    g.add(arm, link);
  }
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * 6;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  addStaticBox(x, 1.5 * s, z, 0.45 * s, 1.5 * s, 0.45 * s);
}

function buildCampfire(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const logMat = woodMat(1, 1, 0x8a6a4a);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 8), logMat);
    log.rotation.z = Math.PI / 2.4;
    log.rotation.y = (i / 4) * Math.PI * 2;
    log.position.y = 0.22;
    g.add(log);
  }
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), stoneMat);
    st.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75);
    g.add(st);
  }
  const flames = new THREE.Group();
  const colors = [0xff5a1a, 0xff8a2a, 0xffc04a];
  colors.forEach((c, i) => {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.32 - i * 0.07, 1.0 - i * 0.15, 10),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, fog: false })
    );
    f.position.y = 0.55;
    flames.add(f);
  });
  g.add(flames);
  g.traverse((o) => { if (o.isMesh && !flames.children.includes(o)) { o.castShadow = true; } });
  scene.add(g);

  const light = new THREE.PointLight(0xff7a2a, 40, 20, 2);
  light.position.set(x, 1.1, z);
  scene.add(light);

  animated.fire = flames;
  animated.fireLight = light;
  addStaticBox(x, 0.3, z, 0.7, 0.3, 0.7);
}

function buildLantern(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const iron = new THREE.MeshStandardMaterial({ color: 0x24201c, metalness: 0.7, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.6, 8), iron);
  pole.position.y = 1.8;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.07), iron);
  arm.position.set(0.5, 3.5, 0);
  g.add(pole, arm);

  const swing = new THREE.Group();
  swing.position.set(1.0, 3.5, 0);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.4, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xffb84d, emissiveIntensity: 2.2 })
  );
  lamp.position.y = -0.3;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 4), iron);
  roof.position.y = -0.02;
  roof.rotation.y = Math.PI / 4;
  const light = new THREE.PointLight(0xffc266, 22, 16, 2);
  light.position.y = -0.3;
  swing.add(lamp, roof, light);
  g.add(swing);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);

  animated.lanternSwing = swing;
  addStaticBox(x, 1.8, z, 0.12, 1.8, 0.12);
}

// Cerca de madera perimetral + muros físicos invisibles (fronteras del escenario)
function buildBoundary() {
  const H = CONFIG.arenaHalf;
  const inset = H - 0.6;
  const postGeo = new THREE.BoxGeometry(0.25, 1.5, 0.25);
  const mat = woodMat(1, 2, 0xb59a78);
  const step = 4;

  const rails = [];
  const make = (x, z, rotY, len) => {
    for (const y of [0.55, 1.15]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.08), mat);
      r.position.set(x, y, z);
      r.rotation.y = rotY;
      r.castShadow = true;
      rails.push(r);
    }
  };
  for (let t = -H; t <= H; t += step) {
    for (const [x, z] of [[t, -inset], [t, inset], [-inset, t], [inset, t]]) {
      const p = new THREE.Mesh(postGeo, mat);
      p.position.set(x, 0.75, z);
      p.castShadow = true;
      scene.add(p);
    }
  }
  make(0, -inset, 0, H * 2);
  make(0, inset, 0, H * 2);
  make(-inset, 0, Math.PI / 2, H * 2);
  make(inset, 0, Math.PI / 2, H * 2);
  rails.forEach((r) => scene.add(r));

  const t = 1, h = 4;
  addStaticBox(0, h, -H - t + 0.4, H + 2, h, t);
  addStaticBox(0, h, H + t - 0.4, H + 2, h, t);
  addStaticBox(-H - t + 0.4, h, 0, t, h, H + 2);
  addStaticBox(H + t - 0.4, h, 0, t, h, H + 2);
}

/* =====================================================================
   OBJETOS 3D CON DINÁMICA FÍSICA (cajas, barriles, rocas, pelota, planta rodante)
   ===================================================================== */
let tumbleweed = null;

function buildDynamicObjects() {
  // Pirámide de 6 cajas (se derrumba al empujarla)
  const crateMat = woodMat(1, 1, 0xd9b98c);
  const bx = -9, bz = -3;
  const crateAt = (x, y, z) => addDynamic({
    mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crateMat),
    shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
    mass: 5, pos: [x, y, z],
  });
  [0, 1, 2].forEach((i) => crateAt(bx + i * 1.05, 0.5, bz));
  [0, 1].forEach((i) => crateAt(bx + 0.525 + i * 1.05, 1.55, bz));
  crateAt(bx + 1.05, 2.6, bz);

  // Barriles con aros metálicos
  const barrelMat = woodMat(2, 1, 0xc9a173);
  const hoopMat = new THREE.MeshStandardMaterial({ color: 0x2b2824, metalness: 0.8, roughness: 0.5 });
  [[6, 14], [-3, 18], [14, 4], [-16, 8]].forEach(([x, z]) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 1.1, 14), barrelMat));
    for (const y of [-0.35, 0.35]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 16), hoopMat);
      hoop.rotation.x = Math.PI / 2; hoop.position.y = y;
      g.add(hoop);
    }
    addDynamic({ mesh: g, shape: new CANNON.Box(new CANNON.Vec3(0.38, 0.55, 0.38)), mass: 8, pos: [x, 0.6, z] });
  });

  // Rocas (esferas rodantes con geometría irregular)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 1, flatShading: true });
  [[-4, 6, 0.6], [12, -2, 0.8], [-20, -8, 0.7], [20, 14, 0.55]].forEach(([x, z, r]) => {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (Math.random() - 0.5) * 0.28;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    addDynamic({ mesh: new THREE.Mesh(geo, rockMat), shape: new CANNON.Sphere(r * 0.92), mass: 40, pos: [x, r + 0.1, z], damping: 0.4 });
  });

  // Pelota para patear (muy cerca del punto de inicio)
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xa8532e, roughness: 0.6 })
  );
  addDynamic({ mesh: ball, shape: new CANNON.Sphere(0.35), mass: 1.5, pos: [2.5, 0.4, 20], material: matBall, damping: 0.1 });

  // Planta rodante: se mueve sola, empujada por el viento
  const tw = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.6, 1),
    new THREE.MeshStandardMaterial({ color: 0x9c7a48, roughness: 1, wireframe: true })
  );
  const twBody = addDynamic({ mesh: tw, shape: new CANNON.Sphere(0.55), mass: 1, pos: [-35, 0.6, 10], damping: 0.05 });
  tumbleweed = twBody;
}

function updateTumbleweed() {
  if (!tumbleweed) return;
  // viento hacia +X con ráfagas
  tumbleweed.wakeUp();
  if (tumbleweed.velocity.x < 3) tumbleweed.applyForce(new CANNON.Vec3(9, 0, Math.sin(performance.now() * 0.001) * 2));
  if (tumbleweed.position.x > CONFIG.arenaHalf - 3) {
    tumbleweed.position.set(-CONFIG.arenaHalf + 3, 0.6, (Math.random() - 0.5) * 50);
    tumbleweed.velocity.setZero();
  }
}

/* =====================================================================
   PERSONAJE: John Marston (FBX) + animaciones + cuerpo físico
   ===================================================================== */
const hero = {
  group: new THREE.Group(),
  model: null,
  mixer: null,
  actions: {},
  clips: {},
  state: 'idle',
  yaw: Math.PI,
  targetYaw: Math.PI,
  moveAngle: 0,        // dirección de movimiento relativa al frente (0 = adelante)
  visualYaw: Math.PI,  // hacia dónde mira el modelo (suavizado)
  speed: 0,
  jumping: false,
  jumpTimer: 0,
  aiming: false,
  shootTimer: 0,
  weaponTimer: 0,      // mientras > 0 el rifle está en la mano (aunque no estés apuntando)
  faceTarget: Math.PI, // hacia dónde debe mirar el modelo
  bones: {},           // huesos útiles del modelo (mano derecha)
  rifle: null,         // { bone, pos, quat, shape } del hueso del arma
};
scene.add(hero.group);

// Cuerpo físico: dos esferas apiladas (cápsula), sin rotación
const heroBody = new CANNON.Body({ mass: 70, material: matHero, fixedRotation: true, linearDamping: 0.05 });
heroBody.addShape(new CANNON.Sphere(0.4), new CANNON.Vec3(0, -0.5, 0));
heroBody.addShape(new CANNON.Sphere(0.4), new CANNON.Vec3(0, 0.5, 0));
heroBody.allowSleep = false; // si se duerme, la física ignora su velocidad y no camina
heroBody.position.set(0, 0.95, 26);
heroBody.updateMassProperties();
world.addBody(heroBody);
const HERO_FEET = 0.9; // distancia del centro del cuerpo a los pies

const STATE_LABEL = {
  idle: 'Quieto', walk: 'Caminando', run: 'Corriendo', jump: 'Saltando',
  aim: 'Apuntando', aimwalk: 'Apuntando y moviéndose', shoot: 'Disparando',
};
const stateEl = document.getElementById('stateLabel') || { textContent: '' }; // el HUD de texto ya no existe

// Quita el desplazamiento de raíz del FBX para que el movimiento sea fluido
// y lo controle la física (evita que el personaje "regrese" al inicio del clip).
function lockRootMotion(clip, lockY) {
  for (const track of clip.tracks) {
    if (!/hips/i.test(track.name) || !track.name.endsWith('.position')) continue;
    const v = track.values;
    const x0 = v[0], y0 = v[1], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
      if (lockY) v[i + 1] = y0;
    }
  }
}

// Texturas del personaje cargadas por nosotros
const heroTex = {};
async function loadHeroTextures() {
  for (const [key, url] of Object.entries(CONFIG.heroTextures)) {
    heroTex[key] = await new Promise((res) =>
      texLoader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        res(t);
      }, undefined, () => { report(url); res(null); }));
  }
}

// Elige la textura según el nombre de la malla o del material
function pickHeroTexture(mesh, mat) {
  const n = `${mesh.name} ${mat.name}`.toLowerCase();
  if (/lasso|rope|melee|lazo/.test(n)) return heroTex.lasso;
  if (/carbine|carabine|repeater|rifle|gun|weapon|arma/.test(n)) return heroTex.rifle;
  return heroTex.body;
}

// Ajusta los nombres de huesos del clip a los del modelo (ej. "mixamorig:Hips" -> "Hips")
function retargetNames(clip, model) {
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = true; });
  const key = (n) => n.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');
  const byKey = {};
  Object.keys(bones).forEach((n) => { byKey[key(n)] = n; });
  let ok = 0, fixed = 0, lost = 0;
  for (const t of clip.tracks) {
    const i = t.name.indexOf('.');
    const b = t.name.slice(0, i);
    if (bones[b]) { ok++; continue; }
    const m = byKey[key(b)];
    if (m) { t.name = m + t.name.slice(i); fixed++; ok++; } else lost++;
  }
  if (lost) console.warn(`Clip "${clip.name}": ${lost} pistas sin hueso equivalente (${fixed} corregidas)`);
  return { ok, total: clip.tracks.length };
}

/* ---------- RETARGETING AUTOMÁTICO MIXAMO → ESQUELETO DEL MODELO ---------- */
const MIXAMO_TO_MODEL = {
  hips:    ['pelvis', 'hips', 'hip'],
  spine:   ['spine00', 'spine0', 'spine'],
  spine1:  ['spine01', 'spine1'],
  spine2:  ['spine02', 'spine2'],
  neck:    ['neck'],
  head:    ['head'],
  shoulder:['clavicle', 'shoulder', 'collar'],
  arm:     ['arm', 'upperarm'],
  forearm: ['forearm', 'elbow', 'lowerarm'],
  hand:    ['hand', 'wrist'],
  upleg:   ['thigh', 'upleg', 'upperleg', 'hip', 'leg'],
  leg:     ['calf', 'knee', 'lowerleg', 'shin'],
  foot:    ['foot', 'ankle'],
  toebase: ['toe', 'toebase', 'ball'],
};

// "arm_l" -> {side:'l', base:'arm'} · "LeftUpLeg" -> {side:'l', base:'upleg'}
function splitSide(name) {
  const s = name.toLowerCase().replace(/^mixamorig:?/, '');
  let side = '';
  let base = s.replace(/(^|[_\-.:])(left|right|l|r)(?=[_\-.:]|$)/, (m, p, k) => { side = k[0]; return p; });
  if (!side) base = s.replace(/^(left|right)/, (m) => { side = m[0]; return ''; });
  return { side, base: base.replace(/[^a-z0-9]/g, '') };
}

function restOf(root, obj) {
  const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(obj.matrixWorld);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  return { p, q };
}

function buildBoneMap(srcRoot, model) {
  const tgt = {};
  model.traverse((o) => {
    if (!o.isBone) return;
    const { side, base } = splitSide(o.name);
    const k = `${side}:${base}`;
    if (!tgt[k]) tgt[k] = o;
  });
  const used = new Set(), pairs = new Map();
  let total = 0;
  srcRoot.traverse((o) => {
    if (!(o.isBone || /^mixamorig/i.test(o.name))) return;
    const { side, base } = splitSide(o.name);
    const cands = MIXAMO_TO_MODEL[base];
    if (!cands) return;
    total++;
    const manual = CONFIG.boneMap[o.name.replace(/^mixamorig:?/, '')];
    let t = manual ? model.getObjectByName(manual) : null;
    if (!t) for (const c of cands) {
      const b = tgt[`${side}:${c}`];
      if (b && !used.has(b)) { t = b; break; }
    }
    if (t) { used.add(t); pairs.set(o, t); }
    else console.warn('Sin equivalente en tu esqueleto para:', o.name);
  });
  return { pairs, total };
}

// Detecta cuánto está girado tu modelo respecto a Mixamo (en pasos de 90°)
function autoYaw(pairs, srcRoot, model) {
  const find = (base, side) => {
    for (const [s, t] of pairs) {
      const i = splitSide(s.name);
      if (i.base === base && i.side === side) return [s, t];
    }
    return null;
  };
  const pick = (base) => { const l = find(base, 'l'), r = find(base, 'r'); return l && r ? [l, r] : null; };
  const set = pick('upleg') || pick('arm') || pick('shoulder');
  if (!set) return 0;
  const [l, r] = set;
  const ang = (root, a, b) => {
    const d = restOf(root, b).p.sub(restOf(root, a).p);
    return Math.atan2(d.x, d.z);
  };
  const yaw = ang(model, l[1], r[1]) - ang(srcRoot, l[0], r[0]);
  return Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
}

/* Pone el esqueleto en su pose de reposo real (bind pose). Los FBX a veces guardan los
   huesos en otra pose (brazos doblados, pose de juego) distinta de la que se usó para el skin;
   retargetear sobre esa pose es lo que dejaba los brazos deformes. */
function applyBindPose(model) {
  model.updateMatrixWorld(true);
  const bind = new Map();
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    o.skeleton.bones.forEach((b, i) => {
      const inv = o.skeleton.boneInverses[i];
      if (inv && !bind.has(b)) bind.set(b, inv.clone().invert());
    });
  });
  const order = [];
  model.traverse((o) => { if (bind.has(o)) order.push(o); });
  const m = new THREE.Matrix4();
  for (const b of order) {
    b.parent.updateWorldMatrix(true, false);
    m.copy(b.parent.matrixWorld).invert().multiply(bind.get(b));
    m.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrix();
  }
  model.updateMatrixWorld(true);
  console.info(`Pose de reposo (bind) aplicada a ${order.length} huesos`);
}

/* Retargeting por orientación en el mundo (funciona aunque un esqueleto esté en T-pose y el otro en A-pose):
   - Brazos y piernas (clavícula, brazo, antebrazo, muslo, pantorrilla, pie): el hueso apunta
     hacia donde apunta el mismo hueso de Mixamo en cada fotograma.
   - Cadera, columna, cuello y cabeza: se copia el giro respecto a su reposo.
   - Manos y dedos del pie: siguen a su hueso padre.
   Se muestrea la animación a 30 fps y se generan pistas nuevas para tu esqueleto. */
function retargetClip(srcRoot, clip, model) {
  srcRoot.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const { pairs, total } = buildBoneMap(srcRoot, model);
  if (pairs.size < 10) return { clip, mapped: pairs.size, total, hand: null };

  const yaw = CONFIG.retargetYaw ?? autoYaw(pairs, srcRoot, model);
  const R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const Rinv = R.clone().invert();
  console.info(`Retarget "${clip.name}": ${pairs.size}/${total} huesos · giro ${Math.round(yaw * 180 / Math.PI)}°`);

  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const srcInv = new THREE.Matrix4().copy(srcRoot.matrixWorld).invert();
  const tgtInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const readSrc = (o, p, q) => { m.multiplyMatrices(srcInv, o.matrixWorld).decompose(p, q, sc); };

  // Una entrada por cada hueso de Mixamo emparejado con uno de tu modelo
  const entries = new Map();  // hueso destino -> entrada
  const byRole = new Map();   // "base:lado" -> entrada
  for (const [s, t] of pairs) {
    const { side, base } = splitSide(s.name);
    const e = { s, t, base, side, mode: 'delta', child: null, parent: null, dRest: null, sRestInv: null, values: null, prev: new THREE.Quaternion() };
    entries.set(t, e);
    byRole.set(`${base}:${side}`, e);
  }

  // Reposo del esqueleto destino (en el marco de la raíz del modelo)
  const objs = [];
  model.traverse((o) => { if (o !== model) objs.push(o); });
  const restWQ = new Map(), restPos = new Map(), restLQ = new Map();
  for (const o of objs) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    m.multiplyMatrices(tgtInv, o.matrixWorld).decompose(p, q, sc);
    restPos.set(o, p);
    restWQ.set(o, q);
    restLQ.set(o, o.quaternion.clone());
  }

  const CHAIN = { shoulder: 'arm', arm: 'forearm', forearm: 'hand', upleg: 'leg', leg: 'foot', foot: 'toebase' };
  const FOLLOW = { hand: 'forearm', toebase: 'foot' };
  const sp = new THREE.Vector3(), sq = new THREE.Quaternion();
  for (const e of entries.values()) {
    const c = CHAIN[e.base] && byRole.get(`${CHAIN[e.base]}:${e.side}`);
    const par = FOLLOW[e.base] && byRole.get(`${FOLLOW[e.base]}:${e.side}`);
    if (c) {
      const d = restPos.get(c.t).clone().sub(restPos.get(e.t));
      if (d.lengthSq() > 1e-12) {
        e.mode = 'dir';
        e.child = c;
        e.dRest = d.normalize().applyQuaternion(restWQ.get(e.t).clone().invert());
      }
    } else if (par) {
      e.mode = 'follow';
      e.parent = par;
    }
    readSrc(e.s, sp, sq);
    e.sRestInv = sq.clone().invert();
  }

  // Muestreo de la animación de Mixamo
  const mixer = new THREE.AnimationMixer(srcRoot);
  mixer.clipAction(clip).play();
  const n = Math.max(2, Math.round(clip.duration * 30) + 1);
  const times = new Float32Array(n);
  for (const e of entries.values()) e.values = new Float32Array(n * 4);

  const IDENT = new THREE.Quaternion();
  const WQ = new Map();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const qa = new THREE.Quaternion(), tq = new THREE.Quaternion(), D = new THREE.Quaternion();

  for (let f = 0; f < n; f++) {
    times[f] = clip.duration * f / (n - 1);
    mixer.setTime(times[f]);
    srcRoot.updateMatrixWorld(true);
    WQ.clear();

    for (const o of objs) {
      const parentWQ = o.parent === model ? IDENT : WQ.get(o.parent);
      const e = entries.get(o);
      let w;
      if (!e) {
        w = parentWQ.clone().multiply(restLQ.get(o));
      } else if (e.mode === 'dir') {
        readSrc(e.s, pa, qa);
        readSrc(e.child.s, pb, qa);
        const ds = pb.sub(pa).normalize().applyQuaternion(R);
        const wc = parentWQ.clone().multiply(restLQ.get(o));
        const cur = e.dRest.clone().applyQuaternion(wc);
        w = new THREE.Quaternion().setFromUnitVectors(cur, ds).multiply(wc);
      } else if (e.mode === 'follow') {
        const pt = e.parent.t;
        w = WQ.get(pt).clone().multiply(restWQ.get(pt).clone().invert()).multiply(restWQ.get(o));
      } else {
        readSrc(e.s, pa, qa);
        D.copy(R).multiply(qa).multiply(e.sRestInv).multiply(Rinv);
        w = D.clone().multiply(restWQ.get(o));
      }
      WQ.set(o, w);

      if (e) {
        tq.copy(parentWQ).invert().multiply(w).normalize();
        if (f > 0 && tq.dot(e.prev) < 0) tq.set(-tq.x, -tq.y, -tq.z, -tq.w); // evita saltos de signo
        e.prev.copy(tq);
        e.values[f * 4] = tq.x; e.values[f * 4 + 1] = tq.y; e.values[f * 4 + 2] = tq.z; e.values[f * 4 + 3] = tq.w;
      }
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(srcRoot);

  const tracks = [];
  for (const e of entries.values()) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${e.t.name}.quaternion`, times.slice(), e.values));
  }
  const handEntry = byRole.get('hand:r');
  return {
    clip: new THREE.AnimationClip(clip.name, clip.duration, tracks),
    mapped: pairs.size, total,
    hand: handEntry ? handEntry.t : null,
  };
}

/* ---------- ANÁLISIS DEL RIFLE ----------
   Mide los vértices pegados al hueso del rifle (en el espacio local de ese hueso) y calcula
   con un análisis de componentes principales: el eje largo (cañón), el eje vertical y los extremos.
   Así el rifle se puede alinear con la mira sin importar cómo estén orientados los ejes del hueso. */
function analyzeRifle(model, bone) {
  const pts = [], v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const bi = o.skeleton.bones.indexOf(bone);
    if (bi < 0) return;
    const pos = o.geometry.attributes.position;
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    const M = new THREE.Matrix4().multiplyMatrices(o.skeleton.boneInverses[bi], o.bindMatrix);
    for (let i = 0; i < pos.count; i++) {
      const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      const wts = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      let w = 0;
      for (let k = 0; k < 4; k++) if (idx[k] === bi) w += wts[k];
      if (w < 0.5) continue;
      pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(M).clone());
    }
  });
  if (pts.length < 20) {
    console.warn('No pude medir el rifle (ninguna malla con skin en su hueso); se usará un eje por defecto.');
    return null;
  }

  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  c.divideScalar(pts.length);

  // Matriz de covarianza
  const C = new Array(9).fill(0);
  for (const p of pts) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    C[0] += x * x; C[1] += x * y; C[2] += x * z;
    C[4] += y * y; C[5] += y * z; C[8] += z * z;
  }
  C[3] = C[1]; C[6] = C[2]; C[7] = C[5];
  const mul = (a) => new THREE.Vector3(
    C[0] * a.x + C[1] * a.y + C[2] * a.z,
    C[3] * a.x + C[4] * a.y + C[5] * a.z,
    C[6] * a.x + C[7] * a.y + C[8] * a.z);
  const power = (a, avoid) => {
    for (let i = 0; i < 80; i++) {
      a = mul(a);
      if (avoid) a.addScaledVector(avoid, -a.dot(avoid));
      a.normalize();
    }
    return a;
  };
  const e1 = power(new THREE.Vector3(1, 0.31, 0.17).normalize());
  const seed = new THREE.Vector3(0.13, 1, 0.41);
  seed.addScaledVector(e1, -seed.dot(e1)).normalize();
  const e2 = power(seed, e1);

  // Extremos a lo largo del eje principal (relativos al centroide)
  let min = Infinity, max = -Infinity;
  for (const p of pts) {
    const d = v.copy(p).sub(c).dot(e1);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  // El centroide queda del lado "pesado" (culata + mecanismo); la boca del cañón es el extremo contrario
  const keep = (min + max) >= 0;
  const fwd = keep ? e1.clone() : e1.clone().negate();
  const lo = keep ? min : -max; // culata
  const hi = keep ? max : -min; // boca del cañón
  console.info('Rifle detectado · eje del cañón (local):', fwd.toArray().map((n) => +n.toFixed(2)),
    '· arriba:', e2.toArray().map((n) => +n.toFixed(2)), '· largo:', (hi - lo).toFixed(2));
  return { c, fwd, up: e2, lo, hi };
}

function buildFallbackHero() {
  // Vaquero simple de respaldo si no existe el FBX
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.8 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.9 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2f3b4d, roughness: 0.9 });
  const hat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  part(new THREE.BoxGeometry(0.24, 0.85, 0.3), jeans, -0.14, 0.43, 0);
  part(new THREE.BoxGeometry(0.24, 0.85, 0.3), jeans, 0.14, 0.43, 0);
  part(new THREE.BoxGeometry(0.62, 0.7, 0.34), vest, 0, 1.2, 0);
  part(new THREE.SphereGeometry(0.17, 14, 12), skin, 0, 1.72, 0);
  part(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 18), hat, 0, 1.82, 0);
  part(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 14), hat, 0, 1.92, 0);
  hero.group.add(g);
  hero.model = g;
}

async function loadHero() {
  await loadHeroTextures();
  const fbx = await loadFBX(CONFIG.model);
  if (!fbx) { buildFallbackHero(); return; }

  fbx.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    // Los FBX traen materiales Phong con brillo especular (efecto plástico):
    // se convierten a Standard mate para que se vean como tela y cuero.
    const convert = (m) => {
      if (!m) return m;
      console.info('Malla:', o.name, '| material:', m.name, '| textura del FBX:', m.map ? 'sí' : 'no');
      const map = pickHeroTexture(o, m) || null;
      const mat = new THREE.MeshStandardMaterial({
        name: m.name,
        map,
        color: map ? 0xffffff : 0x8a6a4a,
        roughness: 0.9,
        metalness: 0,
        envMapIntensity: 0.7,
        side: m.side,
      });
      m.dispose();
      return mat;
    };
    o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
  });

  if (CONFIG.useBindPose) applyBindPose(fbx);

  // Escala automática a la altura configurada y pies sobre y = 0
  fbx.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(fbx);
  const h = box.max.y - box.min.y;
  if (h > 0) fbx.scale.multiplyScalar(CONFIG.characterHeight / h);
  fbx.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(fbx);
  fbx.position.y -= box.min.y;
  fbx.rotation.y = CONFIG.modelYawOffset;

  hero.group.add(fbx);
  hero.model = fbx;
  hero.mixer = new THREE.AnimationMixer(fbx);

  const rb = fbx.getObjectByName(CONFIG.rifleBone);
  if (rb) {
    hero.rifle = { bone: rb, pos: rb.position.clone(), quat: rb.quaternion.clone(), shape: analyzeRifle(fbx, rb) };
  } else console.warn(`No encontré el hueso del rifle "${CONFIG.rifleBone}" (cámbialo en CONFIG.rifleBone)`);

  // Clips: FBX de Mixamo (retargeteados a tu esqueleto) y luego los que trae el propio modelo
  let boundOk = 0, boundTotal = 0;
  const retargeted = new Set();
  for (const [key, names] of Object.entries(CONFIG.anims)) {
    for (const name of names) {
      const a = await loadFBXQuiet(CONFIG.animsPath + encodeURI(name));
      if (a && a.animations.length) {
        const r = retargetClip(a, a.animations[0], fbx);
        if (r.mapped >= 10) {
          hero.clips[key] = r.clip;
          retargeted.add(key);
          boundOk += r.mapped; boundTotal += r.total;
          if (r.hand && !hero.bones.hand) hero.bones.hand = r.hand;
        } else {
          hero.clips[key] = a.animations[0]; // respaldo: solo por nombre
        }
        break;
      }
    }
    // aimWalk es opcional: no se reporta como faltante
    if (!hero.clips[key] && key !== 'aimWalk') report(`${CONFIG.animsPath}${names[0]} (animación "${key}")`);
  }
  for (const clip of fbx.animations) {
    const n = clip.name.toLowerCase();
    for (const key of ['idle', 'walk', 'run', 'jump']) {
      if (!hero.clips[key] && n.includes(key)) hero.clips[key] = clip;
    }
  }

  // Respaldo: si no se detectó la mano derecha durante el retargeting, se busca por nombre
  if (!hero.bones.hand) {
    fbx.traverse((o) => {
      if (!hero.bones.hand && o.isBone && /^(.*:)?(hand_r|r_hand|righthand|hand\.r)$/i.test(o.name)) hero.bones.hand = o;
    });
  }
  if (!hero.bones.hand) console.warn('No encontré la mano derecha: el rifle no podrá pegarse a ella al disparar.');
  else console.info('Mano derecha:', hero.bones.hand.name, '· hueso del rifle:', hero.rifle ? hero.rifle.bone.name : 'NO ENCONTRADO');

  for (const [key, clip] of Object.entries(hero.clips)) {
    if (!retargeted.has(key)) {
      const r = retargetNames(clip, fbx);
      boundOk += r.ok; boundTotal += r.total;
    }
    lockRootMotion(clip, CONFIG.lockHipsY || key === 'jump');
    const action = hero.mixer.clipAction(clip);
    action.enabled = true;
    if (key === 'jump') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = THREE.MathUtils.clamp(clip.duration / 0.85, 0.5, 3);
    }
    if (key === 'shoot') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = THREE.MathUtils.clamp(clip.duration / CONFIG.shootCooldown, 0.5, 4);
    }
    hero.actions[key] = action;
  }

  // Sin Idle: se usa el primer instante de la caminata como pose de reposo
  if (!hero.actions.idle && hero.clips.walk) {
    const still = THREE.AnimationUtils.subclip(hero.clips.walk, 'idle', 0, 2, 30);
    hero.actions.idle = hero.mixer.clipAction(still);
  }
  console.info('Animaciones cargadas:', Object.keys(hero.actions));
  const boneNames = [];
  fbx.traverse((o) => { if (o.isBone) boneNames.push(o.name); });
  // Lista corta: solo huesos del cuerpo (sin dedos, cara ni auxiliares) para poder revisarla
  const skinBones = [];
  fbx.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.bones.forEach((b) => skinBones.push(b.name)); });
  const uniq = [...new Set(skinBones)];
  const main = uniq.filter((n) =>
    /pelvis|hips|spine|neck|head|clavicle|shoulder|upperarm|forearm|hand|thigh|calf|foot|toe|root|leg|arm/i.test(n) &&
    !/finger|thumb|index|middle|ring|pinky|face|eye|brow|lid|lip|jaw|cheek|nose|tongue|teeth|twist|roll|helper|corrective|_ik|ik_|prop|weapon|facial/i.test(n));
  console.info(`Huesos totales: ${boneNames.length} · con skin: ${uniq.length}`);
  console.info(`HUESOS PRINCIPALES (${main.length}): ` + main.slice(0, 120).join(', '));
  const info = document.getElementById('animInfo');
  if (info) {
    const loaded = Object.keys(hero.clips).join(', ');
    const pct = boundTotal ? Math.round((100 * boundOk) / boundTotal) : 0;
    info.textContent = boundTotal
      ? `Animaciones: ${loaded} · huesos enlazados ${pct}%` + (pct < 90 ? ' · el esqueleto no es de Mixamo' : '')
      : 'Animaciones: ninguna cargada';
    info.style.color = pct >= 90 ? '' : '#ff9a6b';
  }

  if (hero.actions.idle) hero.actions.idle.play();
}

// Si falta una animación se usa la más cercana (run → walk → idle)
function actionFor(state) {
  const chain = {
    jump: ['jump', 'idle'],
    run: ['run', 'walk', 'idle'],
    walk: ['walk', 'idle'],
    idle: ['idle'],
    aim: ['aim', 'idle'],
    aimwalk: ['aimWalk', 'aim', 'walk', 'idle'],
    shoot: ['shoot', 'aim', 'idle'],
  }[state];
  for (const k of chain) if (hero.actions[k]) return hero.actions[k];
  return null;
}

function setState(next) {
  if (next === hero.state) return;
  const prev = actionFor(hero.state);
  const nxt = actionFor(next);
  hero.state = next;
  stateEl.textContent = STATE_LABEL[next];
  if (nxt === prev) return;
  if (nxt) {
    if (nxt !== hero.actions.jump && nxt !== hero.actions.shoot) nxt.timeScale = (next === 'run' && nxt === hero.actions.walk) ? 1.7 : 1;
    nxt.reset(); nxt.setEffectiveWeight(1); nxt.fadeIn(0.2).play();
  }
  if (prev) prev.fadeOut(0.2);
}

function isGrounded() {
  for (const c of world.contacts) {
    if (c.bi !== heroBody && c.bj !== heroBody) continue;
    const upward = c.bi === heroBody ? -c.ni.y : c.ni.y;
    if (upward > 0.5) return true;
  }
  return false;
}

/* =====================================================================
   ENTRADA: teclado (movimiento, correr, saltar, giro 90°) + música
   ===================================================================== */
const keys = new Set();
let started = false;
let aimMouse = false, aimToggle = false;

// Q / E giran la cámara 90° de forma suave (+1 izquierda, -1 derecha)
let camTurn = 0;
function turn(dir) { camTurn += dir * Math.PI / 2; }
function updateCameraTurn(dt) {
  if (!camTurn) return;
  const step = Math.sign(camTurn) * Math.min(Math.abs(camTurn), CONFIG.turnSpeed * dt);
  camTurn -= step;
  camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), step).add(controls.target);
}

function tryJump() {
  if (hero.jumping || !isGrounded()) return;
  heroBody.velocity.y = CONFIG.jumpSpeed;
  hero.jumping = true;
  hero.jumpTimer = 0.25;
  setState('jump');
}

window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (paused) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { openPause(); return; }
  const code = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(code);
  if (code === 'KeyQ') turn(+1);
  if (code === 'KeyE') turn(-1);
  if (code === 'Space') tryJump();
  if (code === 'KeyM') toggleMusic();
  if (code === 'KeyR') resetObjects();
  if (code === 'KeyF') aimToggle = !aimToggle;
  if (code === 'Enter') shoot();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* ---------- Música ---------- */
const music = new Audio(CONFIG.music);
music.loop = true;
music.volume = 0.45;
const fallbackMusic = { ctx: null, master: null, timer: null };
let muted = false;
const musicBtn = document.getElementById('musicBtn');

// Respaldo: guitarra western sintética (Am–G–F–E) si no existe music.mp3
function startFallbackMusic() {
  if (fallbackMusic.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.18;
  master.connect(ctx.destination);
  fallbackMusic.ctx = ctx;
  fallbackMusic.master = master;

  const chords = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]];
  const pattern = [0, 1, 2, 1, 0, 1, 2, 1];
  let step = 0;
  const pluck = (f, t) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 1);
  };
  fallbackMusic.timer = setInterval(() => {
    const t = ctx.currentTime + 0.05;
    const chord = chords[Math.floor(step / 8) % 4];
    pluck(chord[pattern[step % 8]], t);
    if (step % 8 === 0) pluck(chord[0] / 2, t);
    step++;
  }, 320);
}

function applyMute() {
  music.muted = muted;
  if (fallbackMusic.master) fallbackMusic.master.gain.value = muted ? 0 : 0.18;
  musicBtn.textContent = muted ? '♪ Música: no' : '♪ Música: sí';
}
function toggleMusic() { muted = !muted; applyMute(); }
musicBtn.addEventListener('click', () => { toggleMusic(); musicBtn.blur(); });

/* =====================================================================
   CÁMARA: ratón (OrbitControls) siguiendo al personaje
   ===================================================================== */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.8; // evita la vista cenital (desde arriba), donde el rifle se ve de punta

const camTarget = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
let shoulder = 0;
// Cámara sobre el hombro: la cámara mira un punto un poco a la derecha (y arriba) del personaje,
// así el personaje queda a un lado de la pantalla y la mira del centro apunta al mundo, no a su espalda.
function followHero(dt = 0.016) {
  const dist = camera.position.distanceTo(controls.target);
  shoulder += (CONFIG.shoulderOffset * dist - shoulder) * Math.min(1, dt * 8);

  _camFwd.copy(controls.target).sub(camera.position);
  _camFwd.y = 0;
  let rx = 0, rz = 0;
  if (_camFwd.lengthSq() > 1e-6) {
    _camFwd.normalize();
    rx = -_camFwd.z; // "derecha" de la cámara en el plano horizontal
    rz = _camFwd.x;
  }
  camTarget.set(
    heroBody.position.x + rx * shoulder,
    heroBody.position.y + CONFIG.camHeight,
    heroBody.position.z + rz * shoulder);
  const delta = camTarget.clone().sub(controls.target);
  camera.position.add(delta);
  controls.target.copy(camTarget);
}

/* =====================================================================
   APUNTAR Y DISPARAR
   Clic derecho (mantener) o F = apuntar · Clic izquierdo o Enter = disparar
   Puedes moverte (WASD) mientras apuntas y disparas.
   ===================================================================== */
// La cámara se mueve con el mouse (bloqueo de puntero); la rueda sigue haciendo zoom.
//   Clic izquierdo = disparar (siempre, con o sin apuntar)
//   F (alternar) o clic derecho (mantener) = modo apuntar
controls.enableRotate = false;
controls.mouseButtons.LEFT = null;
controls.mouseButtons.RIGHT = null;
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let pointerLocked = false;
const lockHint = document.createElement('div');
lockHint.textContent = 'Haz clic para capturar el mouse (Esc lo libera)';
Object.assign(lockHint.style, {
  position: 'absolute', left: '50%', bottom: '18px', transform: 'translateX(-50%)',
  padding: '6px 14px', background: 'rgba(0,0,0,.6)', color: '#ffdc96', borderRadius: '6px',
  font: '14px Georgia, serif', pointerEvents: 'none', display: 'none', zIndex: 6,
});
stage.appendChild(lockHint);

function lockMouse() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (err) { /* el navegador no permitió el bloqueo */ }
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  lockHint.style.display = 'none';
  if (!pointerLocked) { aimMouse = false; if (started && !paused) openPause(); }
});

canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  if (!pointerLocked) { lockMouse(); return; } // el primer clic solo captura el mouse
  if (e.button === 2) aimMouse = true;
  if (e.button === 0) shoot();
});
window.addEventListener('pointerup', (e) => { if (e.button === 2) aimMouse = false; });

// Girar la cámara alrededor del personaje con el movimiento del mouse
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  const off = camera.position.clone().sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.theta -= e.movementX * CONFIG.mouseSensitivity;
  sph.phi += (CONFIG.invertY ? 1 : -1) * e.movementY * CONFIG.mouseSensitivity;
  sph.phi = THREE.MathUtils.clamp(sph.phi, controls.minPolarAngle, controls.maxPolarAngle);
  off.setFromSpherical(sph);
  camera.position.copy(controls.target).add(off);
});

if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
const crosshair = document.createElement('div');
// Retícula clásica: cuatro marcas con hueco central + punto, con contorno oscuro para verse sobre cualquier fondo
Object.assign(crosshair.style, {
  position: 'absolute', left: '50%', top: '50%', width: '0', height: '0',
  pointerEvents: 'none', display: 'none', zIndex: 5,
});
const tick = (css) => `<div style="position:absolute;background:#ffe3a6;box-shadow:0 0 0 1px rgba(0,0,0,.65);${css}"></div>`;
crosshair.innerHTML =
  tick('left:-1px;width:2px;height:8px;top:calc(-8px - var(--g))') +   // arriba
  tick('left:-1px;width:2px;height:8px;top:var(--g)') +                // abajo
  tick('top:-1px;height:2px;width:8px;left:calc(-8px - var(--g))') +   // izquierda
  tick('top:-1px;height:2px;width:8px;left:var(--g)') +                // derecha
  tick('left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%'); // punto central
stage.appendChild(crosshair);

/* =====================================================================
   MENÚ DE PAUSA (estilo RDR2): Continuar · Controles · Créditos · Volver a inicio
   ===================================================================== */
let paused = false;
const introEl = document.getElementById('intro');
const startBtn = document.getElementById('startBtn');
const pauseEl = document.getElementById('pause');
const pauseItems = [...pauseEl.querySelectorAll('.menu-item')];
const panes = { controls: document.getElementById('paneControls'), credits: document.getElementById('paneCredits') };
let menuIdx = 0, openPane = null;

function selectItem(i) {
  menuIdx = (i + pauseItems.length) % pauseItems.length;
  pauseItems.forEach((b, k) => b.classList.toggle('sel', k === menuIdx));
}
function showPane(name) {
  openPane = name;
  for (const [k, el] of Object.entries(panes)) el.hidden = k !== name;
}
function openPause() {
  if (paused || !started) return;
  paused = true;
  keys.clear(); aimMouse = false;
  if (document.pointerLockElement) document.exitPointerLock();
  showPane(null); selectItem(0);
  pauseEl.classList.add('open');
  stage.classList.add('is-paused');
  lockHint.style.display = 'none';
}
function resume() {
  if (!paused) return;
  paused = false;
  pauseEl.classList.remove('open');
  stage.classList.remove('is-paused');
  lockMouse();
  setTimeout(() => { if (started && !paused && !pointerLocked) lockHint.style.display = 'block'; }, 400);
}
function startGame() {
  started = true; paused = false;
  startBtn.blur();
  lockMouse();
  introEl.classList.add('hidden');
  music.play().catch(() => startFallbackMusic());
  applyMute();
}
function goHome() {
  paused = false; started = false;
  pauseEl.classList.remove('open');
  stage.classList.remove('is-paused');
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear(); aimMouse = aimToggle = false; camTurn = 0;
  resetObjects();
  heroBody.position.set(0, 0.95, 26);
  heroBody.velocity.setZero();
  hero.yaw = hero.targetYaw = hero.visualYaw = hero.faceTarget = Math.PI;
  hero.weaponTimer = hero.shootTimer = 0; hero.jumping = false; hero.speed = 0;
  setState('idle');
  const d0 = CONFIG.defaultDistance, p0 = CONFIG.defaultPolar;
  shoulder = CONFIG.shoulderOffset * d0;
  controls.target.set(heroBody.position.x + shoulder, heroBody.position.y + CONFIG.camHeight, heroBody.position.z);
  camera.position.copy(controls.target).add(new THREE.Vector3(0, d0 * Math.cos(p0), d0 * Math.sin(p0)));
  introEl.classList.remove('hidden');
  startBtn.focus();
}
const menuActions = { resume, controls: () => showPane('controls'), credits: () => showPane('credits'), home: goHome };
const activate = (i) => menuActions[pauseItems[i].dataset.action]();
pauseItems.forEach((b, i) => {
  b.addEventListener('mouseenter', () => selectItem(i));
  b.addEventListener('click', () => activate(i));
});
document.addEventListener('keydown', (e) => {
  if (!paused) return;
  e.stopPropagation(); // evita que Enter/Esc lleguen al juego
  if (e.repeat) return;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { selectItem(menuIdx + 1); e.preventDefault(); }
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') { selectItem(menuIdx - 1); e.preventDefault(); }
  else if (e.code === 'Enter' || e.code === 'Space') { activate(menuIdx); e.preventDefault(); }
  else if (e.code === 'Escape' || e.code === 'Backspace') { openPane ? showPane(null) : resume(); }
});

const muzzleLight = new THREE.PointLight(0xffcc77, 0, 12, 2);
scene.add(muzzleLight);
const tracers = [];
const raycaster = new THREE.Raycaster();
const centerNDC = new THREE.Vector2(0, 0);
let shotCd = 0;
let shotCtx = null;

function playShot() {
  if (muted) return;
  try {
    shotCtx = shotCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = shotCtx, t = ctx.currentTime, len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.value = 0.6;
    src.connect(lp); lp.connect(g); g.connect(ctx.destination); src.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og); og.connect(ctx.destination); o.start(t); o.stop(t + 0.3);
  } catch (err) { /* sin audio */ }
}

function shoot() {
  if (!started || shotCd > 0) return; // se puede disparar apuntando (F) o "desde la cadera"
  shotCd = CONFIG.shootCooldown;
  hero.shootTimer = CONFIG.shootCooldown;
  hero.weaponTimer = 1.2;

  // Punto al que apunta la mira (centro de la pantalla): objeto dinámico o suelo
  camera.updateMatrixWorld();
  raycaster.setFromCamera(centerNDC, camera);
  const ray = raycaster.ray;
  const hit = raycaster.intersectObjects(dynamics.map((d) => d.mesh), true)[0];
  const groundT = ray.direction.y < -0.001 ? -ray.origin.y / ray.direction.y : Infinity;
  let point, body = null;
  if (hit && hit.distance < Math.min(groundT, 90)) {
    point = hit.point.clone();
    for (const d of dynamics) {
      for (let o = hit.object; o; o = o.parent) if (o === d.mesh) { body = d.body; break; }
      if (body) break;
    }
  } else {
    point = ray.origin.clone().addScaledVector(ray.direction, Math.min(groundT, 90));
  }

  // Boca del cañón: pecho del personaje, un poco al frente
  const muzzle = new THREE.Vector3(
    heroBody.position.x + Math.sin(hero.yaw) * 0.8,
    heroBody.position.y + 0.55,
    heroBody.position.z + Math.cos(hero.yaw) * 0.8);
  const dir = point.clone().sub(muzzle).normalize();

  if (body) {
    body.wakeUp();
    const k = body.mass * CONFIG.shotSpeed;
    body.applyImpulse(new CANNON.Vec3(dir.x * k, dir.y * k + body.mass, dir.z * k),
      new CANNON.Vec3(point.x - body.position.x, point.y - body.position.y, point.z - body.position.z));
  }

  muzzleLight.position.copy(muzzle);
  muzzleLight.intensity = 60;
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([muzzle, point]),
    new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, fog: false }));
  scene.add(line);
  tracers.push({ line, life: 0.08 });
  playShot();
}

function updateShots(dt) {
  shotCd = Math.max(0, shotCd - dt);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 700);
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    if (tr.life <= 0) {
      scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
  // La mira se ve siempre: cerrada y nítida al apuntar (F), más abierta y tenue sin apuntar,
  // y se abre un instante al disparar.
  crosshair.style.display = started && !paused ? 'block' : 'none';
  const gap = (hero.aiming ? 4 : 10) + 8 * (hero.shootTimer / CONFIG.shootCooldown);
  crosshair.style.setProperty('--g', `${gap.toFixed(1)}px`);
  crosshair.style.opacity = hero.aiming ? '1' : '0.75';
}

// El rifle siempre va en la mano derecha. Al apuntar/disparar, su cañón se alinea con la mira;
// el resto del tiempo apunta al frente del personaje, un poco hacia abajo (CONFIG.rifleCarryPitch).
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hs = new THREE.Vector3();
const _pp = new THREE.Vector3(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3();
const _M = new THREE.Matrix4(), _E = new THREE.Euler();
const _ONE = new THREE.Vector3(1, 1, 1);
const _aim = new THREE.Vector3(), _right = new THREE.Vector3(), _upW = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _rifleDir = new THREE.Vector3(0, 0, 1);
let _rifleDirInit = false;
function updateRifle(dt = 0.016) {
  const r = hero.rifle, hand = hero.bones.hand;
  if (!r) return;
  const armed = hero.aiming || hero.weaponTimer > 0;
  if (!hand || (!CONFIG.rifleAlwaysHeld && !armed)) {
    r.bone.position.copy(r.pos);
    r.bone.quaternion.copy(r.quat);
    return;
  }
  // Se actualiza desde el grupo del héroe (antes se usaba el modelo, con la matriz del padre un cuadro atrasada)
  hero.group.updateMatrixWorld(true);
  hand.matrixWorld.decompose(_hp, _hq, _hs);

  if (armed) {
    // Apuntando / disparando: el cañón sigue la mira de la cámara
    camera.getWorldDirection(_aim);
    // Limita la inclinación del rifle: si la cámara mira muy hacia abajo/arriba, el rifle no apunta al suelo/cielo
    // (visto de frente, desde arriba, el cañón quedaba de punta y parecía no existir)
    const maxP = THREE.MathUtils.degToRad(CONFIG.rifleMaxPitch);
    const horiz = Math.hypot(_aim.x, _aim.z);
    const pitch = Math.atan2(_aim.y, horiz);
    const cp = THREE.MathUtils.clamp(pitch, -maxP, maxP);
    if (cp !== pitch) {
      const hx = horiz > 1e-4 ? _aim.x / horiz : Math.sin(hero.yaw);
      const hz = horiz > 1e-4 ? _aim.z / horiz : Math.cos(hero.yaw);
      _aim.set(hx * Math.cos(cp), Math.sin(cp), hz * Math.cos(cp));
    }
  } else {
    // Quieto o caminando: el rifle va en la mano, apuntando al frente y un poco hacia abajo
    const cp = THREE.MathUtils.degToRad(CONFIG.rifleCarryPitch);
    _aim.set(
      Math.sin(hero.visualYaw) * Math.cos(cp),
      Math.sin(cp),
      Math.cos(hero.visualYaw) * Math.cos(cp));
  }
  // Transición suave entre "apuntar" y "llevar"
  if (!_rifleDirInit) { _rifleDir.copy(_aim); _rifleDirInit = true; }
  else _rifleDir.lerp(_aim, Math.min(1, dt * 12)).normalize();
  _aim.copy(_rifleDir);

  _right.crossVectors(_UP, _aim);
  if (_right.lengthSq() < 1e-6) return;
  _right.normalize();
  _upW.crossVectors(_aim, _right);
  const qAim = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(_right, _upW, _aim));

  // Marco propio del rifle (en el espacio local de su hueso)
  const sh = r.shape || { c: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), lo: 0, hi: 0 };
  const f = sh.fwd.clone(), u = sh.up.clone();
  const len = sh.hi - sh.lo;
  // distancia (a lo largo de sh.fwd) desde el centroide hasta el punto de agarre
  const along = CONFIG.rifleFlipFwd ? sh.hi - CONFIG.rifleGripFrac * len : sh.lo + CONFIG.rifleGripFrac * len;
  if (CONFIG.rifleFlipFwd) f.negate();
  if (CONFIG.rifleFlipUp) u.negate();
  const rl = new THREE.Vector3().crossVectors(u, f).normalize();
  const qL = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rl, u, f));
  const gripLocal = sh.c.clone().addScaledVector(sh.fwd, along);

  // Orientación final: el cañón del rifle apunta hacia donde apunta la mira
  const g = CONFIG.rifleGrip, rad = THREE.MathUtils.degToRad;
  const qE = new THREE.Quaternion().setFromEuler(_E.set(rad(g.rot[0]), rad(g.rot[1]), rad(g.rot[2])));
  const Qw = qAim.clone().multiply(qE).multiply(qL.clone().invert());

  // Posición: el punto de agarre del rifle coincide con la mano (+ ajuste en el marco de la mira)
  r.bone.parent.updateWorldMatrix(true, false);
  r.bone.parent.matrixWorld.decompose(_pp, _pq, _ps);
  const s = _ps.x * r.bone.scale.x;
  const target = _hp.clone()
    .addScaledVector(_right, g.pos[0])
    .addScaledVector(_upW, g.pos[1])
    .addScaledVector(_aim, g.pos[2]);
  const P = target.sub(gripLocal.multiplyScalar(s).applyQuaternion(Qw));

  _M.compose(P, Qw, _ONE);
  _M.premultiply(new THREE.Matrix4().copy(r.bone.parent.matrixWorld).invert());
  _M.decompose(_pp, _pq, _ps);
  r.bone.position.copy(_pp);
  r.bone.quaternion.copy(_pq);
}

/* =====================================================================
   BUCLE PRINCIPAL
   ===================================================================== */
const clock = new THREE.Clock();
const fwd = new THREE.Vector3();

function updateHero(dt, t) {
  const down = (a, b) => keys.has(a) || keys.has(b);
  // Varias teclas a la vez: adelante/atrás + izquierda/derecha = diagonal
  const iz = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
  const ix = (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0);
  hero.aiming = started && (aimMouse || aimToggle) && !hero.jumping;
  hero.shootTimer = Math.max(0, hero.shootTimer - dt);
  hero.weaponTimer = Math.max(0, hero.weaponTimer - dt);

  // El "frente" del movimiento siempre es hacia donde mira la cámara (se fija ANTES de calcular el movimiento)
  camera.getWorldDirection(fwd);
  hero.yaw = hero.targetYaw = Math.atan2(fwd.x, fwd.z);

  // Ahora SÍ se puede mover apuntando y disparando (más lento y sin correr)
  const wantMove = ix !== 0 || iz !== 0;
  const wantRun = wantMove && !hero.aiming && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  if (wantMove) hero.moveAngle = Math.atan2(ix, iz);

  const target = !wantMove ? 0 : hero.aiming ? CONFIG.aimWalkSpeed : (wantRun ? CONFIG.runSpeed : CONFIG.walkSpeed);
  hero.speed += (target - hero.speed) * Math.min(1, dt * 10);
  if (!wantMove && hero.speed < 0.15) hero.speed = 0;

  // Dirección en el mundo = frente del personaje + ángulo de las teclas (velocidad constante en diagonal).
  // Al apuntar, el frente es la cámara: WASD avanza, retrocede y se desplaza de lado.
  const dirYaw = hero.yaw + hero.moveAngle;
  heroBody.velocity.x = Math.sin(dirYaw) * hero.speed;
  heroBody.velocity.z = Math.cos(dirYaw) * hero.speed;

  // El modelo gira suavemente hacia donde se mueve (o hacia donde mira la cámara al apuntar)
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // Apuntando o con el rifle en la mano, mira hacia la cámara; si no, hacia donde camina
  const armed = hero.aiming || hero.weaponTimer > 0;
  if (armed) hero.faceTarget = hero.yaw;
  else if (wantMove) hero.faceTarget = dirYaw;
  const faceYaw = hero.faceTarget;
  const faceRate = CONFIG.turnSpeed * (armed ? 3 : 1.5);
  const vd = wrap(faceYaw - hero.visualYaw);
  hero.visualYaw += Math.sign(vd) * Math.min(Math.abs(vd), faceRate * dt);

  // Seguridad extra: nunca salir de la frontera
  const lim = CONFIG.arenaHalf - 1.2;
  heroBody.position.x = THREE.MathUtils.clamp(heroBody.position.x, -lim, lim);
  heroBody.position.z = THREE.MathUtils.clamp(heroBody.position.z, -lim, lim);

  // Fin del salto al aterrizar
  if (hero.jumping) {
    hero.jumpTimer -= dt;
    if (hero.jumpTimer <= 0 && isGrounded()) hero.jumping = false;
  }

  if (hero.jumping) setState('jump');
  // La animación de disparo solo se usa quieto; al moverte sigue la de caminar/correr (si no, se alternaban)
  else if (hero.aiming && hero.shootTimer > 0 && !wantMove) setState('shoot');
  else if (hero.aiming) setState(wantMove ? 'aimwalk' : 'aim');
  else if (hero.shootTimer > 0 && !wantMove) setState('shoot'); // disparo sin apuntar (quieto)
  else if (wantMove) setState(wantRun ? 'run' : 'walk');
  else setState('idle');

  hero.group.position.set(heroBody.position.x, heroBody.position.y - HERO_FEET, heroBody.position.z);
  hero.group.rotation.y = hero.visualYaw;

  // Sin animaciones FBX: pequeño balanceo para que no se vea congelado
  if (!hero.mixer && hero.model) {
    hero.model.position.y = hero.speed > 0.3 ? Math.abs(Math.sin(t * 10)) * 0.06 : 0;
  }
}

function animateScene(t) {
  if (animated.blades) animated.blades.rotation.z = t * 0.8;
  if (animated.fire) {
    animated.fire.children.forEach((f, i) => {
      const s = 0.9 + 0.25 * Math.sin(t * (9 + i * 3) + i * 2) + Math.random() * 0.08;
      f.scale.set(1, s, 1);
      f.position.y = 0.5 * s * (1 - i * 0.12) + 0.05;
    });
    animated.fireLight.intensity = 36 + Math.sin(t * 13) * 6 + Math.random() * 6;
  }
  if (animated.lanternSwing) animated.lanternSwing.rotation.z = Math.sin(t * 1.3) * 0.09;
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (started && !paused) updateHero(dt, t);
  if (!paused) {
    updateTumbleweed();
    world.step(1 / 60, dt, 3);
  }

  for (const d of dynamics) {
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
    if (d.body.position.y < -5) { // por si algún objeto se cae del mundo
      d.body.position.copy(d.home.p);
      d.body.velocity.setZero();
    }
  }

  if (!started) {
    hero.group.position.set(heroBody.position.x, heroBody.position.y - HERO_FEET, heroBody.position.z);
    hero.group.rotation.y = hero.yaw;
  }
  if (hero.mixer && !paused) hero.mixer.update(dt);
  updateRifle(dt);
  updateShots(dt);

  animateScene(t);

  // El sol y su sombra acompañan al personaje
  sun.position.copy(heroBody.position).add(CONFIG.sunPosition);
  sun.target.position.copy(heroBody.position);

  updateCameraTurn(dt);
  followHero(dt);
  fill.position.set(camera.position.x, camera.position.y + 2, camera.position.z);
  fill.target.position.copy(camTarget);
  controls.update();
  renderer.render(scene, camera);
}

/* =====================================================================
   ARRANQUE
   ===================================================================== */
async function init() {
  buildSaloon();
  buildWindmill();
  [[-26, 12, 1.1], [20, 22, 0.9], [-30, -6, 1.2], [30, 4, 1], [14, -8, 0.8], [-18, 28, 1]]
    .forEach(([x, z, s]) => buildCactus(x, z, s));
  buildCampfire(8, 10);
  buildLantern(-6, 12);
  buildBoundary();
  buildDynamicObjects();

  // Cámara inicial (zoom por defecto): cerca del personaje, sobre su hombro, detrás de él
  const d0 = CONFIG.defaultDistance, p0 = CONFIG.defaultPolar;
  shoulder = CONFIG.shoulderOffset * d0;
  controls.target.set(heroBody.position.x + shoulder, heroBody.position.y + CONFIG.camHeight, heroBody.position.z);
  camera.position.copy(controls.target).add(new THREE.Vector3(0, d0 * Math.cos(p0), d0 * Math.sin(p0)));

  await Promise.all([setupSky(), setupGround(), loadHero()]);

  barFill.style.width = '100%';
  if (missing.length) {
    const el = document.getElementById('missing');
    el.hidden = false;
    el.innerHTML = '<b>Archivos no encontrados (se usa un respaldo):</b><br>' +
      missing.map((m) => `• ${m}`).join('<br>');
  }
  startBtn.disabled = false;
  startBtn.focus();
  startBtn.addEventListener('click', startGame);
  music.addEventListener('error', () => { if (started) startFallbackMusic(); });

  renderer.setAnimationLoop(loop);
}

init();