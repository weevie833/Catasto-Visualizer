import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { classifyBuilding } from './building-types.js';

// The scene interprets the record graph, not geographic coordinates or building sizes.
const $ = selector => document.querySelector(selector);
const root = $('#scene3d');
const labelRoot = $('#sceneLabels');
const inspector = $('#sceneInspector');
const districtSelect = $('#district3d');
const hover = $('#sceneHover');
const SCENE_STRINGS = {
  en: { allDistricts: 'All districts', allLandowners: 'All landowners', landowners: 'Landowners', household: 'household', households: 'households', landowner: 'landowner', landownerPlural: 'landowners', boundaryReference: 'boundary reference', boundaryReferences: 'boundary references', noResidence: 'No residence listed', notListed: 'Not Listed', noRecords: 'No records loaded', uploadToExplore: 'Upload Catasto text to explore households in 3D.', namedBoundary: 'Named in a boundary record', landownerRecord: 'Landowner record', householdRecord: 'Household record', landSummary: 'Landholding summary', members: 'household members', landNeighbors: 'recorded land neighbors', residenceNeighbors: 'recorded residence neighbors', reference: 'reference', onlyBoundary: 'Only a boundary reference is available. This marker does not establish a complete household.', anotherDistrict: 'in another district. Select a name to visit.', noNeighbors: 'No named neighbors were parsed. Nearby placement is illustrative.', publicRoad: 'Public road mentioned in the record.', ruralDwelling: 'Rural dwelling', parish: '18th-century parish style', manor: '18th-century manor style', expand: 'Expand', exitExpanded: 'Exit expanded', perspective: 'Perspective', topView: 'Top view', contextLost: 'The 3D graphics context was interrupted. Reload the page to restore the environment.' },
  it: { allDistricts: 'Tutti i rioni', allLandowners: 'Tutti i proprietari', landowners: 'Proprietari', household: 'famiglia', households: 'famiglie', landowner: 'proprietario', landownerPlural: 'proprietari', boundaryReference: 'riferimento di confine', boundaryReferences: 'riferimenti di confine', noResidence: 'Residenza non indicata', notListed: 'Non indicato', noRecords: 'Nessun dato caricato', uploadToExplore: 'Carica il testo del Catasto per esplorare le famiglie in 3D.', namedBoundary: 'Citato in un confine', landownerRecord: 'Scheda del proprietario', householdRecord: 'Scheda familiare', landSummary: 'Riepilogo dei terreni', members: 'componenti della famiglia', landNeighbors: 'vicini dei terreni citati', residenceNeighbors: 'vicini di residenza citati', reference: 'riferimento', onlyBoundary: 'È disponibile solo un riferimento di confine. Questo segnaposto non identifica una famiglia completa.', anotherDistrict: 'in un altro rione. Seleziona un nome per raggiungerlo.', noNeighbors: 'Non sono stati rilevati vicini nominati. La disposizione è illustrativa.', publicRoad: 'La voce menziona una strada pubblica.', ruralDwelling: 'Abitazione rurale', parish: 'Stile di chiesa parrocchiale del XVIII secolo', manor: 'Stile di dimora signorile del XVIII secolo', expand: 'Espandi', exitExpanded: 'Esci da schermo intero', perspective: 'Prospettiva', topView: 'Vista dall’alto', contextLost: 'Il contesto grafico 3D è stato interrotto. Ricarica la pagina per ripristinare l’ambiente.' }
};
let language = window.catasto.getLanguage?.() === 'it' ? 'it' : 'en';
const tr = key => SCENE_STRINGS[language][key] || SCENE_STRINGS.en[key] || key;
const displayPlace = place => place === 'No residence listed' ? tr('noResidence') : place === 'Not Listed' ? tr('notListed') : place;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setClearColor(0xdce3d5);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const canvas = renderer.domElement;
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', '3D environment. Drag to pan; right-drag to orbit; arrow keys pan; plus and minus zoom; F focuses selection; H shows overview; T toggles overhead view. Select records using the household list.');
$('#sceneCanvas').append(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce3d5);
scene.fog = new THREE.FogExp2(0xdce3d5, .0018);
scene.add(new THREE.HemisphereLight(0xfff7df, 0x66765a, 1.9));
const sun = new THREE.DirectionalLight(0xffefd2, 2.4);
sun.position.set(-40, 80, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.normalBias = .05;
sun.shadow.bias = -.00015;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 5000);
camera.position.set(30, 40, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .09;
controls.minDistance = 8;
controls.maxDistance = 1800;
controls.maxPolarAngle = Math.PI / 2.13;
controls.minPolarAngle = .03;
controls.screenSpacePanning = false;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.zoomSpeed = .85;
controls.target.set(0, 0, 0);

const world = new THREE.Group();
const linksGroup = new THREE.Group();
const peopleGroup = new THREE.Group();
scene.add(world, linksGroup, peopleGroup);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const projected = new THREE.Vector3();
const nodes = new Map();
const groups = new Map();
const labels = [];
let state = window.catasto.getState();
let unitReference = null;
let layerReference = null;
let landOwnerReference = null;
let scope = 'all';
let mode = '3d';
let overhead = false;
let transition = null;
let down = null;
let dirty = true;
let previousTime = 0;
let visibleUnits = [];
const sharedMaterials = new Set();
const mat = (color, extra = {}) => {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .95, ...extra });
  sharedMaterials.add(material);
  return material;
};
function randomSequence(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

// Small, deterministic material textures keep the scene self-contained and buildless.
function masonryTexture(seed, plaster = true) {
  const random = randomSequence(seed);
  const surface = document.createElement('canvas'); surface.width = surface.height = 512;
  const ctx = surface.getContext('2d');
  ctx.fillStyle = '#8a806c'; ctx.fillRect(0, 0, 512, 512);
  const colors = ['#aaa08a', '#b4aa93', '#9b9583', '#c0b49b', '#a49982', '#b7b09d'];
  for (let row = 0; row < 12; row++) {
    let x = row % 2 ? -40 : -10;
    const y = row * 44;
    while (x < 512) {
      const width = 40 + random() * 53;
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.beginPath(); ctx.moveTo(x + 3, y + 4 + random() * 5);
      ctx.lineTo(x + width - 3, y + 3); ctx.lineTo(x + width, y + 33 + random() * 7);
      ctx.lineTo(x + 4, y + 40); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d0c2a450'; ctx.lineWidth = 2; ctx.stroke();
      x += width + 3;
    }
  }
  if (plaster) {
    ctx.fillStyle = ['#cfbea0', '#d8c9ad', '#c8b99b', '#c7c1a9'][seed % 4];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(512, 0);
    for (let x = 512; x >= 0; x -= 16) ctx.lineTo(x, 310 + random() * 105);
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 15; i++) {
      const x = random() * 512, y = 130 + random() * 200;
      ctx.fillStyle = '#a89b8170'; ctx.beginPath();
      ctx.ellipse(x, y, 5 + random() * 14, 3 + random() * 20, random(), 0, Math.PI * 2); ctx.fill();
    }
  }
  for (let i = 0; i < 4400; i++) {
    ctx.fillStyle = random() > .5 ? '#fff6dc16' : '#554d3520';
    ctx.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1 + random() * 4);
  }
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function timberTexture() {
  const surface = document.createElement('canvas'); surface.width = surface.height = 128;
  const ctx = surface.getContext('2d'); const random = randomSequence(47);
  ctx.fillStyle = '#66513a'; ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 19) {
    ctx.fillStyle = '#302c22'; ctx.fillRect(x, 0, 2, 128);
    ctx.fillStyle = '#927953'; ctx.fillRect(x + 3, 0, 1, 128);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = random() > .5 ? '#b6986330' : '#241f1835';
    ctx.fillRect(random() * 128, random() * 128, 1, 8 + random() * 50);
  }
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

const materials = {
  wall: [0, 1, 2, 3].map(seed => mat('#ffffff', { map: masonryTexture(seed + 14) })),
  stone: mat('#ffffff', { map: masonryTexture(81, false) }),
  roof: [mat('#a76643'), mat('#ac7250'), mat('#925c42')],
  door: mat('#ffffff', { map: timberTexture() }), window: mat('#302f25'), trim: mat('#b0a087'),
  trunk: mat('#756448'), leaf: mat('#7b896b'), leaf2: mat('#96a17d'), chestnut: mat('#68804c'),
  ground: mat('#a49b75'), field: mat('#70834a'), grain: mat('#af955b'), soil: mat('#93805c'),
  terrain: mat('#ffffff', { vertexColors: true, flatShading: true }),
  path: mat('#b7a17b'), grass: mat('#919763'), rock: mat('#a89d82'), pot: mat('#ad7853'),
  manor: mat('#ded1b5'), parish: mat('#e6dcc7'), dressedStone: mat('#c4b295'), iron: mat('#44483e'), bell: mat('#8c7543', { metalness: .5, roughness: .5 }),
  reference: mat('#c8c9b7', { transparent: true, opacity: .52 }),
  person: mat('#526e75'), skin: mat('#c8a77d')
};
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const hex = new THREE.CylinderGeometry(4.65, 4.65, .025, 6);
const yard = new THREE.CircleGeometry(1, 11); yard.rotateX(-Math.PI / 2);
const roofTile = new THREE.CylinderGeometry(.135, .15, .54, 7, 1, true, 0, Math.PI);
const sharedGeometries = new Set([box, cylinder, sphere, hex, yard, roofTile]);
const edges = [[9.7, 0], [4.85, 8.4], [-4.85, 8.4], [-9.7, 0], [-4.85, -8.4], [4.85, -8.4]];

