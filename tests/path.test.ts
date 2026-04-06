import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Vector } from "../src/engine/vector";


test("Cut and merge", () => {
	let p1 = new Vector<2>(0, 0);
	let p2 = new Vector<2>(0.5, 0);
	let p3 = new Vector<2>(0.5, 1);
	let p4 = new Vector<2>(1, 1);
	let curve = new Curve(p1, p2, p3, p4);

	let path = new Path();
	path.addCurveEnd(curve);

	// Test cut
	path.cut(0, 0.2 as Curvilinear);

	// Test merge
	let midpoint = path.curves[0].p3;
	path.removePoint(midpoint);
});
