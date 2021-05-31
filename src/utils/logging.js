import { LOG_PREFIX, MODULE_NAME } from "./constants.js";

/* -------------------------------------------- */
/*  Logging Methods                             */
/* -------------------------------------------- */

/**
 * Display debug messages on the console if debugging is enabled
 * Enabled by default and configured when game settings are available
 * @param {...*} args      Arguments to console.debug
 */
// eslint-disable-next-line import/no-mutable-exports
export let debug = console.debug.bind(console, LOG_PREFIX);

/**
 * Display info messages on the console if debugging is enabled
 * Enabled by default and configured when game settings are available
 * @param {...*} args      Arguments to console.info
 */
// eslint-disable-next-line import/no-mutable-exports
export let info = console.info.bind(console, LOG_PREFIX);

/**
 * Display warning messages on the console
 * @param {...*} args      Arguments to console.warn
 */

export const warn = console.warn.bind(console, LOG_PREFIX);

// export function warn(...args) {
//   console.warn(LOG_PREFIX, ...args);
// }

/**
 * Display error messages on the console
 * @param {...*} args      Arguments to console.error
 */
export const error = console.error.bind(console, LOG_PREFIX);

// Enable debug & info logs if debugging is enabled
export function setDebug(value) {
  if (value) {
    debug = console.debug.bind(console, LOG_PREFIX);
    info = console.info.bind(console, LOG_PREFIX);
  } else {
    debug = () => {};
    info = () => {};
  }

  Hooks.callAll(`${MODULE_NAME}DebugSet`, value);
}
