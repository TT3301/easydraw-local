export interface SavedCanvasView {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

/** Keeps view persistence out of pointer gestures and continuous wheel scrolling. */
export class CanvasViewRecorder {
  private key: string | null = null;
  private latest: SavedCanvasView | null = null;
  private pending: SavedCanvasView | null = null;
  private gesture = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private write: (key: string, view: SavedCanvasView) => void) {}

  observe(key: string, view: SavedCanvasView, gesture: boolean) {
    if (key !== this.key) { this.reset(); this.key = key; }
    const wasGesture = this.gesture;
    this.gesture = gesture;
    const changed = !this.latest || view.zoom !== this.latest.zoom ||
      view.scrollX !== this.latest.scrollX || view.scrollY !== this.latest.scrollY;
    if (changed) { this.latest = view; this.pending = view; }
    if (gesture) { this.cancelTimer(); return; }
    if (wasGesture) { this.flush(); return; }
    if (changed) {
      this.cancelTimer();
      this.timer = setTimeout(this.flush, 200);
    }
  }

  flush = () => {
    this.cancelTimer();
    if (this.key && this.pending) this.write(this.key, this.pending);
    this.pending = null;
  };

  reset = () => {
    this.flush();
    this.key = null;
    this.latest = null;
    this.gesture = false;
  };

  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
