// Speed rays at strong acceleration (the client's task, 2026-10-22, modeled on a screenshot from another game): light
// translucent wedges from the screen edges toward the center. Each lives a fraction of a second, flashing and fading in a new place;
// the stronger the acceleration, the more of them, the brighter they are and the closer to the center they reach. Our own drawing, in code.

interface Ray {
  /** Direction from the screen center (radians). */
  angle: number;
  /** Half-width at the screen edge (radians). */
  half: number;
  /** Where the tip ends: a fraction of the distance to the screen corner (0 is the center). */
  inner: number;
  /** How long it has lived and how long it lives in total (seconds). */
  age: number;
  life: number;
}

/** How many rays at once at full strength. */
const MAX_RAYS = 26;

export class SpeedRays {
  private rays: Ray[] = [];

  /** Time step: strength 0..1 is the acceleration strength (0 means no rays, old ones burn out). */
  update(dt: number, strength: number): void {
    for (const r of this.rays) r.age += dt;
    this.rays = this.rays.filter((r) => r.age < r.life);
    const want = Math.round(MAX_RAYS * strength);
    while (this.rays.length < want) {
      this.rays.push({
        angle: Math.random() * Math.PI * 2,
        half: 0.015 + Math.random() * 0.045,
        inner: 0.62 - 0.3 * strength + Math.random() * 0.25,
        age: 0,
        life: 0.18 + Math.random() * 0.25,
      });
    }
  }

  /** Draw over the world in the rectangle (left, top, width, height); strength is the overall brightness. */
  draw(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number, strength: number): void {
    if (this.rays.length === 0) return;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const reach = Math.hypot(width, height) / 2;
    const far = reach * 1.05;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();
    for (const r of this.rays) {
      // Flashes and fades smoothly.
      const fade = Math.sin((Math.PI * r.age) / r.life);
      const alpha = 0.5 * fade * Math.max(0.35, strength);
      if (alpha <= 0.01) continue;
      const tip = reach * r.inner;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(r.angle) * tip, cy + Math.sin(r.angle) * tip);
      ctx.lineTo(cx + Math.cos(r.angle - r.half) * far, cy + Math.sin(r.angle - r.half) * far);
      ctx.lineTo(cx + Math.cos(r.angle + r.half) * far, cy + Math.sin(r.angle + r.half) * far);
      ctx.closePath();
      const grad = ctx.createLinearGradient(cx + Math.cos(r.angle) * tip, cy + Math.sin(r.angle) * tip, cx + Math.cos(r.angle) * far, cy + Math.sin(r.angle) * far);
      grad.addColorStop(0, 'rgba(255, 236, 170, 0)');
      grad.addColorStop(0.35, `rgba(255, 228, 150, ${alpha})`);
      grad.addColorStop(1, `rgba(255, 214, 120, ${alpha * 0.8})`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }
}
