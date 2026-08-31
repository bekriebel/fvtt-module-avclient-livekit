import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import { MODULE_NAME } from "./utils/constants";
import { Logger } from "./utils/logger";

const log = new Logger("RnnoiseNoiseFilter");

// RNNoise operates on 48kHz audio.
export const RNNOISE_SAMPLE_RATE = 48000;

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
 * Whether the current browser supports the RNNoise noise filter.
 */
export function isRnnoiseSupported(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

/**
 * A self-contained LiveKit audio TrackProcessor that runs the open-source
 * RNNoise model (via @sapphi-red/web-noise-suppressor) entirely in the browser
 * using an AudioWorklet. It requires no server-side support, so it works with
 * self-hosted LiveKit deployments.
 */
export class RnnoiseNoiseFilter
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "rnnoise-noise-filter";
  processedTrack?: MediaStreamTrack;

  private audioContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private rnnoiseNode?: RnnoiseWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;

  async init(opts: AudioProcessorOptions): Promise<void> {
    // Use the AudioContext provided by LiveKit. The caller is responsible for
    // ensuring it runs at 48kHz, which RNNoise requires.
    this.audioContext = opts.audioContext;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const wasmBinary = await loadRnnoise({
      url: assetRoute("rnnoise/rnnoise.wasm"),
      simdUrl: assetRoute("rnnoise/rnnoise_simd.wasm"),
    });

    await this.audioContext.audioWorklet.addModule(
      assetRoute("rnnoise/rnnoiseWorklet.js"),
    );

    this.sourceNode = this.audioContext.createMediaStreamSource(
      new MediaStream([opts.track]),
    );
    this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
      wasmBinary,
      maxChannels: 1,
    });
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    this.sourceNode.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    log.info("RNNoise noise filter initialized");
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
      this.rnnoiseNode?.disconnect();
      this.rnnoiseNode?.destroy();
      this.destinationNode?.disconnect();
    } catch (error: unknown) {
      log.warn("Error while destroying RNNoise noise filter:", error);
    } finally {
      // Note: the AudioContext is owned by the caller (LiveKitClient) and is
      // intentionally not closed here so it can be reused across tracks.
      this.sourceNode = undefined;
      this.rnnoiseNode = undefined;
      this.destinationNode = undefined;
      this.audioContext = undefined;
      this.processedTrack = undefined;
    }
    return Promise.resolve();
  }
}
