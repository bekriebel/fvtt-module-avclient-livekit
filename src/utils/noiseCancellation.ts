import { Logger } from "./logger";

// Vite resolves these to asset URLs at build time
import rnnoiseWasmUrl from "@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url";
import rnnoiseWorkletUrl from "../workers/rnnoise-worklet.ts?url";

const log = new Logger("NoiseCancellation");

export class NoiseCancellation {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private initialized = false;
  private _enabled = false;

  get enabled(): boolean {
    return this._enabled;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Load the AudioWorklet module
      await this.audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);

      this.initialized = true;
      log.info("RNNoise noise cancellation initialized");
      return true;
    } catch (error) {
      log.warn("Failed to initialize noise cancellation:", error);
      this.initialized = false;
      return false;
    }
  }

  async processStream(inputStream: MediaStream): Promise<MediaStream> {
    if (!this.initialized || !this.audioContext) {
      log.warn("Noise cancellation not initialized, returning original stream");
      return inputStream;
    }

    this.cleanupNodes();

    try {
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(inputStream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "rnnoise-processor",
      );
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      // Load and send the WASM binary to the worklet
      await this.loadWasmIntoWorklet(this.workletNode);

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.destinationNode);

      this._enabled = true;
      this.workletNode.port.postMessage({ type: "toggle", enabled: true });

      log.info("Noise cancellation active");
      return this.destinationNode.stream;
    } catch (error) {
      log.error("Failed to set up noise cancellation pipeline:", error);
      this.cleanupNodes();
      return inputStream;
    }
  }

  /**
   * Fetch the RNNoise WASM binary and send it to the worklet for
   * synchronous compilation. Waits for the worklet to confirm readiness.
   */
  private async loadWasmIntoWorklet(
    workletNode: AudioWorkletNode,
  ): Promise<void> {
    const response = await fetch(rnnoiseWasmUrl);
    const wasmBinary = await response.arrayBuffer();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("RNNoise WASM initialization timed out"));
      }, 5000);

      workletNode.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { type: string; message?: string };
        if (data.type === "ready") {
          clearTimeout(timeout);
          resolve();
        } else if (data.type === "error") {
          clearTimeout(timeout);
          reject(new Error(data.message ?? "RNNoise WASM init failed"));
        }
      };

      workletNode.port.postMessage(
        { type: "init", wasmBinary },
        [wasmBinary],
      );
    });
  }

  toggle(enable: boolean): void {
    this._enabled = enable;
    this.workletNode?.port.postMessage({ type: "toggle", enabled: enable });
    log.info("Noise cancellation", enable ? "enabled" : "disabled");
  }

  private cleanupNodes(): void {
    try {
      this.sourceNode?.disconnect();
      this.workletNode?.disconnect();
    } catch {
      // Nodes may already be disconnected
    }
    this.sourceNode = null;
    this.workletNode = null;
    this.destinationNode = null;
    this._enabled = false;
  }

  destroy(): void {
    this.cleanupNodes();
    this.audioContext?.close().catch((error: unknown) => {
      log.warn("Error closing audio context:", error);
    });
    this.audioContext = null;
    this.initialized = false;
  }
}
