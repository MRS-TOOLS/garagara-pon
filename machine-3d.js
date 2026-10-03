import * as THREE from './assets/vendor/three.module.min.js';

// Three.js r184, locally hosted. No textures, models, or runtime CDN requests.
export function createMachine(stage) {
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'machine-canvas';
  stage.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2, 2, 1.8, -1.8, .1, 30);
  camera.position.set(4.6, 3.5, 6);
  camera.lookAt(0, 1.35, .4);
  scene.add(new THREE.HemisphereLight(0xfff4db, 0x626875, 2.4));
  const light = new THREE.DirectionalLight(0xfff1d9, 3);
  light.position.set(-3, 6, 5); scene.add(light);
  const fill = new THREE.DirectionalLight(0xdde8ff, 1);
  fill.position.set(5, 3, -4); scene.add(fill);
  const material = (color, metalness = 0, roughness = .7) => new THREE.MeshStandardMaterial({color, metalness, roughness});
  const wood = material(0xc7904e), endWood = material(0xdfaf6f), rimWood = material(0x8b542c);
  const metal = material(0x9ba4a2, .55, .4), trayMetal = material(0xc6cbc4, .3, .6);
  const gripMaterial = material(0xb96529), dark = material(0x241910);
  const mesh = (geometry, mat, parent = scene) => {const m = new THREE.Mesh(geometry, mat); parent.add(m); return m;};
  const box = (size, pos, mat, parent = scene) => {const m = mesh(new THREE.BoxGeometry(...size), mat, parent); m.position.set(...pos); return m;};
  function rod(a, b, radius, mat, parent = scene) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const m = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), mat, parent);
    m.position.copy(from.add(to).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  box([2.7, .16, 2.65], [0, .13, .45], wood);
  box([2.64, .045, 2.59], [0, .23, .45], endWood);
  // A shallow receiving tray sits directly below the opening.
  box([1.25, .07, 1.25], [-.12, .31, 1.02], trayMetal);
  box([1.33, .14, .06], [-.12, .39, 1.64], metal);
  box([1.33, .14, .06], [-.12, .39, .4], metal);
  box([.06, .14, 1.25], [-.76, .39, 1.02], metal);
  box([.06, .14, 1.25], [.52, .39, 1.02], metal);
  const centerY = 1.78, radius = .96, depth = .98, apothem = radius * Math.cos(Math.PI / 8);
  // Supports remain stationary while the drum and crank rotate around the X axle.
  for (const x of [-.67, .67]) {
    rod([x, .27, -.37], [x, centerY, 0], .065, metal);
    rod([x, .27, .37], [x, centerY, 0], .065, metal);
    rod([x, .57, -.29], [x, .57, .29], .045, metal);
  }
  rod([-.79, centerY, 0], [.8, centerY, 0], .055, metal);
  const drum = new THREE.Group(); drum.position.y = centerY; scene.add(drum);
  const panelHeight = 2 * radius * Math.sin(Math.PI / 8);
  const holeAngle = Math.PI / 4;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, -panelHeight / 2); shape.lineTo(depth / 2, -panelHeight / 2);
    shape.lineTo(depth / 2, panelHeight / 2); shape.lineTo(-depth / 2, panelHeight / 2); shape.closePath();
    if (i === 1) {const hole = new THREE.Path(); hole.absarc(0, 0, .132, 0, Math.PI * 2, true); shape.holes.push(hole);}
    const panel = mesh(new THREE.ExtrudeGeometry(shape, {depth: .045, bevelEnabled: false, curveSegments: 24}), wood, drum);
    panel.rotation.x = angle; panel.position.set(0, -Math.sin(angle) * apothem, Math.cos(angle) * apothem);
    if (i === 1) {
      const ring = mesh(new THREE.RingGeometry(.132, .158, 32), metal, drum);
      ring.rotation.x = angle; ring.position.set(0, -Math.sin(angle) * (apothem + .048), Math.cos(angle) * (apothem + .048));
      const recess = mesh(new THREE.CircleGeometry(.134, 32), dark, drum);
      recess.rotation.x = angle; recess.position.set(0, -Math.sin(angle) * (apothem - .14), Math.cos(angle) * (apothem - .14));
    }
  }
  // Flat octagonal end caps; no solid cylinder behind the real side opening.
  function endCap(x, size, mat) {
    const positions = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4, b = a + Math.PI / 4;
      positions.push(x, 0, 0, x, -Math.sin(a) * size, Math.cos(a) * size, x, -Math.sin(b) * size, Math.cos(b) * size);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    const faceMaterial = mat.clone(); faceMaterial.side = THREE.DoubleSide;
    return mesh(geometry, faceMaterial, drum);
  }
  endCap(-depth / 2 - .01, radius, rimWood);
  endCap(depth / 2 + .046, radius, rimWood);
  endCap(depth / 2 + .05, radius * .94, endWood);
  const hub = mesh(new THREE.CylinderGeometry(.15, .15, .09, 24), rimWood, drum); hub.rotation.z = Math.PI / 2; hub.position.x = .57;
  const crank = new THREE.Group(); crank.position.set(.81, centerY, 0); scene.add(crank);
  rod([-.2, 0, 0], [0, 0, 0], .045, metal, crank);
  rod([0, 0, 0], [0, .43, 0], .045, metal, crank);
  rod([0, .43, 0], [.29, .43, 0], .065, gripMaterial, crank);
  const ballRadius = .095;
  const ball = mesh(new THREE.SphereGeometry(ballRadius, 20, 14), material(0xffffff, .12, .3)); ball.visible = false;
  const rest = new THREE.Vector3(-.08, .345 + ballRadius, 1.1);
  const shadowMaterial = new THREE.MeshBasicMaterial({color: 0x242820, transparent: true, opacity: .18, depthWrite: false});
  const shadow = mesh(new THREE.CircleGeometry(.105, 24), shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.set(rest.x, .347, rest.z); shadow.visible = false;
  let lost = false;
  renderer.domElement.addEventListener('webglcontextlost', event => {event.preventDefault(); lost = true;});
  renderer.domElement.addEventListener('webglcontextrestored', () => {lost = false; render();});
  function render() {if (!lost) renderer.render(scene, camera);}
  function resize() {
    const width = stage.clientWidth; if (!width) return;
    const height = width * 325 / 360, aspect = width / height;
    const halfHeight = 1.88;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); render();
  }
  new ResizeObserver(resize).observe(stage); resize();
  function animate(duration, update) {
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {const t = Math.min(1, (now - start) / duration); update(t); render(); if (t < 1) requestAnimationFrame(frame); else resolve();}
      requestAnimationFrame(frame);
    });
  }
  function setResult(color) {
    ball.visible = shadow.visible = !!color;
    if (color) {ball.material.color.set(color); ball.position.copy(rest); shadowMaterial.opacity = .18;}
    render();
  }
  async function spin(color, reduced) {
    if (lost) throw new Error('WebGL context lost');
    setResult(null);
    if (!reduced) await animate(2200, t => {
      const eased = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      drum.rotation.x = crank.rotation.x = -eased * Math.PI * 6;
    });
    drum.rotation.x = crank.rotation.x = 0;
    ball.material.color.set(color); ball.visible = true;
    if (reduced) {setResult(color); return;}
    const normal = new THREE.Vector3(0, -Math.sin(holeAngle), Math.cos(holeAngle));
    const inside = normal.clone().multiplyScalar(apothem - .08).add(new THREE.Vector3(0, centerY, 0));
    const outside = normal.clone().multiplyScalar(apothem + .18).add(new THREE.Vector3(0, centerY, 0));
    // Keep the ball's physical size fixed. The wooden panel occludes it until it exits.
    await animate(180, t => ball.position.lerpVectors(inside, outside, t));
    shadow.visible = true;
    await animate(340, t => {
      ball.position.set(outside.x + (rest.x - outside.x) * t, outside.y + (rest.y - outside.y) * t * t, outside.z + (rest.z - outside.z) * t);
      shadow.position.set(ball.position.x, .347, ball.position.z); shadowMaterial.opacity = .04 + .14 * t;
    });
    await animate(330, t => {
      const bounce = t < .68 ? .14 * Math.sin(Math.PI * t / .68) : .035 * Math.sin(Math.PI * (t - .68) / .32);
      ball.position.set(rest.x, rest.y + Math.max(0, bounce), rest.z); shadowMaterial.opacity = .18 - Math.max(0, bounce) * .5;
    });
    setResult(color);
  }
  return {setResult, spin};
}