function hash(value) {
  let n = 0;
  for (const c of value) n = (n * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(n);
}

function mesh(geometry, material, parent, x, y, z, sx = 1, sy = 1, sz = 1) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function disposeGroup(group) {
  const geometries = new Set();
  const localMaterials = new Set();
  group.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry && !sharedGeometries.has(object.geometry)) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach(material => { if (!sharedMaterials.has(material)) localMaterials.add(material); });
  });
  geometries.forEach(geometry => geometry.dispose());
  localMaterials.forEach(material => material.dispose());
  group.clear();
}

function addTree(parent, x, z, scale = 1, kind = 'olive', y = 0) {
  const tree = new THREE.Group(); tree.position.set(x, y, z); tree.scale.setScalar(scale); parent.add(tree);
  const trunk = mesh(cylinder, materials.trunk, tree, -.08, .72, 0, .14, 1.45, .18); trunk.rotation.z = -.14;
  [-1, 1].forEach(side => {
    const branch = mesh(cylinder, materials.trunk, tree, side * .24, 1.32, 0, .08, .85, .09); branch.rotation.z = -side * .55;
  });
  if (kind === 'chestnut') {
    mesh(sphere, materials.chestnut, tree, -.25, 2.0, -.12, 1.05, 1.2, 1.05);
    mesh(sphere, materials.leaf, tree, .65, 1.95, .2, .85, .9, .85);
  } else {
    mesh(sphere, materials.leaf, tree, -.55, 1.75, -.12, 1.0, .65, .85);
    mesh(sphere, materials.leaf2, tree, .58, 1.85, .1, .9, .72, .8);
    mesh(sphere, materials.leaf, tree, 0, 2.2, -.18, .86, .62, .82);
  }
}

function addTiledRoof(parent, { width, depth, height, rise, centerX, centerZ, wall, seed }) {
  const n = seed;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(0, rise); shape.lineTo(width / 2, 0);
  shape.closePath();
  mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), wall, parent, centerX, height, centerZ - depth / 2);
  const halfSpan = width / 2 + .23, roofDepth = depth + .39;
  const slopeLength = Math.hypot(halfSpan, rise), angle = Math.atan2(rise, halfSpan);
  const tileTransforms = [];
  const transform = new THREE.Object3D();
  [-1, 1].forEach(side => {
    const panel = mesh(box, materials.roof[n % 3], parent, centerX + side * halfSpan / 2, height + rise / 2, centerZ, slopeLength, .09, roofDepth);
    panel.rotation.z = -side * angle;
    const normal = new THREE.Vector3(side * Math.sin(angle), Math.cos(angle), 0);
    const slope = new THREE.Vector3(side * Math.cos(angle), -Math.sin(angle), 0);
    const basis = new THREE.Matrix4().makeBasis(normal, slope, normal.clone().cross(slope));
    for (let row = 0; row < Math.ceil(slopeLength / .44); row++) {
      const along = Math.min(slopeLength - .15, .2 + row * .44);
      for (let col = 0; col < Math.ceil(roofDepth / .27); col++) {
        transform.position.set(centerX + side * along * Math.cos(angle), height + rise - along * Math.sin(angle) + .06, centerZ - roofDepth / 2 + .13 + col * .27);
        transform.quaternion.setFromRotationMatrix(basis); transform.updateMatrix(); tileTransforms.push(transform.matrix.clone());
      }
    }
  });
  const ridgeBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  for (let z = centerZ - roofDepth / 2 + .2; z < centerZ + roofDepth / 2; z += .45) {
    transform.position.set(centerX, height + rise + .05, z); transform.quaternion.setFromRotationMatrix(ridgeBasis); transform.updateMatrix(); tileTransforms.push(transform.matrix.clone());
  }
  const tiles = new THREE.InstancedMesh(roofTile, materials.roof[n % 3], tileTransforms.length);
  const color = new THREE.Color(); const random = randomSequence(n);
  tileTransforms.forEach((matrix, i) => { tiles.setMatrixAt(i, matrix); color.set('#ffffff').offsetHSL(0, (random() - .5) * .12, -.08 + random() * .12); tiles.setColorAt(i, color); });
  tiles.receiveShadow = true; parent.add(tiles);
}

function addArchedPortal(parent, x, y, z, width, height) {
  const r = width / 2, spring = height - r, border = .17;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, spring);
  shape.absarc(0, spring, r, 0, Math.PI, false); shape.closePath();
  mesh(new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: false }), materials.door, parent, x, y, z + .045);
  [-1, 1].forEach(side => mesh(box, materials.dressedStone, parent, x + side * (r + border / 2), y + spring / 2, z + .11, border, spring + .05, .25));
  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI * i / 10;
    const block = mesh(box, materials.dressedStone, parent, x + Math.cos(angle) * (r + border / 2), y + spring + Math.sin(angle) * (r + border / 2), z + .11, (r + border / 2) * Math.PI / 10 + .02, border, .25);
    block.rotation.z = angle + Math.PI / 2;
  }
  mesh(box, materials.dressedStone, parent, x, y + height + .07, z + .16, .22, .26, .3);
  mesh(box, materials.iron, parent, x, y + .6, z + .13, .035, .18, .04);
}

function addManorWindow(parent, x, y, z, width = .65, height = .95) {
  mesh(box, materials.window, parent, x, y, z + .04, width, height, .08);
  [-1, 1].forEach(side => {
    mesh(box, materials.dressedStone, parent, x + side * (width / 2 + .06), y, z + .09, .12, height + .16, .18);
    const shutter = mesh(box, materials.door, parent, x + side * (width / 2 + .29), y, z + .04, .28, height, .07); shutter.rotation.y = side * .18;
  });
  mesh(box, materials.dressedStone, parent, x, y - height / 2 - .07, z + .13, width + .3, .14, .28);
  mesh(box, materials.dressedStone, parent, x, y + height / 2 + .1, z + .1, width + .35, .13, .22);
}

function addManor(parent, unit) {
  const width = 5.2, depth = 3.7, height = 3.65, centerX = -.45, centerZ = -.65, front = centerZ + depth / 2;
  mesh(box, materials.manor, parent, centerX, height / 2, centerZ, width, height, depth);
  mesh(box, materials.stone, parent, centerX, .17, centerZ, width + .13, .34, depth + .13);
  addTiledRoof(parent, { width, depth, height, rise: .95, centerX, centerZ, wall: materials.manor, seed: hash(unit.id) });
  [1.95, 3.62].forEach(y => mesh(box, materials.dressedStone, parent, centerX, y, centerZ, width + .22, .14, depth + .2));
  for (const x of [centerX - width / 2, centerX + width / 2]) for (const z of [centerZ - depth / 2, front]) for (let i = 0; i < 8; i++) {
    mesh(box, materials.dressedStone, parent, x, .25 + i * .43, z, i % 2 ? .33 : .5, .35, i % 2 ? .5 : .33);
  }
  addArchedPortal(parent, centerX, .1, front, .94, 1.6);
  [-1.65, 1.65].forEach(x => addManorWindow(parent, centerX + x, .99, front, .6, .82));
  [-1.65, 0, 1.65].forEach(x => addManorWindow(parent, centerX + x, 2.87, front, .68, x === 0 ? 1.18 : .98));
  // A modest piano nobile balcony and an iron railing identify the manor silhouette.
  mesh(box, materials.dressedStone, parent, centerX, 2.19, front + .37, 2.1, .16, .87);
  [-.73, .73].forEach(x => mesh(box, materials.dressedStone, parent, centerX + x, 1.99, front + .2, .22, .3, .4));
  for (let i = 0; i <= 10; i++) mesh(box, materials.iron, parent, centerX - .96 + i * .192, 2.6, front + .78, .035, .74, .035);
  mesh(box, materials.iron, parent, centerX, 2.97, front + .78, 2.0, .055, .065);
  [-.96, .96].forEach(x => mesh(box, materials.iron, parent, centerX + x, 2.97, front + .4, .05, .055, .76));
  [-1, 1].forEach(side => {
    for (const z of [-1, .8]) mesh(box, materials.window, parent, centerX + side * (width / 2 + .025), 2.8, centerZ + z, .055, .82, .55);
    mesh(box, materials.dressedStone, parent, centerX, .05 + (side + 1) * .05, front + .4 - side * .15, 1.8, .1, .65);
  });
  mesh(box, materials.stone, parent, centerX + 1.1, 4.35, centerZ - .7, .42, .77, .46);
  mesh(box, materials.roof[1], parent, centerX + 1.1, 4.76, centerZ - .7, .57, .1, .6);
}

