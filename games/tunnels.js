import { FG, SNAKE_ALT, TUNNEL_HUD } from '../utils/colors.js';
import Engine, { SCORE_FONT, STARTING_LENGTH } from './engine.js';

// Number of tunnels the player gets per run. Each body cell the head
// enters while underground consumes one; each tunneled segment refunds
// one when it falls off the tail. A multi-cell pass therefore costs N
// (and refunds N) for an N-cell crossing.
const STARTING_TUNNELS = 3;

// Color used for body segments the snake is currently tunneling through.
// Matches duo's secondary-snake tint so the highlighted span reads as a
// distinct, recognizable "other" color against the FG-green body.
const TUNNEL_SEGMENT_COLOR = SNAKE_ALT;

/**
 * Tunnels: classic rules with a limited "tunnel" ability. When the head
 * would crash into the snake's own body, a tunnel is consumed instead
 * and the snake passes through that body segment. The remaining count is
 * shown in the HUD; the body cells currently being tunneled through are
 * rendered in a distinct color so the overlap is easy to see. Running
 * out of tunnels makes the next self-hit end the run like in classic.
 */
export default class Tunnels extends Engine {
  constructor(canvas) {
    super(canvas);

    this._snake = this.addSnakeAtRandomCell({ length: STARTING_LENGTH });
    this._started = false;
    this._tunnelsRemaining = STARTING_TUNNELS;

    this.addRandomFood();

    this.onInput(({ dir }) => {
      this.setDirection(this._snake, dir);
      this._started = true;
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    this.stepAll();
  }

  /**
   * Wrap per-snake stepping so a tunneled tail segment that falls off the
   * end of the snake refunds its tunnel. Reference equality on the
   * previous tail handles every case (no pop, normal pop, post-eat
   * growth) without re-deriving the engine's pop condition. The engine's
   * tick loop marks the canvas dirty after every update(), so no extra
   * dirty flag is needed here.
   */
  stepSnake(snake) {
    const segs = snake.segments;
    const prevTail = segs[segs.length - 1];
    const result = super.stepSnake(snake);
    if (prevTail?.tunneled && segs[segs.length - 1] !== prevTail) {
      this._tunnelsRemaining += 1;
    }
    return result;
  }

  /**
   * Intercept self-collisions for the player's snake. Each tick the head
   * enters a body cell, one tunnel is spent and one overlapping body
   * segment is tagged so the renderer can highlight it. The closest-to-
   * head untagged matching segment is chosen so refunds (one per popped
   * tagged segment) stay in sync with cost. Other collision types (and
   * self-hits while out of tunnels) fall through to the default
   * game-over behavior.
   */
  onCollision(collision) {
    if (
      collision.type !== 'self'
      || collision.snake !== this._snake
      || this._tunnelsRemaining <= 0
    ) {
      super.onCollision(collision);
      return;
    }

    const segs = collision.snake.segments;
    const { at } = collision;
    for (let i = 1; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.x === at.x && seg.y === at.y && !seg.tunneled) {
        seg.tunneled = true;
        this._tunnelsRemaining -= 1;
        return;
      }
    }
    // Defensive: if every overlapping segment in `at` is already tagged
    // (the snake's path crosses an already-tunneled cell again before it
    // clears the body), the tunnel attempt is a no-op rather than a free
    // pass. The engine still treated this as a self-collision, but with
    // nothing left to tag we neither spend a tunnel nor end the run.
  }

  // Extend the default HUD with a centered "TUNNELS N" readout. Drawn
  // here (rather than in a render() override) so the engine's game-over
  // overlay dims it along with SCORE/HI, matching the rest of the chrome.
  _drawScore(layout) {
    super._drawScore(layout);

    const { ctx } = this;
    const { ox, oy, cell } = layout;
    const pad = Math.max(4, Math.round(cell * 0.25));
    const w = cell * this.cols;

    ctx.font = SCORE_FONT;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;
    // Use a HUD-only color distinct from every snake-segment color so
    // the counter stays readable against (and never blends into) the
    // body or the tunneled-segment overlay.
    ctx.fillStyle = TUNNEL_HUD;
    ctx.fillText(
      `TUNNELS ${this._tunnelsRemaining}`,
      ox + w / 2,
      oy + pad
    );
    ctx.textAlign = 'start';
    ctx.shadowBlur = 0;
  }

  // Override the snake renderer so tunneled body cells render in
  // TUNNEL_SEGMENT_COLOR instead of the snake's normal color, making
  // the overlapping span easy to see. The head is always drawn solid,
  // even on the tick it shares a cell with a tunneled body segment.
  _drawSnakes({ cell, ox, oy }) {
    const { ctx } = this;
    /** @type {Map<string, Path2D>} */
    const live = new Map();
    /** @type {Map<string, Path2D>} */
    const dead = new Map();
    const tunneled = new Path2D();
    let hasTunneled = false;

    for (const snake of this.snakes) {
      const color = snake.color ?? FG;
      const isDead = snake.dead;
      const solidBucket = isDead ? dead : live;
      let solidPath = solidBucket.get(color);
      if (!solidPath) {
        solidPath = new Path2D();
        solidBucket.set(color, solidPath);
      }

      const segs = snake.segments;
      // Head is always solid -- even on the dive tick it shares its
      // cell with a tunneled body segment underneath.
      const head = segs[0];
      solidPath.rect(ox + head.x * cell, oy + head.y * cell, cell, cell);
      for (let i = 1; i < segs.length; i++) {
        const seg = segs[i];
        if (!isDead && seg.tunneled) {
          tunneled.rect(ox + seg.x * cell, oy + seg.y * cell, cell, cell);
          hasTunneled = true;
        } else {
          solidPath.rect(ox + seg.x * cell, oy + seg.y * cell, cell, cell);
        }
      }
    }

    if (dead.size) {
      ctx.globalAlpha = 0.35;
      for (const [color, path] of dead) {
        ctx.fillStyle = color;
        ctx.fill(path);
      }
      ctx.globalAlpha = 1;
    }
    for (const [color, path] of live) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    if (hasTunneled) {
      ctx.fillStyle = TUNNEL_SEGMENT_COLOR;
      ctx.fill(tunneled);
    }
  }
}
