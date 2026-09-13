import { describe, expect, it } from "vitest";
import { Diagram, type DiagramJSON } from "../src/engine/diagram";
import { Sequence } from "../src/engine/sequence";
import { Path } from "../src/engine/path";
import { Curve } from "../src/engine/curve";
import { Vector } from "../src/engine/vector";

describe("Diagram videoUrl", () => {
  it("keeps the video url through a JSON round trip", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [] });
    diagram.videoUrl = "https://example.com/video.mp4";
    const loaded = Diagram.fromJSON(JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON);
    expect(loaded.videoUrl).toBe("https://example.com/video.mp4");
  });

  it("omits the video url when it is not set", () => {
    const diagram = new Diagram("Diagram", []);
    const json = JSON.parse(JSON.stringify(diagram.toJSON())) as DiagramJSON;
    expect(json.videoUrl).toBeUndefined();
    expect(Diagram.fromJSON(json).videoUrl).toBeUndefined();
  });

  it("keeps the video url when sequences change identity", () => {
    const diagram = Diagram.fromJSON({ name: "Diagram", sequences: [], videoUrl: "https://example.com/v.mp4" });
    const path = new Path();
    path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
    path.updateLength();
    diagram.sequences = [new Sequence(path)];
    const loaded = Diagram.fromJSON(diagram.toJSON());
    expect(loaded.videoUrl).toBe("https://example.com/v.mp4");
  });
});