function addParish(parent, unit) {
  const width = 3.9, depth = 4.4, height = 2.75, centerX = -.6, centerZ = -.6, front = centerZ + depth / 2;
  mesh(box, materials.parish, parent, centerX, height / 2, centerZ, width, height, depth);
  mesh(box, materials.stone, parent, centerX, .18, centerZ, width + .1, .36, depth + .1);
  addTiledRoof(parent, { width, depth, height, rise: 1.0, centerX, centerZ, wall: materials.parish, seed: hash(unit.id) });
  addArchedPortal(parent, centerX, .2, front, 1.08, 1.65);
  [-1.65, 1.65].forEach(x => {
    mesh(box, materials.dressedStone, parent, centerX + x, 1.37, front + .09, .26, 2.74, .2);
    mesh(box, materials.dressedStone, parent, centerX + x, 2.62, front + .14, .43, .16, .28);
  });
  mesh(box, materials.dressedStone, parent, centerX, 2.77, front + .12, width + .16, .14, .3);
  const oculus = mesh(new THREE.CircleGeometry(.29, 24), materials.window, parent, centerX, 2.4, front + .06);
  oculus.castShadow = false;
  mesh(new THREE.TorusGeometry(.32, .065, 7, 24), materials.dressedStone, parent, centerX, 2.4, front + .11);
  mesh(box, materials.dressedStone, parent, centerX, 2.4, front + .14, .04, .53, .04);
  mesh(box, materials.dressedStone, parent, centerX, 2.4, front + .14, .53, .04, .04);
  for (let i = 0; i < 3; i++) mesh(box, materials.dressedStone, parent, centerX, .045 + i * .07, front + .68 - i * .2, 1.85 - i * .12, .09 + i * .035, .65);
  const towerX = 2.1, towerZ = -.35;
  mesh(box, materials.parish, parent, towerX, 1.75, towerZ, 1.08, 3.5, 1.15);
  mesh(box, materials.stone, parent, towerX, .16, towerZ, 1.18, .32, 1.25);
  mesh(box, materials.dressedStone, parent, towerX, 3.5, towerZ, 1.25, .17, 1.3);
  for (const dx of [-.43, .43]) for (const dz of [-.45, .45]) mesh(box, materials.parish, parent, towerX + dx, 4.05, towerZ + dz, .23, 1.1, .23);
  mesh(box, materials.dressedStone, parent, towerX, 4.62, towerZ, 1.3, .18, 1.37);
  const cap = mesh(new THREE.ConeGeometry(.95, .8, 4), materials.roof[2], parent, towerX, 5.1, towerZ); cap.rotation.y = Math.PI / 4;
  const bellPoints = [[.08, .25], [.14, .2], [.16, 0], [.25, -.19], [.31, -.23], [.3, -.28], [.2, -.26]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(bellPoints, 16), materials.bell, parent, towerX, 4.1, towerZ);
  mesh(box, materials.iron, parent, towerX, 4.39, towerZ, .06, .25, .06);
  mesh(box, materials.iron, parent, centerX, 4.0, front + .05, .085, .62, .085);
  mesh(box, materials.iron, parent, centerX, 4.1, front + .05, .4, .085, .085);
  mesh(box, materials.iron, parent, towerX, 5.7, towerZ, .075, .54, .075);
  mesh(box, materials.iron, parent, towerX, 5.8, towerZ, .34, .075, .075);
}

function addBuilding(parent, unit, building) {
  if (building.type === 'manor') { addManor(parent, unit); return; }
  if (building.type === 'parish') { addParish(parent, unit); return; }
  const n = hash(unit.id), reference = unit.source !== 'extracted';
  const width = 3.6, depth = 2.9, height = 1.85, rise = .88;
  const centerX = -.45, centerZ = -.55, front = centerZ + depth / 2;
  const body = mesh(box, reference ? materials.reference : materials.wall[n % 4], parent, centerX, height / 2, centerZ, width, height, depth);
  if (reference) {
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: '#7a806f', transparent: true, opacity: .45 }));
    outline.position.copy(body.position); outline.scale.copy(body.scale); parent.add(outline); return;
  }
  mesh(box, materials.stone, parent, centerX, .16, centerZ, width + .13, .32, depth + .12);
  addTiledRoof(parent, { width, depth, height, rise, centerX, centerZ, wall: materials.wall[n % 4], seed: n });
  // Small shuttered openings, a timber lintel and a heavy plank door.
  mesh(box, materials.window, parent, centerX - .55, .7, front + .025, .82, 1.4, .06);
  mesh(box, materials.door, parent, centerX - .55, .68, front + .07, .65, 1.33, .08);
  mesh(box, materials.door, parent, centerX - .55, 1.45, front + .09, 1.0, .16, .17);
  mesh(box, materials.stone, parent, centerX - .55, .075, front + .35, 1.05, .15, .65);
  mesh(box, materials.window, parent, centerX + .83, 1.14, front + .035, .46, .53, .07);
  mesh(box, materials.trim, parent, centerX + .83, .85, front + .1, .62, .11, .18);
  const shutter = mesh(box, materials.door, parent, centerX + 1.21, 1.15, front + .14, .38, .59, .07); shutter.rotation.y = -.35;
  mesh(box, materials.window, parent, centerX - width / 2 - .025, 1.27, centerZ - .2, .06, .38, .4);
  mesh(box, materials.stone, parent, centerX + .65, 2.65, centerZ - .75, .4, .66, .43);
  mesh(box, materials.roof[(n + 1) % 3], parent, centerX + .65, 3.0, centerZ - .75, .52, .1, .55);
  mesh(sphere, materials.pot, parent, centerX + 1.45, .24, front + .4, .22, .28, .22);
  mesh(cylinder, materials.pot, parent, centerX + 1.45, .51, front + .4, .11, .15, .11);
}

function ruralHeight(x, z) {
  return Math.sin(x * .035) * 2.4 + Math.cos(z * .031) * 1.6 + Math.sin((x + z) * .08) * .45;
}

