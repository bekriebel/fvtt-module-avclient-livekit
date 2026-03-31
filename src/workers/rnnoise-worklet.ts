/**
 * AudioWorklet processor for RNNoise-based noise cancellation.
 *
 * RNNoise operates on 480-sample frames at 48 kHz (10 ms).
 * The Web Audio API delivers 128 samples per process() call,
 * so we accumulate samples in a ring buffer and process in
 * 480-sample chunks.
 *
 * The WASM module binary is received from the main thread via
 * the message port, then compiled and instantiated synchronously
 * inside the worklet context.
 */

// ── AudioWorklet global declarations ─────────────────────────────────────────
// These types exist in the AudioWorklet scope but are not in the standard
// DOM lib typing, so we declare them here.

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

// ── Types for the RNNoise WASM exports ───────────────────────────────────────

interface RNNoiseExports {
  memory: WebAssembly.Memory;
  d: () => void; // __wasm_call_ctors
  e: (bytes: number) => number; // _malloc
  f: (ptr: number) => void; // _free
  g: () => void; // _rnnoise_init
  h: () => number; // _rnnoise_create
  i: (state: number) => void; // _rnnoise_destroy
  j: (state: number, inputPtr: number, outputPtr: number) => number; // _rnnoise_process_frame
}

// ── Constants ────────────────────────────────────────────────────────────────

/** RNNoise expects exactly 480 samples per frame (10 ms at 48 kHz). */
const RNNOISE_FRAME_SIZE = 480;

/** AudioWorklet delivers 128 samples per process() call. */
const RENDER_QUANTUM = 128;

// ── Processor ────────────────────────────────────────────────────────────────

class RNNoiseProcessor extends AudioWorkletProcessor {
  private enabled = false;
  private wasmExports: RNNoiseExports | null = null;
  private rnnoiseState = 0;
  private inputPtr = 0;
  private outputPtr = 0;

  /** Ring buffer to accumulate samples until we have a full RNNoise frame. */
  private inputBuffer: Float32Array = new Float32Array(RNNOISE_FRAME_SIZE);

  /** Buffer for processed output waiting to be consumed. */
  private outputBuffer: Float32Array = new Float32Array(RNNOISE_FRAME_SIZE);

  /** Write position in the input ring buffer. */
  private inputBufferPos = 0;

  /** Read position in the output ring buffer. */
  private outputBufferPos = 0;

  /** How many unread processed samples remain in the output buffer. */
  private outputSamplesAvailable = 0;

  constructor() {
    super();

    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type: string;
        enabled?: boolean;
        wasmBinary?: ArrayBuffer;
      };

      switch (data.type) {
        case "toggle":
          this.enabled = data.enabled ?? false;
          break;

        case "init":
          if (data.wasmBinary) {
            this.initRNNoise(data.wasmBinary);
          }
          break;
      }
    };
  }

  /**
   * Synchronously instantiate the RNNoise WASM module from a binary buffer
   * and allocate the input/output frame memory.
   */
  private initRNNoise(wasmBinary: ArrayBuffer): void {
    try {
      const wasmModule = new WebAssembly.Module(wasmBinary);

      const memory = new WebAssembly.Memory({
        initial: 256,
        maximum: 256,
      });

      const importObject: WebAssembly.Imports = {
        env: {
          memory,
          emscripten_resize_heap: () => 0,
        },
        wasi_snapshot_preview1: {
          fd_close: () => 0,
          fd_seek: () => 0,
          fd_write: () => 0,
        },
      };

      const instance = new WebAssembly.Instance(wasmModule, importObject);
      const exports = instance.exports as unknown as RNNoiseExports;

      this.wasmExports = exports;

      // Call constructors, init RNNoise, and create a denoiser state
      exports.d();
      exports.g();
      this.rnnoiseState = exports.h();

      // Allocate input and output buffers in WASM memory (float32 = 4 bytes)
      this.inputPtr = exports.e(RNNOISE_FRAME_SIZE * 4);
      this.outputPtr = exports.e(RNNOISE_FRAME_SIZE * 4);

      this.port.postMessage({ type: "ready" });
    } catch (error) {
      this.port.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean {
    const input = inputs[0]?.[0] as Float32Array | undefined;
    const output = outputs[0]?.[0] as Float32Array | undefined;

    if (!input || !output) {
      return true;
    }

    // If disabled or not initialized, pass through
    if (!this.enabled || !this.wasmExports || !this.rnnoiseState) {
      output.set(input);
      return true;
    }

    // Feed input samples into the ring buffer and pull processed samples out
    let inputOffset = 0;
    let outputOffset = 0;

    while (inputOffset < RENDER_QUANTUM) {
      // If we have processed samples available, copy them to output
      if (this.outputSamplesAvailable > 0) {
        const toCopy = Math.min(
          this.outputSamplesAvailable,
          RENDER_QUANTUM - outputOffset,
        );
        output.set(
          this.outputBuffer.subarray(
            this.outputBufferPos,
            this.outputBufferPos + toCopy,
          ),
          outputOffset,
        );
        this.outputBufferPos += toCopy;
        this.outputSamplesAvailable -= toCopy;
        outputOffset += toCopy;
      }

      // Accumulate input samples
      const remainingInput = RENDER_QUANTUM - inputOffset;
      const spaceInBuffer = RNNOISE_FRAME_SIZE - this.inputBufferPos;
      const toBuffer = Math.min(remainingInput, spaceInBuffer);

      this.inputBuffer.set(
        input.subarray(inputOffset, inputOffset + toBuffer),
        this.inputBufferPos,
      );
      this.inputBufferPos += toBuffer;
      inputOffset += toBuffer;

      // When we have a full frame, process it through RNNoise
      if (this.inputBufferPos >= RNNOISE_FRAME_SIZE) {
        this.processFrame();
        this.inputBufferPos = 0;
      }
    }

    // Fill any remaining output with processed samples
    while (outputOffset < RENDER_QUANTUM && this.outputSamplesAvailable > 0) {
      const toCopy = Math.min(
        this.outputSamplesAvailable,
        RENDER_QUANTUM - outputOffset,
      );
      output.set(
        this.outputBuffer.subarray(
          this.outputBufferPos,
          this.outputBufferPos + toCopy,
        ),
        outputOffset,
      );
      this.outputBufferPos += toCopy;
      this.outputSamplesAvailable -= toCopy;
      outputOffset += toCopy;
    }

    return true;
  }

  /**
   * Process one 480-sample frame through RNNoise.
   * RNNoise expects input scaled to [-32768, 32767] (int16 range)
   * and returns output in the same range.
   */
  private processFrame(): void {
    if (!this.wasmExports) return;

    const exports = this.wasmExports;
    const heapF32 = new Float32Array(exports.memory.buffer);
    const inputIndex = this.inputPtr >> 2; // byte offset to float32 index
    const outputIndex = this.outputPtr >> 2;

    // Copy input buffer to WASM memory, scaling to int16 range
    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      heapF32[inputIndex + i] = this.inputBuffer[i] * 32768;
    }

    // Process through RNNoise
    exports.j(this.rnnoiseState, this.inputPtr, this.outputPtr);

    // Copy output from WASM memory, scaling back to [-1, 1]
    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      this.outputBuffer[i] = heapF32[outputIndex + i] / 32768;
    }

    this.outputBufferPos = 0;
    this.outputSamplesAvailable = RNNOISE_FRAME_SIZE;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
