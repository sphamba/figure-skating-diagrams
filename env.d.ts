/// <reference types="vite/client" />

declare module "virtual:diagram-tree" {
  export interface DiagramTreeFile {
    name: string;
    path: string;
  }

  export interface DiagramTreeFolder {
    name: string;
    files: DiagramTreeFile[];
    folders: DiagramTreeFolder[];
  }

  const diagramTree: DiagramTreeFolder;
  export default diagramTree;
}