function groundPatch(parent, points, heightAt, material, lift = .085) {
  const center = points.reduce((p, v) => [p[0] + v[0] / points.length, p[1] + v[1] / points.length], [0, 0]);
  const vertices = [];
  const triangulate = (a, b, c, depth) => {
    if (!depth) {
      for (const p of [a, b, c]) vertices.push(p[0], heightAt(p[0], p[1]) + lift, p[1]);
      return;
    }
    const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
    triangulate(a, ab, ca, depth - 1); triangulate(ab, b, bc, depth - 1);
    triangulate(ca, bc, c, depth - 1); triangulate(ab, bc, ca, depth - 1);
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    // Counterclockwise from above, for upward-facing terrain triangles.
    triangulate(center, b, a, 2);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
  const patch = new THREE.Mesh(geometry, material); patch.receiveShadow = true; parent.add(patch); return patch;
}

function dirtTrack(parent, points, heightAt, width = .9) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])));
  const vertices = [], indices = [];
  for (let i = 0; i <= 90; i++) {
    const p = curve.getPoint(i / 90), tangent = curve.getTangent(i / 90);
    const cross = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    for (const side of [-1, 1]) {
      const x = p.x + side * cross.x, z = p.z + side * cross.z;
      vertices.push(x, heightAt(x, z) + .11, z);
    }
    if (i) { const a = (i - 1) * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const path = new THREE.Mesh(geometry, materials.path); path.receiveShadow = true; parent.add(path);
}

function createRuralTerrain(group, originX, originZ) {
  const { width, depth, points } = group.layout;
  const random = randomSequence(hash(group.key) + 77);
  const centers = [...points.values()].map(p => ({ x: originX + p.x, z: originZ + p.z, y: ruralHeight(originX + p.x, originZ + p.z) }));
  // Gentle slopes flatten around each dwelling so houses and courtyards sit on the earth.
  const heightAt = (x, z) => {
    const natural = ruralHeight(x, z);
    let nearest = null, distance = 49;
    for (const p of centers) {
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < distance) { nearest = p; distance = d; }
    }
    if (!nearest) return natural;
    const blend = THREE.MathUtils.smoothstep(Math.sqrt(distance), 4.5, 7);
    return THREE.MathUtils.lerp(nearest.y, natural, blend);
  };
  group.heightAt = heightAt;
  const island = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(width + 28, depth + 28, Math.min(90, Math.ceil((width + 28) / 2.5)), Math.min(90, Math.ceil((depth + 28) / 2.5)));
  geometry.rotateX(-Math.PI / 2); geometry.translate(originX + width / 2, 0, originZ + depth / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)) - .035);
  geometry.computeVertexNormals();
  const faceted = geometry.toNonIndexed(); geometry.dispose();
  const colors = []; const palette = ['#657b46', '#839158', '#a19562', '#647f50'].map(c => new THREE.Color(c));
  const v = faceted.attributes.position;
  for (let i = 0; i < v.count; i += 3) {
    const x = (v.getX(i) + v.getX(i + 1) + v.getX(i + 2)) / 3;
    const z = (v.getZ(i) + v.getZ(i + 1) + v.getZ(i + 2)) / 3;
    const noise = .5 + Math.sin(x * .13) * Math.cos(z * .09) * .26 + Math.sin((x - z) * .19) * .13;
    const color = palette[Math.floor(noise * 3)].clone().lerp(palette[Math.min(3, Math.floor(noise * 3) + 1)], (noise * 3) % 1);
    color.offsetHSL(0, 0, (random() - .5) * .028);
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  }
  faceted.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(faceted, materials.terrain); terrain.receiveShadow = true; island.add(terrain);
  const clearOfHouses = (x, z, radius) => centers.every(p => (x - p.x) ** 2 + (z - p.z) ** 2 > radius ** 2);
  const stones = [], tuftMatrices = [], rockMatrices = [];
  const transform = new THREE.Object3D();
  let fields = 0, trees = 0;
  for (let z = originZ - 7; z < originZ + depth + 9; z += 13) {
    for (let x = originX - 7; x < originX + width + 9; x += 13) {
      const cx = x + (random() - .5) * 3, cz = z + (random() - .5) * 3;
      if (clearOfHouses(cx, cz, 5.9) && fields < 72 && random() > .16) {
        const w = 4 + random() * 2, d = 4.5 + random() * 2;
        const polygon = [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2 + .7], [cx + w / 2 - .8, cz + d / 2], [cx - w / 2 + .3, cz + d / 2 - .5]];
        groundPatch(island, polygon, heightAt, fields % 3 ? materials.field : materials.grain);
        for (let row = 0; row < 5; row++) {
          const rowX = cx - w / 2 + .6 + row * (w - 1.2) / 4;
          dirtTrack(island, [[rowX, cz - d / 2 + .65], [rowX + .12, cz], [rowX + .2, cz + d / 2 - .6]], heightAt, .13);
        }
        // Short dry-stone terrace edges; these are scenery, never record boundary links.
        if (fields % 2 === 0) for (let i = 0; i < 13; i++) {
          const sx = cx - w / 2 + i * w / 13, sz = cz + d / 2;
          transform.position.set(sx, heightAt(sx, sz) + .22, sz);
          transform.rotation.set(.05 * random(), .15 * random(), .06 * random());
          transform.scale.set(w / 13 + .08, .37 + random() * .15, .38); transform.updateMatrix(); stones.push(transform.matrix.clone());
        }
        if (trees < 45 && fields % 3 === 0) {
          addTree(island, cx - 1.5, cz, .95, 'olive', heightAt(cx - 1.5, cz));
          addTree(island, cx + 1.5, cz + 1.5, .85, 'olive', heightAt(cx + 1.5, cz + 1.5)); trees += 2;
        }
        fields++;
      } else if (clearOfHouses(cx, cz, 5.5) && trees < 45 && random() > .45) {
        addTree(island, cx, cz, .8 + random() * .5, random() > .7 ? 'chestnut' : 'olive', heightAt(cx, cz)); trees++;
      }
      for (let i = 0; i < 4; i++) {
        const sx = cx + (random() - .5) * 7, sz = cz + (random() - .5) * 7;
        if (!clearOfHouses(sx, sz, 4.5)) continue;
        transform.position.set(sx, heightAt(sx, sz) + .13, sz);
        transform.rotation.set(random(), random(), random()); transform.scale.set(.2 + random() * .22, .15 + random() * .2, .2 + random() * .22); transform.updateMatrix();
        (i % 3 ? tuftMatrices : rockMatrices).push(transform.matrix.clone());
      }
    }
  }
  [[box, materials.stone, stones], [sphere, materials.grass, tuftMatrices], [sphere, materials.rock, rockMatrices]].forEach(([geo, material, matrices]) => {
    if (!matrices.length) return;
    const details = new THREE.InstancedMesh(geo, material, matrices.length); matrices.forEach((matrix, i) => details.setMatrixAt(i, matrix));
    details.receiveShadow = true; details.castShadow = true; island.add(details);
  });
  // A winding track follows the rural margin; its course is deliberately schematic.
  dirtTrack(island, [[originX - 9, originZ - 12], [originX - 5, originZ + depth * .3], [originX - 8, originZ + depth * .7], [originX - 5, originZ + depth + 10]], heightAt, 1.55);
  dirtTrack(island, [[originX - 5, originZ + depth + 6], [originX + width * .35, originZ + depth + 4], [originX + width * .7, originZ + depth + 8], [originX + width + 10, originZ + depth + 5]], heightAt, 1.45);
  world.add(island); return island;
}

function createNode(unit, groupKey, x, z) {
  const container = new THREE.Group();
  const building = state.layer === 'land' ? { type: 'land', height: 3.4 } : classifyBuilding(unit);
  const elevation = groups.get(groupKey).heightAt(x, z);
  container.position.set(x, elevation, z);
  container.userData.id = unit.id;
  const isReference = unit.source !== 'extracted';
  const plotMaterial = new THREE.MeshStandardMaterial({ color: '#aa9b72', roughness: 1, transparent: true, opacity: .06, depthWrite: false });
  const plot = mesh(hex, plotMaterial, container, 0, .035, 0); plot.castShadow = false;
  const borderGeometry = new THREE.EdgesGeometry(hex, 30);
  const border = new THREE.LineSegments(borderGeometry, new THREE.LineBasicMaterial({color: '#8d9e76', transparent: true, opacity: .65}));
  border.position.y = .035;
  container.add(border);
  const apron = mesh(yard, materials.ground, container, -.2, .025, .05, 3.2, 1, 2.9); apron.castShadow = false;
  if (state.layer === 'land') {
    const grove = /grove/i.test(unit.role);
    const vineyard = /vineyard/i.test(unit.role);
    const garden = /garden/i.test(unit.role);
    for (let i = 0; i < 5; i++) {
      const material = grove || garden ? materials.field : i % 2 ? materials.field : materials.soil;
      mesh(box, material, container, -2.3 + i * 1.08, .18, 0, .62, .13, 4.2);
    }
    if (isReference) mesh(box, materials.reference, container, 0, .65, 0, 1, 1.3, 1);
    else if (grove) {
      [[-2, -1.7], [0, -1.5], [2, -1.8], [-1, 1.4], [1.4, 1.5]].forEach(([tx, tz], index) => addTree(container, tx, tz, .68 + index % 2 * .12, 'chestnut'));
    } else if (vineyard) {
      for (let i = -2; i <= 2; i++) mesh(cylinder, materials.trunk, container, i * 1.05, .45, 0, .05, .8, .05);
    } else addTree(container, -1.8, -1.5, .85);
    container.scale.setScalar(1.15);
  } else {
    if (!/no residence|not (?:listed|specified)|unknown/i.test(unit.place)) addBuilding(container, unit, building);
    else mesh(cylinder, materials.reference, container, 0, .45, 0, .5, .9, .5);
    if (!isReference && unit.assets.some(asset => asset.type === 'trees')) addTree(container, building.type === 'dwelling' ? 2.7 : 3.3, -1.8, .85, 'chestnut');
    if (!isReference && unit.assets.some(asset => asset.type === 'land')) {
      const gardenZ = building.type === 'parish' ? -3.6 : building.type === 'manor' ? -3.2 : -2.65;
      for (let i = 0; i < 3; i++) mesh(box, materials.field, container, -1.5 + i * 1.1, .15, gardenZ, .75, .12, .7);
    }
  }
  world.add(container);
  const label = document.createElement('span');
  const selectedOwnerKey = state.units.find(candidate => candidate.id === state.selectedId)?.ownerKey;
  const isSelectedOwnerParcel = state.layer === 'land' && unit.ownerKey === selectedOwnerKey;
  label.className = `scene-label${isReference ? ' reference' : ''}${state.layer === 'land' ? ` land ${isSelectedOwnerParcel ? 'land-owner' : 'land-neighbor'}` : ''}`;
  if (state.layer === 'land') {
    label.textContent = isSelectedOwnerParcel && isReference
      ? `${unit.displayHead || unit.head} · unassigned reference`
      : unit.displayHead || unit.head;
  } else label.textContent = unit.head;
  labelRoot.append(label);
  const node = { unit, container, plot, border, groupKey, label, building, position: new THREE.Vector3(x, elevation, z) };
  nodes.set(unit.id, node);
  labels.push({ element: label, position: new THREE.Vector3(x, state.layer === 'land' ? elevation + .1 : elevation + building.height, z), node });
}

