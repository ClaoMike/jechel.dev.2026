/**
 * Pure helpers of the viewer: camera framing, the code panel's language detection, link encoding.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as THREE from 'three'
import { decodeView, encodeView } from '../viewer/src/model/view-code.ts'
import { framing } from '../viewer/src/scene/framing.ts'
import { languageOf } from '../viewer/src/ui/code/languages.ts'

/** Projects a point with a camera placed by framing() and returns NDC x/y. */
function project(point: THREE.Vector3, center: THREE.Vector3, direction: THREE.Vector3, distance: number, aspect: number): THREE.Vector3 {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 60000)
  camera.position.copy(center).addScaledVector(direction.clone().normalize(), distance)
  camera.lookAt(center)
  camera.updateMatrixWorld()
  return point.clone().project(camera)
}

function corners(box: THREE.Box3): THREE.Vector3[] {
  const list: THREE.Vector3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) list.push(new THREE.Vector3(x, y, z))
  return list
}

describe('camera framing', () => {
  const box = new THREE.Box3(new THREE.Vector3(-300, -200, -250), new THREE.Vector3(300, 60, 250))
  const direction = new THREE.Vector3(0.62, 0.55, 0.9).normalize()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 60000)

  for (const aspect of [16 / 9, 1, 0.47]) {
    it(`fits the whole box on screen, snugly (aspect ${aspect.toFixed(2)})`, () => {
      const { center, distance } = framing(box, direction, camera, aspect)
      const points = corners(box).map((p) => project(p, center, direction, distance, aspect))
      for (const p of points) {
        assert.ok(Math.abs(p.x) <= 1.001 && Math.abs(p.y) <= 1.001, `corner inside the view (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`)
      }
      // Snug: some corner reaches close to an edge (padding 1.08 → about 0.93).
      const reach = Math.max(...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      assert.ok(reach > 0.85, `fills the view (${reach.toFixed(3)})`)
      // Centred: the picture is balanced left/right.
      const xs = points.map((p) => p.x)
      assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 0.02)
    })
  }

  it('keeps the box above a sheet covering the bottom of the view', () => {
    const inset = 0.46
    const { center, distance } = framing(box, direction, camera, 0.47, inset)
    const ys = corners(box).map((p) => project(p, center, direction, distance, 0.47).y)
    assert.ok(Math.min(...ys) >= -1 + 2 * inset - 0.01, 'nothing under the sheet')
    assert.ok(Math.max(...ys) <= 1.001)
  })

  it('never puts the camera inside a tiny box', () => {
    const tiny = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.1, 0.1))
    assert.ok(framing(tiny, direction, camera, 1).distance >= 20)
  })

  it('handles looking straight down', () => {
    const { distance } = framing(box, new THREE.Vector3(0, 1, 0), camera, 1)
    assert.ok(Number.isFinite(distance) && distance > 0)
  })
})

describe('code panel languages', () => {
  it('knows the stack and common files', () => {
    const cases: Record<string, string> = {
      'web/src/App.tsx': 'tsx',
      'web/src/api.ts': 'ts',
      'types/global.d.ts': 'ts',
      'scripts/build.mjs': 'js',
      'api/Program.cs': 'csharp',
      'api/Api.csproj': 'xml',
      'Portfolio.slnx': 'xml',
      'appsettings.Development.json': 'json',
      '.github/workflows/ci.yml': 'yaml',
      'README.md': 'markdown',
      'scripts/dev_launcher.py': 'python',
      'Dockerfile': 'dockerfile',
      'api/Dockerfile.dev': 'dockerfile',
      '.env': 'shell',
      '.gitignore': 'shell',
      'Makefile': 'shell',
      'requests.http': 'http',
      'schema.sql': 'sql',
      'styles.scss': 'css',
      'LICENSE': 'text',
      'data.unknown': 'text',
    }
    for (const [path, language] of Object.entries(cases)) assert.equal(languageOf(path), language, path)
  })
})

describe('view links', () => {
  it('round-trips the view through the URL, unicode included', () => {
    const view = { preset: 'architecture', selected: 'frontend:symbol:web/src/Café.tsx#Café', colorBy: 'layer' as const, labels: 'all' as const }
    const text = encodeView(view)
    assert.match(text, /^[A-Za-z0-9_-]+$/, 'URL-safe')
    assert.deepEqual(decodeView(text), view)
    assert.equal(decodeView('not base64 at all!'), null)
  })
})
