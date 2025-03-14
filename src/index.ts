import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Pathfinding, PathfindingHelper } from "three-pathfinding";
import { GUI } from "dat.gui";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8def0);

// CAMERA
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.x = 0;
camera.position.y = 0;
camera.position.z = 0;
camera.lookAt(0, 0, 0);

// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

// ORBIT CAMERA CONTROLS
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.mouseButtons = {
  MIDDLE: THREE.MOUSE.ROTATE,
  RIGHT: THREE.MOUSE.PAN,
};
orbitControls.enableDamping = true;
orbitControls.enablePan = true;
orbitControls.minDistance = 5;
orbitControls.maxDistance = 60;
orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; // prevent camera below ground
orbitControls.minPolarAngle = Math.PI / 4; // prevent top down view
orbitControls.update();

// LIGHTS
const dLight = new THREE.DirectionalLight("white", 0.8);
dLight.position.x = 20;
dLight.position.y = 30;
dLight.castShadow = true;
dLight.shadow.mapSize.width = 4096;
dLight.shadow.mapSize.height = 4096;
const d = 35;
dLight.shadow.camera.left = -d;
dLight.shadow.camera.right = d;
dLight.shadow.camera.top = d;
dLight.shadow.camera.bottom = -d;
scene.add(dLight);

const aLight = new THREE.AmbientLight("white", 0.5);
scene.add(aLight);

// ATTACH RENDERER
document.body.appendChild(renderer.domElement);

// RESIZE HANDLER
function onWindowResize() {
  // camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onWindowResize);

// LOAD LEVEL
const loader = new GLTFLoader();
// load car
loader.load("./glb/defender.glb", (gltf: GLTF) => {
  scene.add(gltf.scene);

  // AGENT
  const agentRadius = 0.25;
  const agent = gltf.scene;
  // agent.position.y = 0.5;
  agent.position.x = 2;
  agent.scale.set(0.5, 0.5, 0.5);
  const agentGroup = new THREE.Group();
  agentGroup.add(agent);
  agentGroup.position.z = 0;
  agentGroup.position.x = 0;
  //   agentGroup.position.y = 1;
  scene.add(agentGroup);

  // change laod with GUI

  let map = 2;

  const maps = [
    {
      x: 0,
      y: 0,
      z: 0,
      scale: 0.7,
    },
    {
      x: 0,
      y: 0,
      z: 1,
      scale: 0.5,
    },
    {
      x: -50,
      y: -1,
      z: 30,
      scale: 0.5,
    },
  ];

  loader.load(`./glb/map${map}.glb`, (gltf: GLTF) => {
    gltf.scene.scale.set(maps[map].scale, maps[map].scale, maps[map].scale);
    // center model
    gltf.scene.position.x = maps[map].x;
    gltf.scene.position.y = maps[map].y;
    gltf.scene.position.z = maps[map].z;

    scene.add(gltf.scene);
  });

  // INITIALIZE THREE-PATHFINDING
  const pathfinding = new Pathfinding();
  const pathfindinghelper = new PathfindingHelper();
  scene.add(pathfindinghelper);
  const ZONE = "level1";
  const SPEED = 5;
  let navmesh;
  let groupID;
  let navpath;
  loader.load(`./glb/navMesh${map}.glb`, (gltf: GLTF) => {
    gltf.scene.scale.set(maps[map].scale, maps[map].scale, maps[map].scale);
    // center model
    gltf.scene.position.x = maps[map].x;
    gltf.scene.position.y = maps[map].y;
    gltf.scene.position.z = maps[map].z;

    // scene.add(gltf.scene);

    gltf.scene.traverse((node) => {
      if (
        !navmesh &&
        node.isObject3D &&
        node.children &&
        node.children.length > 0
      ) {
        navmesh = node.children[0];
        pathfinding.setZoneData(ZONE, Pathfinding.createZone(navmesh.geometry));
      }
    });
  });

  // RAYCASTING
  const raycaster = new THREE.Raycaster(); // create once
  const clickMouse = new THREE.Vector2(); // create once

  function intersect(pos: THREE.Vector2) {
    raycaster.setFromCamera(pos, camera);
    return raycaster.intersectObjects(scene.children);
  }
  window.addEventListener("click", (event) => {
    // THREE RAYCASTER
    clickMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    clickMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const found = intersect(clickMouse);
    if (found.length > 0) {
      let target = found[0].point;
      const agentpos = agentGroup.position;
      groupID = pathfinding.getGroup(ZONE, agentGroup.position);
      // find closest node to agent, just in case agent is out of bounds
      const closest = pathfinding.getClosestNode(agentpos, ZONE, groupID);
      navpath = pathfinding.findPath(closest.centroid, target, ZONE, groupID);
      if (navpath) {
        // console.log(`navpath: ${JSON.stringify(navpath)}`);
        pathfindinghelper.reset();
        pathfindinghelper.setPlayerPosition(agentpos);
        pathfindinghelper.setTargetPosition(target);
        pathfindinghelper.setPath(navpath);
      }
    }
  });

  // MOVEMENT ALONG PATH
  function move(delta: number) {
    if (!navpath || navpath.length <= 0) return;

    let targetPosition = navpath[0];
    const distance = targetPosition.clone().sub(agentGroup.position);

    if (distance.lengthSq() > 0.05 * 0.05) {
      distance.normalize();
      // Move player to target
      agentGroup.position.add(distance.multiplyScalar(delta * SPEED));
      // Rotate player to face target
      agentGroup.lookAt(targetPosition);
    } else {
      // Remove node from the path we calculated
      navpath.shift();
    }
  }

  // GAMELOOP
  const clock = new THREE.Clock();
  let gameLoop = () => {
    move(clock.getDelta());
    orbitControls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
  };
  gameLoop();
});