function localLayout(units) {
  const remaining = new Map(units.map(unit => [unit.id, unit]));
  const components = [];
  while (remaining.size) {
    const seed = [...remaining.values()].sort((a, b) => b.neighbors.length - a.neighbors.length)[0];
    const points = new Map([[seed.id, { x: 0, z: 0 }]]);
    const occupied = new Set(['0,0']);
    remaining.delete(seed.id);
    const queue = [seed];
    while (queue.length) {
      const current = queue.shift();
      const origin = points.get(current.id);
      for (const id of current.neighbors) {
        const next = remaining.get(id);
        if (!next) continue;
        let chosen;
        for (let ring = 1; ring < units.length + 2 && !chosen; ring++) {
          for (const [dx, dz] of edges) {
            const x = origin.x + dx * ring, z = origin.z + dz * ring;
            const key = `${x.toFixed(2)},${z.toFixed(2)}`;
            if (!occupied.has(key) && [...points.values()].every(p => Math.hypot(x - p.x, z - p.z) > 8.9)) {
              chosen = { x, z }; occupied.add(key); break;
            }
          }
        }
        points.set(id, chosen);
        remaining.delete(id);
        queue.push(next);
      }
    }
    const values = [...points.values()];
    const minX = Math.min(...values.map(p => p.x)), minZ = Math.min(...values.map(p => p.z));
    const width = Math.max(...values.map(p => p.x)) - minX + 11;
    const depth = Math.max(...values.map(p => p.z)) - minZ + 11;
    components.push({ points, minX, minZ, width, depth });
  }
  const totalArea = components.reduce((sum, c) => sum + (c.width + 2) * (c.depth + 2), 0);
  const shelfWidth = Math.max(35, Math.sqrt(totalArea) * 1.35, ...components.map(c => c.width));
  const result = new Map();
  let cursorX = 0, cursorZ = 0, rowDepth = 0, maxX = 0;
  for (const c of components) {
    if (cursorX && cursorX + c.width > shelfWidth) { cursorX = 0; cursorZ += rowDepth + 3; rowDepth = 0; }
    c.points.forEach((p, id) => result.set(id, { x: p.x - c.minX + cursorX + 6, z: p.z - c.minZ + cursorZ + 6 }));
    maxX = Math.max(maxX, cursorX + c.width);
    cursorX += c.width + 3;
    rowDepth = Math.max(rowDepth, c.depth);
  }
  return { points: result, width: maxX + 12, depth: cursorZ + rowDepth + 16 };
}

function rebuild() {
  disposeGroup(world); disposeGroup(linksGroup); disposeGroup(peopleGroup);
  labelRoot.replaceChildren(); nodes.clear(); groups.clear(); labels.length = 0;
  hover.hidden = true;
  root.classList.toggle('land-network', state.layer === 'land');
  scene.background.set(state.layer === 'land' ? 0xf1efe8 : 0xdce3d5);
  renderer.setClearColor(state.layer === 'land' ? 0xf1efe8 : 0xdce3d5);
  if (state.layer === 'land') {
    rebuildLandNetwork();
    return;
  }
  landOwnerReference = null;
  districtSelect.disabled = false;
  state.units.forEach(unit => {
    const key = unit.place || (state.layer === 'land' ? 'District not listed' : 'No residence listed');
    if (!groups.has(key)) groups.set(key, { key, units: [] });
    groups.get(key).units.push(unit);
  });
  const ordered = [...groups.values()].sort((a, b) => b.units.length - a.units.length);
  ordered.forEach(group => group.layout = localLayout(group.units));
  const area = ordered.reduce((total, g) => total + (g.layout.width + 18) * (g.layout.depth + 18), 0);
  const shelfWidth = Math.max(90, Math.sqrt(area) * 1.3, ...ordered.map(g => g.layout.width));
  let x = 0, z = 0, rowDepth = 0;
  ordered.forEach((group, index) => {
    if (x && x + group.layout.width > shelfWidth) { x = 0; z += rowDepth + 24; rowDepth = 0; }
    const { width, depth, points } = group.layout;
    const island = createRuralTerrain(group, x, z);
    group.island = island;
    group.bounds = new THREE.Box3(new THREE.Vector3(x - 14, -5, z - 14), new THREE.Vector3(x + width + 14, 9, z + depth + 14));
    group.units.forEach(unit => { const p = points.get(unit.id); createNode(unit, group.key, x + p.x, z + p.z); });
    const label = document.createElement('span');
    label.className = 'scene-label district'; label.textContent = displayPlace(group.key);
    labelRoot.append(label);
    labels.push({ element: label, position: new THREE.Vector3(x + width / 2, .5, z + depth - 2), group });
    x += width + 24; rowDepth = Math.max(rowDepth, depth);
  });
  districtSelect.innerHTML = `<option value="all">${tr('allDistricts')}</option>` + [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => `<option value="${escape(g.key)}">${escape(displayPlace(g.key))} (${g.units.filter(u => u.source === 'extracted').length})</option>`).join('');
  const selected = nodes.get(state.selectedId);
  scope = state.layer === 'land' ? 'all' : selected?.groupKey || 'all';
  districtSelect.value = scope;
  applyScope();
}

function rebuildLandNetwork() {
  districtSelect.disabled = true;
  const selected = state.units.find(unit => unit.id === state.selectedId) || state.units.find(unit => unit.source === 'extracted');
  if (!selected) {
    landOwnerReference = null;
    districtSelect.innerHTML = '<option value="all"></option>';
    applyScope();
    return;
  }
  landOwnerReference = selected.ownerKey || selected.id;
  const ownerParcels = state.units.filter(unit => unit.ownerKey === selected.ownerKey && unit.source === 'extracted');
  if (!ownerParcels.length) ownerParcels.push(selected);
  const ownerReferences = state.units.filter(unit => unit.ownerKey === selected.ownerKey && unit.source !== 'extracted' && !ownerParcels.some(parcel => parcel.id === unit.id));
  const ownerNodes = [...ownerParcels, ...ownerReferences];
  const ownerIds = new Set(ownerNodes.map(unit => unit.id));
  const unitsById = new Map(state.units.map(unit => [unit.id, unit]));
  const visibleById = new Map(ownerNodes.map(unit => [unit.id, unit]));
  ownerNodes.forEach(parcel => parcel.neighbors.forEach(id => {
    const neighbor = unitsById.get(id);
    if (neighbor && !ownerIds.has(id)) visibleById.set(id, neighbor);
  }));

  const parcelsByPlace = new Map();
  ownerParcels.forEach(parcel => {
    const placeKey = parcel.placeKey || parcel.place || 'not-listed';
    if (!parcelsByPlace.has(placeKey)) parcelsByPlace.set(placeKey, []);
    parcelsByPlace.get(placeKey).push(parcel);
  });
  const placeGroups = [...parcelsByPlace.values()];
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(placeGroups.length))));
  const rows = Math.ceil(placeGroups.length / columns);
  const clusterWidth = 31;
  const clusterDepth = 27;
  const positions = new Map();
  const fixed = new Set();
  placeGroups.forEach((parcels, groupIndex) => {
    const column = groupIndex % columns;
    const row = Math.floor(groupIndex / columns);
    const centerX = (column - (columns - 1) / 2) * clusterWidth;
    const centerZ = (row - (rows - 1) / 2) * clusterDepth;
    const innerColumns = Math.min(2, parcels.length);
    parcels.forEach((parcel, parcelIndex) => {
      const innerColumn = parcelIndex % innerColumns;
      const innerRow = Math.floor(parcelIndex / innerColumns);
      positions.set(parcel.id, {
        x: centerX + (innerColumn - (innerColumns - 1) / 2) * 10.8,
        z: centerZ + innerRow * 10.8
      });
      fixed.add(parcel.id);
    });
  });
  ownerReferences.forEach((reference, index) => {
    positions.set(reference.id, {
      x: (index - (ownerReferences.length - 1) / 2) * 12,
      z: (rows - .35) * clusterDepth
    });
    fixed.add(reference.id);
  });

  const suggestions = new Map();
  ownerNodes.forEach((parcel, parcelIndex) => {
    const center = positions.get(parcel.id);
    const neighborIds = parcel.neighbors.filter(id => visibleById.has(id) && !ownerIds.has(id));
    neighborIds.forEach((id, index) => {
      const angle = -Math.PI / 2 + Math.PI * 2 * index / Math.max(1, neighborIds.length) + (parcelIndex % 2 ? Math.PI / 7 : 0);
      if (!suggestions.has(id)) suggestions.set(id, []);
      suggestions.get(id).push({ x: center.x + Math.cos(angle) * 11.5, z: center.z + Math.sin(angle) * 11.5 });
    });
  });
  suggestions.forEach((points, id) => positions.set(id, {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length
  }));

  // Separate overlapping icons without implying geographic distance.
  const positionEntries = [...positions.entries()];
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < positionEntries.length; i++) for (let j = i + 1; j < positionEntries.length; j++) {
      const [idA, a] = positionEntries[i], [idB, b] = positionEntries[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.hypot(dx, dz) || .001;
      if (distance >= 9.8) continue;
      const push = (9.8 - distance) / 2;
      const ux = dx / distance, uz = dz / distance;
      if (!fixed.has(idA)) { a.x -= ux * push; a.z -= uz * push; }
      if (!fixed.has(idB)) { b.x += ux * push; b.z += uz * push; }
    }
  }

  const group = {
    key: 'selected-owner',
    units: [...visibleById.values()],
    heightAt: () => 0,
    island: new THREE.Group()
  };
  world.add(group.island);
  groups.set(group.key, group);
  group.units.forEach(unit => {
    const point = positions.get(unit.id);
    if (point) createNode(unit, group.key, point.x, point.z);
  });
  const placed = [...positions.values()];
  const minX = Math.min(...placed.map(point => point.x)) - 8;
  const maxX = Math.max(...placed.map(point => point.x)) + 8;
  const minZ = Math.min(...placed.map(point => point.z)) - 8;
  const maxZ = Math.max(...placed.map(point => point.z)) + 8;
  group.bounds = new THREE.Box3(new THREE.Vector3(minX, -2, minZ), new THREE.Vector3(maxX, 8, maxZ));
  districtSelect.disabled = true;
  districtSelect.innerHTML = '<option value="all"></option>';
  scope = 'all';
  districtSelect.value = scope;
  applyScope();
}

