import { expect, test } from "vitest";
import { buildLibraryTree, deleteSavedDiagram, listSavedDiagrams, loadSavedDiagram, saveSavedDiagram } from "@/utils/diagramLibrary";
import type { BundledDiagramFolder } from "@/utils/diagramLibrary";

const bundled: BundledDiagramFolder = {
  name: "root",
  files: [{ name: "top.json", path: "diagrams/top.json" }],
  folders: [
    {
      name: "nested",
      files: [
        { name: "a.json", path: "diagrams/nested/a.json" },
        { name: "b.json", path: "diagrams/nested/b.json" },
      ],
      folders: [],
    },
  ],
};

test("buildLibraryTree puts the saved folder first with leaf children", () => {
  const [saved, topLevelFile] = buildLibraryTree(["Zeta", "Alpha"], bundled, "Saved", "empty");
  expect(saved?.key).toBe("saved");
  expect(saved?.label).toBe("Saved");
  expect(saved?.children).toEqual([
    { key: "saved:Zeta", label: "Zeta", type: "saved" },
    { key: "saved:Alpha", label: "Alpha", type: "saved" },
  ]);
  expect(saved?.children?.every((child) => child.type === "saved" && !child.children)).toBe(true);
  expect(topLevelFile).toEqual({ key: "bundled:diagrams/top.json", label: "top.json", path: "diagrams/top.json" });
});

test("buildLibraryTree nests the bundled tree with path-keyed leaves", () => {
  const [, , nestedFolder] = buildLibraryTree([], bundled, "Saved", "empty");
  expect(nestedFolder).toEqual({
    key: "folder:nested",
    label: "nested",
    children: [
      { key: "bundled:diagrams/nested/a.json", label: "a.json", path: "diagrams/nested/a.json" },
      { key: "bundled:diagrams/nested/b.json", label: "b.json", path: "diagrams/nested/b.json" },
    ],
  });
});

test("buildLibraryTree shows an unselectable empty placeholder when Saved is empty", () => {
  const [saved] = buildLibraryTree([], bundled, "Saved", "empty");
  expect(saved?.children).toEqual([{ key: "saved-empty", label: "empty", type: "placeholder", selectable: false }]);
});

// jsdom has no IndexedDB, so the guards must degrade instead of throwing.
test("the library utils fail soft without IndexedDB", async () => {
  await expect(listSavedDiagrams()).resolves.toEqual([]);
  await expect(saveSavedDiagram("A", "{}")).resolves.toBe(false);
  await expect(loadSavedDiagram("A")).resolves.toBeNull();
  await expect(deleteSavedDiagram("A")).resolves.toBe(false);
});
