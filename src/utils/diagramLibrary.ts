// IndexedDB persistence for the local saved-diagram library. Keys are the
// diagram names; the values are the DiagramJSON strings. IndexedDB can be
// unavailable, so every call degrades to an empty result instead of throwing.

const DB_NAME = "figure-skating-diagrams";
const STORE_NAME = "saved-diagrams";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB is unavailable."));
  });
}

function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The IndexedDB request failed."));
  });
}

export async function listSavedDiagrams(): Promise<string[]> {
  try {
    const db = await openDatabase();
    try {
      const keys = await runRequest(db, "readonly", (store) => store.getAllKeys());
      return keys.map(String).sort();
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("Could not list the saved diagrams:", error);
    return [];
  }
}

export async function saveSavedDiagram(name: string, json: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    try {
      await runRequest(db, "readwrite", (store) => store.put(json, name));
      return true;
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("Could not save the diagram:", error);
    return false;
  }
}

export async function loadSavedDiagram(name: string): Promise<unknown> {
  try {
    const db = await openDatabase();
    try {
      const value = await runRequest(db, "readonly", (store) => store.get(name));
      if (value === undefined) return null;
      return JSON.parse(String(value));
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("Could not open the saved diagram:", error);
    return null;
  }
}

export async function deleteSavedDiagram(name: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    try {
      await runRequest(db, "readwrite", (store) => store.delete(name));
      return true;
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("Could not delete the saved diagram:", error);
    return false;
  }
}

export type BundledDiagramFolder = {
  name: string;
  files: { name: string; path: string }[];
  folders: BundledDiagramFolder[];
};

export type LibraryTreeNode = {
  key: string;
  label: string;
  type?: "saved" | "placeholder";
  path?: string;
  selectable?: boolean;
  children?: LibraryTreeNode[];
};

// Merges the saved names and the bundled tree into Tree nodes. The saved
// folder comes first; its children carry the "saved" type used by the delete
// template. Bundled files and folders follow at the root level, nested
// folders keeping path-keyed leaves.
export function buildLibraryTree(
  savedNames: string[],
  bundled: BundledDiagramFolder,
  savedLabel: string,
  emptyLabel: string,
): LibraryTreeNode[] {
  const walk = (folder: BundledDiagramFolder, prefix: string): LibraryTreeNode => {
    const path = prefix ? `${prefix}/${folder.name}` : folder.name;
    return {
      key: `folder:${path}`,
      label: folder.name,
      children: [
        ...folder.files.map((file) => ({ key: `bundled:${file.path}`, label: file.name, path: file.path })),
        ...folder.folders.map((child) => walk(child, path)),
      ],
    };
  };
  return [
    {
      key: "saved",
      label: savedLabel,
      children: savedNames.length
        ? savedNames.map((name) => ({ key: `saved:${name}`, label: name, type: "saved" as const }))
        : [{ key: "saved-empty", label: emptyLabel, type: "placeholder" as const, selectable: false }],
    },
    ...bundled.files.map((file) => ({ key: `bundled:${file.path}`, label: file.name, path: file.path })),
    ...bundled.folders.map((child) => walk(child, "")),
  ];
}
