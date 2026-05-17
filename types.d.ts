// Ambient type declarations shared across the codebase. Declared globally
// (no `export`) so JSDoc comments in plain `.js` files can reference these
// names directly -- e.g. `/** @type {Snake} */` -- without an `import`.

// ---------- Engine: geometry ----------

declare type Point = { x: number; y: number };

declare type Direction = 'up' | 'down' | 'left' | 'right';

// ---------- Engine: entities ----------

declare type Snake = {
  /** Body segments, head first. */
  segments: Point[];
  /** Target length (segments grow toward this). */
  length: number;
  /** Current movement direction. */
  direction: Direction;
  /** Optional fill color. */
  color?: string;
  /** Set by the engine when a collision occurs. */
  dead?: boolean;
};

declare type Food = {
  /** Grid column. */
  x: number;
  /** Grid row. */
  y: number;
  /** Optional fill color (defaults to FOOD). */
  color?: string;
};

declare type Wall = {
  /** Grid column. */
  x: number;
  /** Grid row. */
  y: number;
  /** Optional fill color (defaults to WALL). */
  color?: string;
};

// ---------- Engine: input + collisions ----------

declare type InputKind = 'wasd' | 'arrows';

declare type CollisionType = 'self' | 'snake' | 'wall';

declare type Collision = {
  /** The snake whose head moved into something. */
  snake: Snake;
  /** What was hit. */
  type: CollisionType;
  /** For type='snake', the snake that was hit. */
  other?: Snake;
  /** For type='wall', the wall that was hit. */
  wall?: Wall;
  /** The cell the head ended up in. */
  at: Point;
};

// ---------- Settings ----------

declare type Settings = {
  baseSpeed: number;
  gridLines: boolean;
  gridSize: number;
};

// ---------- Games index ----------

declare type GameList = Array<{
  name: string;
  load: () => Promise<{
    default: new (
      canvas: HTMLCanvasElement
    ) => import('./games/engine.js').default;
  }>;
  preview?: string;
}>;
