// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Diagram, type DiagramJSON } from "../src/engine/diagram";
import { Sequence } from "../src/engine/sequence";
import { Path } from "../src/engine/path";
import { Curve } from "../src/engine/curve";
import { Vector } from "../src/engine/vector";

const EXAMPLE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAADAAQAAf/1FQAAAAAASUVORK5CYII=";

describe("Diagram background image", () => {
  it("keeps the image and its opacity through a JSON round trip", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [] });
    diagram.backgroundImage = EXAMPLE_IMAGE;
    diagram.backgroundImageOpacity = 0.4;
    const loaded = Diagram.fromJSON(JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON);
    expect(loaded.backgroundImage).toBe(EXAMPLE_IMAGE);
    expect(loaded.backgroundImageOpacity).toBe(0.4);
  });

  it("omits the image and its opacity when they are not set", () => {
    const diagram = new Diagram("Diagram", []);
    const json = JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON;
    expect(json.backgroundImage).toBeUndefined();
    expect(json.backgroundImageOpacity).toBeUndefined();
    const loaded = Diagram.fromJSON(json);
    expect(loaded.backgroundImage).toBeUndefined();
    expect(loaded.backgroundImageOpacity).toBeUndefined();
  });

  it("keeps the image when sequences change identity", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [], backgroundImage: EXAMPLE_IMAGE });
    const path = new Path();
    path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
    path.updateLength();
    diagram.sequences = [new Sequence(path)];
    const loaded = Diagram.fromJSON(diagram.toJSON());
    expect(loaded.backgroundImage).toBe(EXAMPLE_IMAGE);
  });

  it("leaves the stored opacity unset when a json carries an image without one", () => {
    const loaded = Diagram.fromJSON({
      name: "Diagram",
      sequences: [],
      backgroundImage: EXAMPLE_IMAGE,
    });
    expect(loaded.backgroundImage).toBe(EXAMPLE_IMAGE);
    expect(loaded.backgroundImageOpacity).toBeUndefined();
  });
});