function applyScope() {
  visibleUnits = [];
  nodes.forEach(node => {
    node.container.visible = scope === 'all' || node.groupKey === scope;
    if (node.container.visible) visibleUnits.push(node);
  });
  groups.forEach(group => group.island.visible = scope === 'all' || group.key === scope);
  const records = visibleUnits.filter(n => n.unit.source === 'extracted').length;
  const references = visibleUnits.length - records;
  const noun = state.layer === 'land' ? (records === 1 ? 'parcel' : 'parcels') : (records === 1 ? tr('household') : tr('households'));
  $('#sceneStats').textContent = `${records} ${noun} · ${references} ${references === 1 ? tr('boundaryReference') : tr('boundaryReferences')}`;
  updateSelection();
  fitView();
  dirty = true;
}

function addPeople(node) {
  disposeGroup(peopleGroup);
  if (!node || state.layer === 'land' || node.unit.source !== 'extracted') return;
  const count = Math.min(12, node.unit.members.length);
  const front = node.building.type === 'parish' ? 3 : node.building.type === 'manor' ? 2.5 : 2.05;
  for (let i = 0; i < count; i++) {
    const x = node.position.x - 1.65 + i % 5 * .72;
    const z = node.position.z + front + Math.floor(i / 5) * .7;
    mesh(cylinder, materials.person, peopleGroup, x, node.position.y + .5, z, .15, .65, .15);
    mesh(sphere, materials.skin, peopleGroup, x, node.position.y + .98, z, .2, .2, .2);
  }
  peopleGroup.visible = node.container.visible;
}

function ownerSelectionNodes(node) {
  if (!node) return [];
  if (state.layer !== 'land' || !node.unit.ownerKey) return [node];
  return [...nodes.values()].filter(candidate => candidate.unit.ownerKey === node.unit.ownerKey);
}

function updateLinks(node) {
  disposeGroup(linksGroup);
  if (!node) return;
  const points = [];
  const curves = [];
  const seen = new Set();
  for (const source of ownerSelectionNodes(node)) {
    if (!source.container.visible) continue;
    for (const id of source.unit.neighbors) {
      const other = nodes.get(id);
      if (!other?.container.visible) continue;
      const edgeKey = [source.unit.id, id].sort().join('|');
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const start = source.position.clone().add(new THREE.Vector3(0, .35, 0));
      const end = other.position.clone().add(new THREE.Vector3(0, .35, 0));
      const mid = start.clone().lerp(end, .5); mid.y += Math.min(6, start.distanceTo(end) * .12 + 1);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      curves.push(curve);
      const samples = curve.getPoints(36);
      for (let i = 1; i < samples.length; i++) points.push(samples[i - 1], samples[i]);
    }
  }
  if (state.layer === 'land' && curves.length) {
    const material = new THREE.MeshBasicMaterial({ color: '#9a7433', transparent: true, opacity: .82, depthTest: false });
    curves.forEach(curve => {
      const link = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, .075, 5, false), material);
      link.renderOrder = 5;
      linksGroup.add(link);
    });
    return;
  }
  if (points.length) {
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: .45, gapSize: .22, transparent: true, opacity: 1, depthTest: false }));
    line.computeLineDistances(); line.renderOrder = 5; linksGroup.add(line);
  }
}

function updateSelection() {
  const selected = nodes.get(state.selectedId);
  const selectedNodes = ownerSelectionNodes(selected);
  const selectedIds = new Set(selectedNodes.map(node => node.unit.id));
  const neighbors = new Set(selectedNodes.flatMap(node => node.unit.neighbors || []));
  const query = state.search?.toLowerCase().trim();
  nodes.forEach(node => {
    const active = selectedIds.has(node.unit.id), neighbor = neighbors.has(node.unit.id) && !active;
    const match = !query || [node.unit.head, node.unit.parcelName, node.unit.place, node.unit.role, ...node.unit.members].join(' ').toLowerCase().includes(query);
    node.plot.material.color.set(active ? '#57a88c' : neighbor ? '#cbb578' : !match ? '#c4c8bb' : node.unit.source === 'extracted' ? '#c4cfa7' : '#c9cbb8');
    node.plot.material.opacity = active ? .42 : neighbor ? .22 : !match ? .03 : .045;
    node.border.material.color.set(active ? '#196451' : neighbor ? '#997232' : '#8d9e76');
    node.border.material.opacity = active ? .85 : neighbor ? .5 : .08;
    node.label.classList.toggle('selected', active);
    node.label.classList.toggle('neighbor', neighbor);
    node.matchesSearch = match;
  });
  addPeople(selected); updateLinks(selected);
  if (!selected) { inspector.innerHTML = `<h3>${tr('noRecords')}</h3><p>${tr('uploadToExplore')}</p>`; return; }
  const u = selected.unit;
  const reference = u.source !== 'extracted';
  const buildingCue = visibleBuildingCue(selected.building);
  const neighborNodes = u.neighbors.map(id => nodes.get(id)).filter(Boolean);
  const crossDistrict = neighborNodes.filter(n => !n.container.visible).length;
  const landRecord = state.layer === 'land' && !reference;
  const unresolvedOwnerReferences = landRecord ? ownerSelectionNodes(selected).filter(node => node.unit.source !== 'extracted').length : 0;
  inspector.innerHTML = `<p class="inspector-kicker">${reference ? 'Named in a boundary record' : landRecord ? 'Landholding record' : 'Household record'}</p>
    <h3>${escape(landRecord ? u.parcelName : u.displayHead || u.head)}</h3><p>${escape(landRecord ? `${u.displayHead || u.head} · ${u.place}` : u.place)}${!reference && !landRecord && u.role ? ` · ${escape(u.role)}` : ''}</p>
    ${state.layer !== 'land' && !reference ? `<p class="building-style"><strong>${escape(selected.building.label)}</strong>${buildingCue ? `<br>${escape(buildingCue)}` : ''}</p>` : ''}
    ${reference ? '<p>Only a boundary reference is available. This marker does not establish a complete parcel.</p>' : landRecord ? `<details open><summary>Landholding details</summary><ul><li>${escape(u.role)}</li><li>${escape(u.capacity)}</li><li>${escape(u.income)}</li>${(u.boundaryFeatures || []).map(feature => `<li>${escape(feature)} boundary</li>`).join('')}</ul></details>` : `<details><summary>${u.members.length} household members</summary><ul>${u.members.map(m => `<li>${escape(m)}</li>`).join('')}</ul></details>`}
    <details${neighborNodes.length ? ' open' : ''}><summary>${neighborNodes.length} recorded ${state.layer === 'land' ? 'land' : 'residence'} neighbor${neighborNodes.length === 1 ? '' : 's'}</summary>
      <div class="neighbor-list">${neighborNodes.map(n => {
        const evidence = u.neighborEvidence?.[n.unit.id] || {};
        const evidenceLabel = evidence.outbound && evidence.inbound ? ' · mutual reference' : evidence.outbound ? ' · named here' : evidence.inbound ? ' · names this owner' : '';
        return `<button type="button" data-select="${escape(n.unit.id)}">${escape(n.unit.displayHead || n.unit.head)}${state.layer === 'land' ? '' : n.unit.source !== 'extracted' ? ' · unresolved parcel' : evidenceLabel}</button>`;
      }).join('')}</div>
      ${crossDistrict ? `<p>${crossDistrict} in another district. Select a name to visit.</p>` : ''}
      ${!neighborNodes.length ? '<p>No named neighbors were parsed. Nearby placement is illustrative.</p>' : ''}</details>
    ${unresolvedOwnerReferences ? `<p>${unresolvedOwnerReferences} additional boundary reference${unresolvedOwnerReferences === 1 ? '' : 's'} to ${escape(u.head)} could not be assigned to a specific parcel.</p>` : ''}
    ${u.hasPublicRoad ? '<p>Public road mentioned in the record.</p>' : ''}`;
  localizeInspector(selected);
  inspector.querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => window.catasto.select(button.dataset.select)));
  dirty = true;
}

