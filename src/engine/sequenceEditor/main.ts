import { Curve } from '../curve.js'
import './interaction.js'
import * as oneFootTurns from '../sequences/turns/oneFootTurns.js'
import { Path } from '../path.js'
import { LENGTH, WIDTH, CORNER_RADIUS } from '../rink.js'
import { CanvasRenderingContext2DSized } from '../rinkCanvas.js'
import { Sequence } from '../sequence.js'
import { Vector } from '../vector.js'

const RINK_COLOR = '#ccc'
const PATH_WIDTH = 1 // px
const NODE_SIZE = 10 // px

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d') as CanvasRenderingContext2DSized

type ViewState = {
  center: Vector<2>
  zoom: number // pixel per meter
  showPath: boolean
}

export const viewState: ViewState = {
  center: new Vector<2>(0, 0),
  zoom: Math.min(canvas.clientWidth / WIDTH, canvas.clientHeight / LENGTH),
  showPath: false,
}

function createInitialSequence(): Sequence {
  const initialPathLength = 1

  const point1 = new Vector<2>(0, -initialPathLength / 2)
  const point2 = new Vector<2>(0, initialPathLength / 2)
  const difference = point2.minus(point1)
  const controlPoint1 = point1.plus(difference.times(1 / 3))
  const controlPoint2 = point1.plus(difference.times(2 / 3))

  const curve = new Curve(point1, controlPoint1, controlPoint2, point2)

  const path = new Path()
  path.addCurveEnd(curve)

  const sequence = new Sequence(path)
  return sequence
}

// let sequence = createInitialSequence();
const sequence = oneFootTurns.LFI_Loop

function transformContext(ctx: CanvasRenderingContext2DSized, viewState: ViewState) {
  let translation = new Vector<2>(ctx.width / 2, -ctx.height / 2)
  translation = translation.times(1 / viewState.zoom)
  translation = translation.minus(viewState.center)

  ctx.save()
  ctx.scale(viewState.zoom, viewState.zoom)
  ctx.translate(translation.x, -translation.y)
}

function drawRink() {
  // Drow inset retangle with thick border to have corner radius
  const width = WIDTH - 2 * CORNER_RADIUS
  const height = LENGTH - 2 * CORNER_RADIUS

  ctx.lineWidth = 2 * CORNER_RADIUS
  ctx.lineJoin = 'round'
  ctx.fillStyle = RINK_COLOR
  ctx.strokeStyle = RINK_COLOR
  ctx.fillRect(-width / 2, -height / 2, width, height)
  ctx.strokeRect(-width / 2, -height / 2, width, height)
}

export function draw() {
  ctx.clearRect(0, 0, ctx.width, ctx.height)
  transformContext(ctx, viewState)
  drawRink()

  if (viewState.showPath) {
    const pathWidth = PATH_WIDTH / viewState.zoom
    const nodeSize = NODE_SIZE / viewState.zoom
    sequence.drawPathNodes(ctx, nodeSize)
    sequence.drawPath(ctx, pathWidth)
  }

  sequence.drawFootTraces(ctx)
  ctx.restore()
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth * window.devicePixelRatio
  canvas.height = canvas.clientHeight * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
  ctx.width = canvas.clientWidth
  ctx.height = canvas.clientHeight
  draw()
}

window.onresize = resizeCanvas
resizeCanvas()
