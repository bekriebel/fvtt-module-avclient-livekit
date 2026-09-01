/*!
* GTCRN
*
* MIT License
* 
* Copyright (c) 2024 Rong Xiaobin
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/
/*!
* pffft
*
* Copyright (c) 2020  Dario Mambro ( dario.mambro@gmail.com )
* Copyright (c) 2019  Hayati Ayguen ( h_ayguen@web.de )
* Copyright (c) 2013  Julien Pommier ( pommier@modartt.com )
* 
* Copyright (c) 2004 the University Corporation for Atmospheric
* Research ("UCAR"). All rights reserved. Developed by NCAR's
* Computational and Information Systems Laboratory, UCAR,
* www.cisl.ucar.edu.
* 
* Redistribution and use of the Software in source and binary forms,
* with or without modification, is permitted provided that the
* following conditions are met:
* 
* - Neither the names of NCAR's Computational and Information Systems
* Laboratory, the University Corporation for Atmospheric Research,
* nor the names of its sponsors or contributors may be used to
* endorse or promote products derived from this Software without
* specific prior written permission.  
* 
* - Redistributions of source code must retain the above copyright
* notices, this list of conditions, and the disclaimer below.
* 
* - Redistributions in binary form must reproduce the above copyright
* notice, this list of conditions, and the disclaimer below in the
* documentation and/or other materials provided with the
* distribution.
* 
* THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO THE WARRANTIES OF
* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
* NONINFRINGEMENT. IN NO EVENT SHALL THE CONTRIBUTORS OR COPYRIGHT
* HOLDERS BE LIABLE FOR ANY CLAIM, INDIRECT, INCIDENTAL, SPECIAL,
* EXEMPLARY, OR CONSEQUENTIAL DAMAGES OR OTHER LIABILITY, WHETHER IN AN
* ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
* CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS WITH THE
* SOFTWARE.
*/
const e=Float32Array.BYTES_PER_ELEMENT,t=16e3,n=48e3;var r=class{constructor(t,n={}){if(this.module=t,this.sampleRate=n.sampleRate??16e3,this.sampleRate!==16e3&&this.sampleRate!==48e3)throw Error(`Unsupported sample rate: ${String(this.sampleRate)}.`);if(this.frameSize=this.sampleRate===48e3?768:256,this.processNative=this.sampleRate===48e3?t._gtcrn_process_48k:t._gtcrn_process,this.state=t._gtcrn_create(),!this.state)throw Error(`Failed to create GTCRN state.`);if(this.inPtr=t._malloc(this.frameSize*e),this.outPtr=t._malloc(this.frameSize*e),!this.inPtr||!this.outPtr)throw this.destroy(),Error(`Failed to allocate frame buffers.`)}process(t){if(!this.state)throw Error(`GtcrnProcessor is destroyed.`);if(t.length!==this.frameSize)throw Error(`frame must have exactly ${this.frameSize} samples at ${this.sampleRate} Hz.`);return this.module.HEAPF32.set(t,this.inPtr/e),this.processNative(this.state,this.inPtr,this.outPtr),this.module.HEAPF32.slice(this.outPtr/e,this.outPtr/e+this.frameSize)}destroy(){this.inPtr&&this.module._free(this.inPtr),this.outPtr&&this.module._free(this.outPtr),this.state&&this.module._gtcrn_destroy(this.state),this.inPtr=this.outPtr=this.state=0}},i=(async function(e={}){var t,n=e,r=!0,i=typeof WorkerGlobalScope<`u`;typeof process==`object`&&process.versions?.node&&process.type;var a=import.meta.url,o=``;function s(e){return o+e}var c,l;if(r||i){try{o=new URL(`.`,a).href}catch{}i&&(l=e=>{var t=new XMLHttpRequest;return t.open(`GET`,e,!1),t.responseType=`arraybuffer`,t.send(null),new Uint8Array(t.response)}),c=async e=>{var t=await fetch(e,{credentials:`same-origin`});if(t.ok)return t.arrayBuffer();throw Error(t.status+` : `+t.url)}}console.log.bind(console);var u=console.error.bind(console),d,f=!1,p,m,h,g,_=!1;function v(){var e=h.buffer;new Int8Array(e),new Int16Array(e),g=new Uint8Array(e),new Uint16Array(e),new Int32Array(e),new Uint32Array(e),n.HEAPF32=new Float32Array(e),new Float64Array(e),new BigInt64Array(e),new BigUint64Array(e)}function y(){_=!0,U.d()}var b=0,x=null;function S(e){b++}function C(e){if(b--,b==0&&x){var t=x;x=null,t()}}function w(e){e=`Aborted(`+e+`)`,u(e),f=!0,e+=`. Build with -sASSERTIONS for more info.`;var t=new WebAssembly.RuntimeError(e);throw m?.(t),t}var T;function E(){return n.locateFile?s(`gtcrn.wasm`):new URL(`gtcrn.wasm`,import.meta.url).href}function D(e){if(e==T&&d)return new Uint8Array(d);if(l)return l(e);throw`both async and sync fetching of the wasm failed`}async function O(e){if(!d)try{var t=await c(e);return new Uint8Array(t)}catch{}return D(e)}async function k(e,t){try{var n=await O(e);return await WebAssembly.instantiate(n,t)}catch(e){u(`failed to asynchronously prepare wasm: ${e}`),w(e)}}async function A(e,t,n){if(!e&&typeof WebAssembly.instantiateStreaming==`function`)try{var r=fetch(t,{credentials:`same-origin`});return await WebAssembly.instantiateStreaming(r,n)}catch(e){u(`wasm streaming compile failed: ${e}`),u(`falling back to ArrayBuffer instantiation`)}return k(t,n)}function j(){return{a:H}}async function M(){function e(e,t){return U=e.exports,h=U.c,v(),V(U),C(`wasm-instantiate`),U}S(`wasm-instantiate`);function t(t){return e(t.instance)}var n=j();return T??(T=E()),t(await A(d,T,n))}var N=typeof TextDecoder<`u`?new TextDecoder:void 0,P=(e,t=0,n=NaN)=>{for(var r=t+n,i=t;e[i]&&!(i>=r);)++i;if(i-t>16&&e.buffer&&N)return N.decode(e.subarray(t,i));for(var a=``;t<i;){var o=e[t++];if(!(o&128)){a+=String.fromCharCode(o);continue}var s=e[t++]&63;if((o&224)==192){a+=String.fromCharCode((o&31)<<6|s);continue}var c=e[t++]&63;if(o=(o&240)==224?(o&15)<<12|s<<6|c:(o&7)<<18|s<<12|c<<6|e[t++]&63,o<65536)a+=String.fromCharCode(o);else{var l=o-65536;a+=String.fromCharCode(55296|l>>10,56320|l&1023)}}return a},F=(e,t)=>e?P(g,e,t):``,I=(e,t,n,r)=>w(`Assertion failed: ${F(e)}, at: `+[t?F(t):`unknown filename`,n,r?F(r):`unknown function`]),L=()=>2147483648,R=(e,t)=>Math.ceil(e/t)*t,z=e=>{var t=(e-h.buffer.byteLength+65535)/65536|0;try{return h.grow(t),v(),1}catch{}},B=e=>{var t=g.length;e>>>=0;var n=L();if(e>n)return!1;for(var r=1;r<=4;r*=2){var i=t*(1+.2/r);if(i=Math.min(i,e+100663296),z(Math.min(n,R(Math.max(e,i),65536))))return!0}return!1};n.wasmBinary&&(d=n.wasmBinary);function V(e){n._gtcrn_create=e.e,n._free=e.f,n._gtcrn_destroy=e.g,n._gtcrn_model_run=e.h,n._gtcrn_process=e.i,n._gtcrn_process_48k=e.j,n._malloc=e.k}var H={a:I,b:B},U=await M();function W(){if(b>0){x=W;return}if(b>0){x=W;return}function e(){n.calledRun=!0,!f&&(y(),p?.(n))}e()}return W(),t=_?n:new Promise((e,t)=>{p=e,m=t}),t});const a=(e,i,a)=>{let o=new r(e,{sampleRate:i===48e3?n:t}),s=o.frameSize,c=s/a;if(s%a!==0)throw Error(`GTCRN frame size must be divisible by bufferSize. (was ${s}/${a}).`);let l=new Float32Array(s),u=new Float32Array(s),d=0,f=c-1;return{process:(e,t)=>{if(l.set(e,d*a),d===c-1)u.set(o.process(l)),t.set(u.subarray(0,a)),f=1%c;else{let e=f*a;t.set(u.subarray(e,e+a)),f=(f+1)%c}d=(d+1)%c},destroy:()=>{o.destroy()}}},o=(e,{bufferSize:r,maxChannels:i,sampleRate:o})=>{if(r!==128)throw Error(`bufferSize must be 128. (was ${r}).`);if(o!==16e3&&o!==48e3)throw Error(`GTCRN supports only ${t}Hz and ${n}Hz. (was ${o}Hz).`);let s=Array.from({length:i},()=>a(e,o,r));return{process:(e,t)=>{let n=Math.min(e.length,i);for(let r=0;r<n;r++)s[r].process(e[r],t[r])},destroy:()=>{for(let e of s)e.destroy()}}};var s=class extends AudioWorkletProcessor{constructor(e){super(),this.destroyed=!1,this.port.addEventListener(`message`,e=>{e.data===`destroy`&&this.destroy()}),(async()=>{let t=await i({locateFile:e=>e,wasmBinary:e.processorOptions.wasmBinary});this.processor=o(t,{bufferSize:128,maxChannels:e.processorOptions.maxChannels,sampleRate}),this.destroyed&&this.destroy()})()}process(e,t,n){return e.length===0||!e[0]||e[0]?.length===0||!this.processor||this.processor.process(e[0],t[0]),!0}destroy(){this.destroyed=!0,this.processor?.destroy(),this.processor=void 0}};registerProcessor(`@sapphi-red/web-noise-suppressor/gtcrn`,s);
//# sourceMappingURL=workletProcessor.js.map