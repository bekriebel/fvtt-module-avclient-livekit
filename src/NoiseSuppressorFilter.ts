import {
  RnnoiseWorkletNode,
  loadRnnoise,
  SpeexWorkletNode,
  loadSpeex,
  GtcrnWorkletNode,
  loadGtcrn,
} from "@sapphi-red/web-noise-suppressor";
import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import { MODULE_NAME } from "./utils/constants";
import { Logger } from "./utils/logger";

const log = new Logger("NoiseSuppressorFilter");

// The AudioContext sample rate used for the noise suppression processors.
// RNNoise requires 48kHz; the Speex and GTCRN worklets resample internally, so
// a single 48kHz context works for every model.
export const NOISE_SUPPRESSION_SAMPLE_RATE = 48000;

/**
 * The available client-side noise suppression models.
 */
export type NoiseSuppressorModel = "rnnoise" | "speex" | "gtcrn";

export const NOISE_SUPPRESSION_MODELS: readonly NoiseSuppressorModel[] = [
  "rnnoise",
  "speex",
  "gtcrn",
];

/**
 * A generic worklet node with a `destroy` method, shared by every model node
 * exposed by @sapphi-red/web-noise-suppressor.
 */
type NoiseWorkletNode = (
  | RnnoiseWorkletNode
  | SpeexWorkletNode
  | GtcrnWorkletNode
) &
  AudioNode;

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
 * Whether the current browser supports the client-side noise suppression
 * filters.
 */
export function isNoiseSuppressionSupported(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

/**
 * Normalize an arbitrary string into a valid noise suppression model,
 * defaulting to RNNoise when the value is unknown.
 */
export function toNoiseSuppressorModel(value: unknown): NoiseSuppressorModel {
  return NOISE_SUPPRESSION_MODELS.includes(value as NoiseSuppressorModel)
    ? (value as NoiseSuppressorModel)
    : "rnnoise";
}

/**
 * A self-contained LiveKit audio TrackProcessor that runs an open-source noise
 * suppression model (via @sapphi-red/web-noise-suppressor) entirely in the
 * browser using an AudioWorklet. It requires no server-side support, so it
 * works with self-hosted LiveKit deployments.
 *
 * Three models are supported:
 * - `rnnoise`: RNNoise, a lightweight recurrent-neural-network denoiser.
 * - `speex`: the classic Speex DSP noise suppressor (lowest CPU cost).
 * - `gtcrn`: GTCRN, a stronger neural model (highest quality, highest cost).
 */
export class NoiseSuppressorFilter
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name: string;
  processedTrack?: MediaStreamTrack;

  private readonly model: NoiseSuppressorModel;
  private audioContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: NoiseWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;

  constructor(model: NoiseSuppressorModel = "rnnoise") {
    this.model = model;
    this.name = `noise-suppressor-${model}`;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    // Use the AudioContext provided by LiveKit. The caller is responsible for
    // ensuring it runs at 48kHz.
    this.audioContext = opts.audioContext;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.workletNode = await this.createWorkletNode(this.audioContext);

    this.sourceNode = this.audioContext.createMediaStreamSource(
      new MediaStream([opts.track]),
    );
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    log.info(`Noise suppression filter initialized (model: ${this.model})`);
  }

  private async createWorkletNode(
    audioContext: AudioContext,
  ): Promise<NoiseWorkletNode> {
    switch (this.model) {
      case "speex": {
        const wasmBinary = await loadSpeex({
          url: assetRoute("speex/speex.wasm"),
        });
        await audioContext.audioWorklet.addModule(
          assetRoute("speex/speexWorklet.js"),
        );
        return new SpeexWorkletNode(audioContext, {
          wasmBinary,
          maxChannels: 1,
        });
      }
      case "gtcrn": {
        const wasmBinary = await loadGtcrn({
          url: assetRoute("gtcrn/gtcrn.wasm"),
        });
        await audioContext.audioWorklet.addModule(
          assetRoute("gtcrn/gtcrnWorklet.js"),
        );
        return new GtcrnWorkletNode(audioContext, {
          wasmBinary,
          maxChannels: 1,
        });
      }
      case "rnnoise":
      default: {
        const wasmBinary = await loadRnnoise({
          url: assetRoute("rnnoise/rnnoise.wasm"),
          simdUrl: assetRoute("rnnoise/rnnoise_simd.wasm"),
        });
        await audioContext.audioWorklet.addModule(
          assetRoute("rnnoise/rnnoiseWorklet.js"),
        );
        return new RnnoiseWorkletNode(audioContext, {
          wasmBinary,
          maxChannels: 1,
        });
      }
    }
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
      this.workletNode?.disconnect();
      this.workletNode?.destroy();
      this.destinationNode?.disconnect();
    } catch (error: unknown) {
      log.warn("Error while destroying noise suppression filter:", error);
    } finally {
      // Note: the AudioContext is owned by the caller (LiveKitClient) and is
      // intentionally not closed here so it can be reused across tracks.
      this.sourceNode = undefined;
      this.workletNode = undefined;
      this.destinationNode = undefined;
      this.audioContext = undefined;
      this.processedTrack = undefined;
    }
    return Promise.resolve();
  }
}
