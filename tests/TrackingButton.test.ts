import { expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import TrackingButton from "@/components/TrackingButton.vue";

test("the crosshair icon draws the circle through the line midpoints with a center dot", () => {
  const wrapper = mount(TrackingButton, { props: { active: false } });
  const svg = wrapper.find(".tracking-button__icon");
  const circle = svg.find("circle");
  expect(circle.attributes("r")).toBe("5.5");
  const dot = svg.findAll("circle")[1];
  expect(dot).not.toBeUndefined();
  expect(dot!.attributes("r")).toBe("0.75");
  expect(dot!.attributes("stroke")).toBe("none");
  expect(dot!.attributes("fill")).toBe("currentColor");
  const [top, bottom, left, right] = svg.findAll("line");
  expect(top!.attributes("y1")).toBe("4.4");
  expect(top!.attributes("y2")).toBe("8.6");
  expect(bottom!.attributes("y1")).toBe("15.4");
  expect(bottom!.attributes("y2")).toBe("19.6");
  expect(left!.attributes("x1")).toBe("4.4");
  expect(left!.attributes("x2")).toBe("8.6");
  expect(right!.attributes("x1")).toBe("15.4");
  expect(right!.attributes("x2")).toBe("19.6");
  const radius = Number(circle.attributes("r"));
  expect(Math.abs(12 - (Number(top!.attributes("y1")) + Number(top!.attributes("y2"))) / 2)).toBe(radius);
  expect(Math.abs(12 - (Number(bottom!.attributes("y1")) + Number(bottom!.attributes("y2"))) / 2)).toBe(radius);
  expect(Math.abs(12 - (Number(left!.attributes("x1")) + Number(left!.attributes("x2"))) / 2)).toBe(radius);
  expect((Number(right!.attributes("x1")) + Number(right!.attributes("x2"))) / 2 - 12).toBe(radius);
  expect(Number(top!.attributes("y2")) - Number(top!.attributes("y1"))).toBeCloseTo(4.2, 9);
  expect(Number(right!.attributes("x2")) - Number(right!.attributes("x1"))).toBeCloseTo(4.2, 9);
  expect(wrapper.find("polygon").exists()).toBe(false);
});

test("the active cursor tracking mode still shows only the polygon", () => {
  const wrapper = mount(TrackingButton, { props: { active: true, mode: "cursor" } });
  const svg = wrapper.find(".tracking-button__icon");
  expect(svg.find("polygon").exists()).toBe(true);
  expect(svg.find("circle").exists()).toBe(false);
  expect(svg.findAll("line").length).toBe(0);
});
