/// <reference types="vite/client" />

declare module "*.b64?raw" {
  const content: string;
  export default content;
}

declare module "shpjs" {
  const shp: (input: ArrayBuffer | string) => Promise<any>;
  export default shp;
}
