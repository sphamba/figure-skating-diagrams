import * as THREE from 'three'
//@ts-ignore
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js'
//@ts-ignore
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { ctx } from './rinkCanvas.js'

const container = document.getElementById('webgl-container') as HTMLDivElement
const width = container.clientWidth
const height = container.clientHeight

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(width, height)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100)
camera.position.set(5, 1.7, 0)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0.85, 0)
controls.update()

scene.background = new THREE.Color(0xdddddd)

const ambient = new THREE.AmbientLight(0xc0c0c0)
scene.add(ambient)

const light = new THREE.DirectionalLight(0xffffff, 0.5)
light.position.set(0, 3, 0)
scene.add(light)
const lightHelper = new THREE.DirectionalLightHelper(light, 0.5)
scene.add(lightHelper)

// ground
const groundTexture = new THREE.CanvasTexture(ctx.canvas)
const groundMaterial = new THREE.MeshBasicMaterial({ map: groundTexture })
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), groundMaterial)
groundMesh.rotation.x = -Math.PI / 2
groundMesh.receiveShadow = true
scene.add(groundMesh)

// model
export let model: THREE.Group
export let skeleton: THREE.SkeletonHelper

const loader = new GLTFLoader()
loader.load('../models/Xbot.glb', (gltf: any) => {
  model = gltf.scene
  scene.add(model)

  skeleton = new THREE.SkeletonHelper(model)
  console.log(skeleton)
  // skeleton.visible = false;
  scene.add(skeleton)
})

export function animate() {
  renderer.render(scene, camera)
  groundTexture.needsUpdate = true
  requestAnimationFrame(animate)
}

animate()
