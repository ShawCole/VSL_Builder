import type { AudioTrack } from "@/types";

function audioUrl(fileId: string): string {
  if (fileId.includes("/") || fileId.endsWith(".mp3")) {
    return fileId;
  }
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

export class SequentialPlayer {
  private elements: HTMLAudioElement[] = [];
  private tracks: AudioTrack[] = [];
  private trackDurations: number[] = [];
  private trackOffsets: number[] = [];
  private currentTrackIndex = 0;
  private _isPlaying = false;
  private _globalTime = 0;
  private onTimeUpdateCb: ((time: number) => void) | null = null;
  private onEndedCb: (() => void) | null = null;
  private _playbackRate = 1;
  private preloaded = false;

  // Bound handler so we can add/remove it
  private handleTimeUpdate = () => {
    if (!this._isPlaying) return;
    this._globalTime = this.computeGlobalTime();
    this.onTimeUpdateCb?.(this._globalTime);
  };

  async preload(tracks: AudioTrack[]): Promise<number[]> {
    this.dispose();
    this.tracks = tracks;
    this.elements = [];
    this.trackDurations = [];
    this.trackOffsets = [];

    const loadPromises = tracks.map((track) => {
      return new Promise<{ el: HTMLAudioElement; duration: number }>((resolve, reject) => {
        const el = new Audio();
        el.preload = "auto";

        const onLoaded = () => {
          cleanup();
          resolve({ el, duration: el.duration });
        };
        const onError = () => {
          cleanup();
          reject(new Error(`Failed to load audio: ${track.label} (${track.drive_file_id})`));
        };
        const cleanup = () => {
          el.removeEventListener("canplaythrough", onLoaded);
          el.removeEventListener("error", onError);
        };

        el.addEventListener("canplaythrough", onLoaded, { once: true });
        el.addEventListener("error", onError, { once: true });
        el.src = audioUrl(track.drive_file_id);
        el.load();
      });
    });

    const results = await Promise.all(loadPromises);
    this.elements = results.map((r) => r.el);
    this.trackDurations = results.map((r) => r.duration);

    // Pre-compute offsets
    let offset = 0;
    this.trackOffsets = this.trackDurations.map((d) => {
      const o = offset;
      offset += d;
      return o;
    });

    // Wire up sequential playback + time tracking on each element
    this.elements.forEach((el, i) => {
      // timeupdate fires ~4x/sec from the browser — reliable source of truth
      el.addEventListener("timeupdate", this.handleTimeUpdate);

      el.addEventListener("ended", () => {
        if (this.currentTrackIndex !== i) return;

        if (i < this.elements.length - 1) {
          this.currentTrackIndex = i + 1;
          this.elements[i + 1].currentTime = 0;
          this.elements[i + 1].play();
          // Emit an immediate update at the segment boundary
          this._globalTime = this.trackOffsets[i + 1];
          this.onTimeUpdateCb?.(this._globalTime);
        } else {
          this._isPlaying = false;
          this._globalTime = this.totalDuration;
          this.onTimeUpdateCb?.(this._globalTime);
          this.onEndedCb?.();
        }
      });
    });

    if (this._playbackRate !== 1) {
      this.elements.forEach((el) => { el.playbackRate = this._playbackRate; });
    }

    this.preloaded = true;
    return this.trackDurations;
  }

  get totalDuration(): number {
    return this.trackDurations.reduce((sum, d) => sum + d, 0);
  }

  get durations(): number[] {
    return [...this.trackDurations];
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get globalTime(): number {
    // When playing, compute live position from the audio element
    if (this._isPlaying) {
      return this.computeGlobalTime();
    }
    return this._globalTime;
  }

  setOnTimeUpdate(cb: (time: number) => void) {
    this.onTimeUpdateCb = cb;
  }

  setOnEnded(cb: () => void) {
    this.onEndedCb = cb;
  }

  setPlaybackRate(rate: number) {
    this._playbackRate = rate;
    this.elements.forEach((el) => {
      el.playbackRate = rate;
    });
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  play() {
    if (!this.preloaded || this.elements.length === 0) return;
    if (this._isPlaying) return;

    this._isPlaying = true;
    this.elements[this.currentTrackIndex].play();
  }

  pause() {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    this.elements[this.currentTrackIndex]?.pause();
  }

  stop() {
    this._isPlaying = false;
    this.elements.forEach((el) => {
      el.pause();
      el.currentTime = 0;
    });
    this.currentTrackIndex = 0;
    this._globalTime = 0;
    this.onTimeUpdateCb?.(0);
  }

  seek(globalTime: number) {
    const clamped = Math.max(0, Math.min(globalTime, this.totalDuration));
    const wasPlaying = this._isPlaying;

    // Pause everything
    this._isPlaying = false;
    this.elements.forEach((el) => {
      el.pause();
      el.currentTime = 0;
    });

    // Find which track this time falls into
    let accumulated = 0;
    for (let i = 0; i < this.trackDurations.length; i++) {
      if (accumulated + this.trackDurations[i] > clamped) {
        this.currentTrackIndex = i;
        this.elements[i].currentTime = clamped - accumulated;
        break;
      }
      accumulated += this.trackDurations[i];
    }

    this._globalTime = clamped;
    this.onTimeUpdateCb?.(clamped);

    if (wasPlaying) {
      this.play();
    }
  }

  dispose() {
    this.stop();
    this.elements.forEach((el) => {
      el.removeEventListener("timeupdate", this.handleTimeUpdate);
      el.src = "";
      el.load();
    });
    this.elements = [];
    this.tracks = [];
    this.trackDurations = [];
    this.trackOffsets = [];
    this.currentTrackIndex = 0;
    this.preloaded = false;
  }

  private computeGlobalTime(): number {
    const offset = this.trackOffsets[this.currentTrackIndex] ?? 0;
    const currentEl = this.elements[this.currentTrackIndex];
    const pos = currentEl ? currentEl.currentTime : 0;
    return Math.min(offset + pos, this.totalDuration);
  }
}
