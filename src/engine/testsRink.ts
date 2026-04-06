import { Curve } from "./curve.js";
import { FootKeyframe } from "./keyframe.js";
import { Path } from "./path.js";
import { getQuaternionFromAngleAxis, Quaternion } from "./quaternion.js";
import { ctx } from "./rinkCanvas.js";
import { Sequence } from "./sequence.js";
import {
  ForwardClockwiseFootTurn,
  ForwardCounterClockwiseFootTurn,
  BackwardClockwiseFootTurn,
  BackwardCounterClockwiseFootTurn,
} from "./turn.js";
import { Vector } from "./vector.js";

export function test() {
  const path = new Path();
  const sequence = new Sequence(path);

  const bladeHalfLength = 0.12;
  const bezierCircleParam = 0.551915;
  const interfaceLineWidth = 0.005;
  const fontSize = 0.1;
  const textHorizontalOffset = 0.2 * fontSize;
  const textVerticalOffset = 0.2 * fontSize;

  const nControlPoints = 7;
  const controlPointSize = 0.05;

  const controlsDom = document.getElementById("controls");
  const slidersDom: HTMLInputElement[] = [];
  const points = [];

  for (let i = 0; i < nControlPoints; i++) {
    const point = new Vector<2>(0, 0);
    points.push(point);
    const coords: ("x" | "y")[] = ["x", "y"];

    for (const coord of coords) {
      const id = coord + (i + 1).toString();

      // slider
      const sliderDom = document.createElement("input");
      sliderDom.type = "range";
      const range = coord == "x" ? ctx.width : ctx.height;
      sliderDom.min = String(-range / 2);
      sliderDom.max = String(range / 2);
      sliderDom.step = String(0.01);
      sliderDom.value = String(-0.8 + 0.3 * i);
      sliderDom.id = id;
      controlsDom?.appendChild(sliderDom);
      sliderDom.oninput = () => {
        point[coord] = parseFloat(sliderDom.value);
        update();
        draw();
      };
      slidersDom.push(sliderDom);

      point[coord] = parseFloat(sliderDom.value);

      // description
      const descDom = document.createElement("span");
      descDom.innerText = id;
      controlsDom?.appendChild(descDom);

      // line break
      if (coord === "x") continue;
      controlsDom?.appendChild(document.createElement("br"));
    }
  }

  function getControlPointCoordinates(i: number): [number, number] {
    return [parseFloat(slidersDom[2 * i].value), parseFloat(slidersDom[2 * i + 1].value)];
  }

  const curve1 = new Curve(points[0], points[1], points[2], points[3]);
  const curve2 = new Curve(points[3], points[4], points[5], points[6]);
  path.addCurveEnd(curve1);
  path.addCurveEnd(curve2);

  // Add keyframes
  sequence.addKeyframe(
    "footL",
    new FootKeyframe(0, {
      position: new Vector<3>(0, 0.2, 0),
      orientation: new Quaternion(),
      contactPoint: 0.5,
    }),
  );

  // Turn
  sequence.addKeyframe(
    "footL",
    new FootKeyframe(path.length / 2, {
      position: new Vector<3>(0, 0, 0),
    }),
  );

  sequence.addFootTurn("footL", new ForwardCounterClockwiseFootTurn(path.length / 2));

  sequence.addKeyframe(
    "footL",
    new FootKeyframe(path.length, {
      position: new Vector<3>(0, 0, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI * 1.5),
    }),
  );

  sequence.addKeyframe(
    "footR",
    new FootKeyframe(0, {
      position: new Vector<3>(0, -0.2, 0),
      orientation: new Quaternion(),
    }),
  );

  sequence.addKeyframe(
    "footR",
    new FootKeyframe(path.length / 4, {
      position: new Vector<3>(-0.3, -0.2, 0),
      orientation: getQuaternionFromAngleAxis(-Math.PI * 0.2),
      contactPoint: 0.8,
    }),
  );

  sequence.addKeyframe(
    "footR",
    new FootKeyframe(path.length / 2, {
      position: new Vector<3>(0.2, 0, 0.1),
      orientation: getQuaternionFromAngleAxis(Math.PI / 2),
      contactPoint: 0.5,
    }),
  );

  sequence.addKeyframe(
    "footR",
    new FootKeyframe(path.length, {
      position: new Vector<3>(0.3, 0.2, 0.2),
      orientation: getQuaternionFromAngleAxis(Math.PI),
    }),
  );

  function update() {
    curve1.updateLength();
    curve2.updateLength();
    path.updateLength();
  }

  function draw() {
    if (ctx == null) return;
    ctx.fillStyle = "#b0b0b0";
    ctx.fillRect(-ctx.width / 2, -ctx.height / 2, ctx.width, ctx.height);
    ctx.setLineDash([]);

    sequence.draw(ctx);

    ctx.lineWidth = interfaceLineWidth;
    drawControlPoints();
    // drawBezierPath();
    // drawBladeSize();
  }

  function drawControlPoints() {
    if (ctx == null) return;
    ctx.fillStyle = "black";
    ctx.strokeStyle = "black";
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    // control points
    for (let i = 0; i < slidersDom.length / 2; i++) {
      const [x, y] = getControlPointCoordinates(i);

      ctx.beginPath();
      ctx.arc(x, -y, controlPointSize / 2, 0, 2 * Math.PI);

      if (i % 3 == 0) {
        ctx.fill();
      } else {
        ctx.stroke();
      }

      ctx.fillText(String(i + 1), x + textHorizontalOffset, -y + textVerticalOffset);
    }

    // lines to contol points
    const invertY = (x: number, y: number) => [x, -y] as [number, number];
    ctx.setLineDash([0.02, 0.04]);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.moveTo(...invertY(...getControlPointCoordinates(3 * i + 1 + j)));
        ctx.lineTo(...invertY(...getControlPointCoordinates(3 * i + 3 * j)));
        ctx.stroke();
      }
    }
  }

  draw();
}
