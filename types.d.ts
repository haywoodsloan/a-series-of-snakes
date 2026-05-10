declare type GameList = Array<{
  name: string;
  load: () => Promise<{
    default: new (
      canvas: HTMLCanvasElement
    ) => import('./games/engine.js').default;
  }>;
  preview?: string;
}>;
