# Third-Party Notices

This module bundles the following third-party open-source components for the
client-side enhanced noise cancellation feature. Each is used under a permissive
license; their copyright and license notices are reproduced below.

## @sapphi-red/web-noise-suppressor

- License: MIT
- Copyright (c) 2022 翠 / green
- https://github.com/sapphi-red/web-noise-suppressor

Provides the Web Audio `AudioWorklet` nodes and WebAssembly builds used to run
the noise suppression models in the browser. It bundles the following models:

### RNNoise

- License: BSD-3-Clause
- Copyright (c) 2017, Mozilla; Copyright (c) 2007-2017, Jean-Marc Valin et al.
- https://github.com/xiph/rnnoise (WASM build via https://github.com/shiguredo/rnnoise-wasm)

### Speex (SpeexDSP preprocess)

- License: BSD-3-Clause
- Copyright 2002-2008 Xiph.org Foundation, Jean-Marc Valin et al.
- https://github.com/xiph/speexdsp (WASM build via https://github.com/sapphi-red/speex-preprocess-wasm)

### GTCRN

- License: MIT
- Copyright (c) Xiaobin Rong
- https://github.com/Xiaobin-Rong/gtcrn (WASM build via https://github.com/sapphi-red/gtcrn-wasm)
- The GTCRN WASM build embeds the `pffft` FFT library (FFTPACK / UCAR
  BSD-style license); its notice is included in the bundled worklet assets.

The vendored assets are served locally from this module under
`public/rnnoise/`, `public/speex/`, and `public/gtcrn/`; nothing is fetched from
a third-party CDN at runtime.
