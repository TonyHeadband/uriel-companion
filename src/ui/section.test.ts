// @vitest-environment happy-dom
import { section } from "./section";

test("a section is a details block titled by its summary", () => {
  const el = section("Body", true, document.createElement("p"));
  expect(el.tagName).toBe("DETAILS");
  expect(el.querySelector("summary")!.textContent).toBe("Body");
  expect(el.querySelector("p")).not.toBeNull();
});

test("open decides whether it starts expanded", () => {
  expect(section("A", true).open).toBe(true);
  expect(section("B", false).open).toBe(false);
});
