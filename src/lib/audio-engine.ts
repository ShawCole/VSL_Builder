let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let startTime = 0;
let pausedAt = 0;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export async function fetchAndDecode(url: string): Promise<AudioBuffer> {
  const ctx = getContext();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

export function stitchBuffers(buffers: AudioBuffer[]): AudioBuffer {
  const ctx = getContext();
  const sampleRate = buffers[0].sampleRate;
  const numberOfChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);

  const output = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);

  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const outputData = output.getChannelData(channel);
      // If buffer has fewer channels, use channel 0 as fallback (mono → stereo)
      const inputChannel = channel < buffer.numberOfChannels ? channel : 0;
      const inputData = buffer.getChannelData(inputChannel);
      outputData.set(inputData, offset);
    }
    offset += buffer.length;
  }

  return output;
}

export function playBuffer(
  buffer: AudioBuffer,
  onEnded?: () => void,
  offsetSeconds = 0
): AudioBufferSourceNode {
  const ctx = getContext();

  // Stop any existing playback
  stop();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  if (onEnded) {
    source.onended = onEnded;
  }

  startTime = ctx.currentTime - offsetSeconds;
  pausedAt = 0;
  source.start(0, offsetSeconds);
  currentSource = source;

  return source;
}

export function stop() {
  if (currentSource) {
    try {
      currentSource.onended = null;
      currentSource.stop();
    } catch {
      // already stopped
    }
    currentSource = null;
  }
}

export function pause(): number {
  const ctx = getContext();
  const elapsed = ctx.currentTime - startTime;
  stop();
  pausedAt = elapsed;
  return elapsed;
}

export function getCurrentTime(): number {
  if (!audioContext) return pausedAt;
  if (currentSource) {
    return audioContext.currentTime - startTime;
  }
  return pausedAt;
}

export function isPlaying(): boolean {
  return currentSource !== null;
}

export function resumeContext(): Promise<void> {
  const ctx = getContext();
  if (ctx.state === "suspended") {
    return ctx.resume();
  }
  return Promise.resolve();
}