function visibleBuildingCue(building) {
  const cue = building?.cue || '';
  return /^Style cue:\s*the household head is titled Magnificent\.\s*$/i.test(cue) ? '' : cue;
}

function localizeInspector(selected) {
  if (language === 'en') return;
  if (!selected) {
    inspector.querySelector('h3').textContent = tr('noRecords');
    inspector.querySelector('p').textContent = tr('uploadToExplore');
    return;
  }
  const unit = selected.unit;
  const reference = unit.source !== 'extracted';
  const kicker = inspector.querySelector('.inspector-kicker');
  if (kicker) kicker.textContent = reference ? tr('namedBoundary') : state.layer === 'land' ? 'Voce del terreno' : tr('householdRecord');
  const identity = inspector.querySelector('h3 + p');
  if (identity) identity.textContent = state.layer === 'land' && !reference
    ? (unit.displayHead || unit.head) + ' · ' + displayPlace(unit.place)
    : displayPlace(unit.place) + (!reference && unit.role ? ' · ' + unit.role : '');
  const details = [...inspector.querySelectorAll('details')];
  const neighborDetails = details.at(-1);
  if (!reference && state.layer !== 'land' && details[0]) details[0].querySelector('summary').textContent = unit.members.length + ' ' + tr('members');
  else if (!reference && state.layer === 'land' && details[0]) details[0].querySelector('summary').textContent = tr('landSummary');
  if (neighborDetails) {
    const count = unit.neighbors.map(id => nodes.get(id)).filter(Boolean).length;
    neighborDetails.querySelector('summary').textContent = count + ' ' + (state.layer === 'land' ? tr('landNeighbors') : tr('residenceNeighbors'));
    const emptyMessage = neighborDetails.querySelector('p');
    if (emptyMessage && !count) emptyMessage.textContent = tr('noNeighbors');
    const crossDistrictNote = [...neighborDetails.querySelectorAll('p')].find(p => /another district|altro rione/i.test(p.textContent));
    if (crossDistrictNote) {
      const hiddenCount = unit.neighbors.map(id => nodes.get(id)).filter(node => node && !node.container.visible).length;
      crossDistrictNote.textContent = hiddenCount + ' ' + tr('anotherDistrict');
    }
  }
  const buildingStyle = inspector.querySelector('.building-style');
  if (buildingStyle) {
    const label = selected.building.type === 'parish' ? tr('parish') : selected.building.type === 'manor' ? tr('manor') : tr('ruralDwelling');
    const cue = visibleBuildingCue(selected.building);
    let detail = cue.replace(/^Style cue:\s*/i, '').replace(/ mentioned in the source\.$/i, '').replace(/ menzionato nella fonte\.$/i, '').replace(/^the household head is titled\s+/i, '').replace(/\.$/, '');
    if (selected.building.type === 'parish') detail = 'la chiesa parrocchiale';
    if (selected.building.type === 'manor') detail = detail.replace(/^Magnificent$/i, 'Magnifico').replace(/^Illustrious$/i, 'Illustre');
    buildingStyle.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = label;
    buildingStyle.append(strong);
    if (detail) {
      buildingStyle.append(document.createElement('br'));
      buildingStyle.append((selected.building.type === 'manor' ? 'Indizio stilistico: il capofamiglia ha il titolo di ' : 'Indizio stilistico: nella fonte è menzionato ') + detail + '.');
    }
  }
  const publicRoad = [...inspector.querySelectorAll('p')].find(p => /Public road mentioned|strada pubblica/i.test(p.textContent));
  if (publicRoad) publicRoad.textContent = tr('publicRoad');
}

function moveCamera(target, distance, direction) {
  const offset = direction || camera.position.clone().sub(controls.target).normalize();
  const end = target.clone().add(offset.multiplyScalar(distance));
  if (reducedMotion || mode !== '3d') {
    controls.target.copy(target); camera.position.copy(end); controls.update();
  } else {
    transition = { start: performance.now(), from: camera.position.clone(), to: end, fromTarget: controls.target.clone(), toTarget: target };
  }
  dirty = true;
}

function fitView() {
  const bounds = new THREE.Box3();
  groups.forEach(g => { if (scope === 'all' || scope === g.key) bounds.union(g.bounds); });
  if (bounds.isEmpty()) {
    moveCamera(new THREE.Vector3(), 45, new THREE.Vector3(.5, .8, 1).normalize());
    return;
  }
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3()); center.y = 0;
  const width = Math.max(1, root.clientWidth), height = Math.max(1, root.clientHeight);
  const distance = Math.max(size.x / (width / height), size.z * .9, 23) / (2 * Math.tan(THREE.MathUtils.degToRad(21))) * 1.25;
  controls.maxDistance = Math.max(300, distance * 3);
  camera.far = Math.max(5000, distance * 5); camera.updateProjectionMatrix();
  moveCamera(center, distance, overhead ? new THREE.Vector3(0, 1, .001).normalize() : new THREE.Vector3(.5, .95, 1).normalize());
  sun.target.position.copy(center);
  sun.position.copy(center).add(new THREE.Vector3(-60, 100, 60));
  const radius = Math.max(45, size.x / 2, size.z / 2);
  sun.shadow.camera.left = -radius; sun.shadow.camera.right = radius;
  sun.shadow.camera.top = radius; sun.shadow.camera.bottom = -radius;
  sun.shadow.camera.far = 1000; sun.shadow.camera.updateProjectionMatrix();
  scene.fog.density = state.layer === 'land' ? 0 : .04 / Math.max(30, size.length());
}

function focusSelection() {
  const node = nodes.get(state.selectedId);
  if (!node) return;
  if (state.layer === 'land') {
    if (scope !== 'all') {
      scope = 'all';
      districtSelect.value = scope;
      applyScope();
    }
    const ownerNodes = visibleUnits.filter(candidate => candidate.container.visible);
    const bounds = new THREE.Box3();
    ownerNodes.forEach(candidate => bounds.expandByPoint(candidate.position));
    if (bounds.isEmpty()) return;
    bounds.expandByScalar(9);
    const size = bounds.getSize(new THREE.Vector3());
    const target = bounds.getCenter(new THREE.Vector3()); target.y += 1;
    const aspect = Math.max(1, root.clientWidth) / Math.max(1, root.clientHeight);
    const distance = Math.max(size.x / aspect, size.z, 18) / (2 * Math.tan(THREE.MathUtils.degToRad(21))) * 1.08;
    moveCamera(target, distance, overhead ? new THREE.Vector3(0, 1, .001).normalize() : new THREE.Vector3(.35, 1, .45).normalize());
    return;
  }
  if (!node.container.visible) { scope = node.groupKey; districtSelect.value = scope; applyScope(); }
  const large = ['manor', 'parish'].includes(node.building.type);
  const target = node.position.clone(); target.y += large ? 2 : 1;
  moveCamera(target, large ? 35 : 29, overhead ? new THREE.Vector3(0, 1, .001).normalize() : new THREE.Vector3(.7, .7, 1).normalize());
}

function sync() {
  const previous = state;
  state = window.catasto.getState();
  const selectedLandOwner = state.layer === 'land'
    ? state.units.find(unit => unit.id === state.selectedId)?.ownerKey || state.selectedId
    : null;
  if (unitReference !== state.units || layerReference !== state.layer || (state.layer === 'land' && selectedLandOwner !== landOwnerReference)) {
    unitReference = state.units; layerReference = state.layer;
    rebuild();
    if (state.layer === 'land') focusSelection();
  } else {
    const node = nodes.get(state.selectedId);
    if (state.layer !== 'land' && node && scope !== 'all' && node.groupKey !== scope) {
      scope = node.groupKey; districtSelect.value = scope; applyScope();
    } else updateSelection();
    if (previous.selectedId !== state.selectedId) focusSelection();
  }
}

