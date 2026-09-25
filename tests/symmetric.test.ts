// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Diagram, type DiagramJSON } from "../src/engine/diagram";
import { Sequence } from "../src/engine/sequence";
import { Path } from "../src/engine/path";
import { Curve } from "../src/engine/curve";
import { Vector } from "../src/engine/vector";

describe("Diagram symmetric flag", () => {
  it("keeps the flag through a JSON round trip", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [] });
    diagram.symmetric = true;
    const loaded = Diagram.fromJSON(JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON);
    expect(loaded.symmetric).toBe(true);
  });

  it("omits the flag when it is not set and loads an unset flag as undefined", () => {
    const diagram = new Diagram("Diagram", []);
    const json = JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON;
    expect("symmetric" in json).toBe(false);
    const loaded = Diagram.fromJSON(json);
    expect(loaded.symmetric).toBeUndefined();
  });

  it("keeps the flag when sequences change identity", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [], symmetric: true });
    const path = new Path();
    path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
    path.updateLength();
    diagram.sequences = [new Sequence(path)];
    const loaded = Diagram.fromJSON(diagram.toJSON());
    expect(loaded.symmetric).toBe(true);
  });

  it("keeps a false flag through a JSON round trip", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [], symmetric: false });
    const loaded = Diagram.fromJSON(JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON);
    expect(loaded.symmetric).toBe(false);
  });
});
