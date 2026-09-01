import { NoiseGateWorkletNode } from "@sapphi-red/web-noise-suppressor";
import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import { MODULE_NAME } from "./utils/constants";
import { Logger } from "./utils/logger";

const log = new Logger("NoiseGateFilter");

/**
 * Build an absolute route to a module asset, respecting any Foundry route
 * prefix when the helper is available.
 */
function assetRoute(assetPath: string): string {
  const relative = `modules/${MODULE_NAME}/${assetPath}`;
  const getRoute = (
    foundry as unknown as {
      utils?: { getRoute?: (path: string) => string };
    }
  ).utils?.getRoute;
  return typeof getRoute === "function" ? getRoute(relative) : `/${relative}`;
}

/**
 * Whether the current browser supports the noise gate filter.
 */
export function isNoiseGateSupported(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

/**
 * A self-contained LiveKit audio TrackProcessor that applies a noise gate
 * (via @sapphi-red/web-noise-suppressor) entirely in the browser using an
 * AudioWorklet. Audio below the configured threshold is silenced, which
 * suppresses low-level background noise between speech. Runs fully client-side
 * so it works with self-hosted LiveKit deployments.
 */
export class NoiseGateFilter
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "noise-gate-filter";
  processedTrack?: MediaStreamTrack;

  private openThreshold: number;
  private audioContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private noiseGateNode?: NoiseGateWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;

  /**
   * @param openThreshold Level in dB above which the gate opens. Audio quieter
   *   than this value is silenced.
   */
  constructor(openThreshold = -50) {
    this.openThreshold = openThreshold;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    // Use the AudioContext provided by LiveKit / the caller.
    this.audioContext = opts.audioContext;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.audioContext.audioWorklet.addModule(
      assetRoute("noise-suppressor/noiseGateWorklet.js"),
    );

    this.sourceNode = this.audioContext.createMediaStreamSource(
      new MediaStream([opts.track]),
    );
    this.noiseGateNode = new NoiseGateWorkletNode(this.audioContext, {
      openThreshold: this.openThreshold,
      closeThreshold: this.openThreshold - 5,
      holdMs: 90,
      maxChannels: 1,
    });
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    this.sourceNode.connect(this.noiseGateNode);
    this.noiseGateNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    log.info("Noise gate filter initialized at", this.openThreshold, "dB");
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
      this.noiseGateNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch (error: unknown) {
      log.warn("Error while destroying noise gate filter:", error);
    } finally {
      // Note: the AudioContext is owned by the caller (LiveKitClient) and is
      // intentionally not closed here so it can be reused across tracks.
      this.sourceNode = undefined;
      this.noiseGateNode = undefined;
      this.destinationNode = undefined;
      this.audioContext = undefined;
      this.processedTrack = undefined;
    }
    return Promise.resolve();
  }
}