function setMode(next) {
  mode = '3d';
  root.hidden = false;
  resize(); fitView();
  dirty = true;
}

function resize() {
  if (root.hidden) return;
  const width = root.clientWidth, height = root.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
}

function pick(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(visibleUnits.map(n => n.container), true);
  if (!hits.length) return null;
  let object = hits[0].object;
  while (object && !object.userData.id) object = object.parent;
  return nodes.get(object?.userData.id);
}

function projectLabels() {
  let count = 0;
  const selected = nodes.get(state.selectedId);
  const selectedNodes = ownerSelectionNodes(selected);
  const selectedIds = new Set(selectedNodes.map(node => node.unit.id));
  const neighbors = new Set(selectedNodes.flatMap(node => node.unit.neighbors || []));
  for (const label of labels) {
    let visible = label.node ? label.node.container.visible : label.group.island.visible;
    if (label.node) {
      const distance = camera.position.distanceTo(label.position);
      visible &&= label.node.matchesSearch && (selectedIds.has(label.node.unit.id) || neighbors.has(label.node.unit.id) || distance < 95) && count < 75;
    }
    projected.copy(label.position).project(camera);
    const x = (projected.x * .5 + .5) * root.clientWidth;
    const y = (-projected.y * .5 + .5) * root.clientHeight;
    visible &&= projected.z > -1 && projected.z < 1 && x > 15 && x < root.clientWidth - 15 && y > 175 && y < root.clientHeight - 48;
    label.element.hidden = !visible;
    if (visible) { label.element.style.left = `${x}px`; label.element.style.top = `${y}px`; count++; }
  }
}

controls.addEventListener('start', () => { transition = null; hover.hidden = true; });
controls.addEventListener('change', () => { dirty = true; });
canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
canvas.addEventListener('pointerup', event => {
  if (down?.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5 && event.button === 0) {
    const node = pick(event); if (node) window.catasto.select(node.unit.id);
  }
  down = null;
});
canvas.addEventListener('pointercancel', () => { down = null; hover.hidden = true; });
canvas.addEventListener('pointerleave', () => { hover.hidden = true; });
canvas.addEventListener('pointermove', event => {
  if (event.buttons || event.pointerType === 'touch') { hover.hidden = true; return; }
  const node = pick(event);
  hover.hidden = !node;
  canvas.style.cursor = node ? 'pointer' : 'grab';
  if (!node) return;
  hover.textContent = state.layer === 'land'
    ? `${node.unit.displayHead || node.unit.head} · ${node.unit.parcelName || node.unit.place || 'Adjacent property'}`
    : node.unit.displayHead || node.unit.head;
  const rect = root.getBoundingClientRect();
  hover.style.left = `${Math.max(5, Math.min(root.clientWidth - 215, event.clientX - rect.left + 14))}px`;
  hover.style.top = `${Math.max(180, Math.min(root.clientHeight - 80, event.clientY - rect.top - 32))}px`;
});
canvas.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!['f', 'h', 't', '+', '=', '-', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) return;
  event.preventDefault();
  if (key === 'f') focusSelection();
  else if (key === 'h') fitView();
  else if (key === 't') $('#plan3d').click();
  else if (['+', '=', '-'].includes(key)) zoom(key === '-' ? 1.2 : .8);
  else {
    transition = null;
    const amount = camera.position.distanceTo(controls.target) * .06;
    const forward = controls.target.clone().sub(camera.position); forward.y = 0; forward.normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));
    const delta = (key === 'arrowup' ? forward : key === 'arrowdown' ? forward.negate() : key === 'arrowright' ? right : right.negate()).multiplyScalar(amount);
    camera.position.add(delta); controls.target.add(delta); dirty = true;
  }
});
function zoom(multiplier) {
  const distance = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * multiplier, controls.minDistance, controls.maxDistance);
  moveCamera(controls.target.clone(), distance);
}
districtSelect.addEventListener('change', () => {
  scope = districtSelect.value;
  if (scope !== 'all' && nodes.get(state.selectedId)?.groupKey !== scope) {
    const next = groups.get(scope)?.units.find(unit => unit.source === 'extracted');
    if (next) window.catasto.select(next.id);
  }
  applyScope();
});
$('#focus3d').addEventListener('click', focusSelection);
$('#fit3d').addEventListener('click', fitView);
$('#closer3d').addEventListener('click', () => zoom(.8));
$('#farther3d').addEventListener('click', () => zoom(1.2));
$('#details3d').addEventListener('click', () => {
  inspector.hidden = !inspector.hidden;
  $('#details3d').setAttribute('aria-pressed', String(!inspector.hidden));
});
function toggleExpanded(force) {
  const expanded = typeof force === 'boolean' ? force : !root.classList.contains('expanded');
  const environmentBar = document.querySelector('.environment-bar');
  root.classList.toggle('expanded', expanded);
  environmentBar?.classList.toggle('expanded', expanded);
  if (expanded && environmentBar) root.style.setProperty('--environment-header-height', `${environmentBar.offsetHeight}px`);
  else root.style.removeProperty('--environment-header-height');
  $('#expand3d').textContent = expanded ? 'Exit expanded' : 'Expand';
  $('#expand3d').setAttribute('aria-pressed', String(expanded));
  canvas.focus(); resize();
}
$('#expand3d').addEventListener('click', () => toggleExpanded());
document.addEventListener('keydown', event => { if (event.key === 'Escape' && root.classList.contains('expanded')) toggleExpanded(false); });
$('#plan3d').addEventListener('click', () => {
  overhead = !overhead;
  $('#plan3d').setAttribute('aria-pressed', String(overhead));
  $('#plan3d').textContent = overhead ? tr('perspective') : tr('topView');
  $('#plan3d').title = (language === 'it' ? 'Attiva la vista dall’alto' : 'Toggle overhead view') + ' (T)';
  moveCamera(controls.target.clone(), camera.position.distanceTo(controls.target), overhead ? new THREE.Vector3(0, 1, .001).normalize() : new THREE.Vector3(.5, .95, 1).normalize());
});
window.addEventListener('catasto:change', sync);
window.addEventListener('catasto:language-change', event => {
  language = event.detail?.language === 'it' ? 'it' : 'en';
  if (state.layer === 'land') {
    if (districtSelect.options.length) districtSelect.options[0].textContent = '';
  } else {
    if (districtSelect.options.length) districtSelect.options[0].textContent = tr('allDistricts');
    [...districtSelect.options].slice(1).forEach(option => {
      const count = option.textContent.match(/\s+\(\d+\)$/)?.[0] || '';
      option.textContent = displayPlace(option.value) + count;
    });
  }
  labels.filter(label => label.group).forEach(label => { label.element.textContent = displayPlace(label.group.key); });
  $('#expand3d').textContent = $('#expand3d').getAttribute('aria-pressed') === 'true' ? tr('exitExpanded') : tr('expand');
  const records = visibleUnits.filter(node => node.unit.source === 'extracted').length;
  const references = visibleUnits.length - records;
  const noun = state.layer === 'land' ? (records === 1 ? 'parcel' : 'parcels') : (records === 1 ? tr('household') : tr('households'));
  $('#sceneStats').textContent = records + ' ' + noun + ' · ' + references + ' ' + (references === 1 ? tr('boundaryReference') : tr('boundaryReferences'));
  updateSelection();
  dirty = true;
});
new ResizeObserver(resize).observe(root);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  $('#sceneStatus').hidden = false;
  $('#sceneStatus').textContent = tr('contextLost');
});

function frame(time) {
  requestAnimationFrame(frame);
  if (mode !== '3d' || document.hidden) return;
  if (transition) {
    const progress = Math.min(1, (time - transition.start) / 600);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(transition.from, transition.to, eased);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    if (progress === 1) transition = null;
    dirty = true;
  }
  controls.update();
  if (!dirty || time - previousTime < 24) return;
  previousTime = time;
  projectLabels(); renderer.render(scene, camera); dirty = false;
}

sync();
setMode('3d');
// Open in the richest district, close enough to explore the buildings immediately.
const firstDistrict = [...groups.values()].sort((a, b) => b.units.filter(u => u.source === 'extracted').length - a.units.filter(u => u.source === 'extracted').length)[0];
const firstUnit = firstDistrict?.units.filter(u => u.source === 'extracted').sort((a, b) => b.neighbors.length - a.neighbors.length)[0];
if (firstUnit) {
  window.catasto.select(firstUnit.id);
  const target = nodes.get(firstUnit.id).position.clone();
  moveCamera(target, 48, new THREE.Vector3(.6, .85, 1).normalize());
}
requestAnimationFrame(frame);
