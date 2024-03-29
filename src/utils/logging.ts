import { LOG_PREFIX, MODULE_NAME } from "./constants";

/* -------------------------------------------- */
/*  Logging Methods                             */
/* -------------------------------------------- */

/**
 * Display debug messages on the console if debugging is enabled
 * Enabled by default and configured when game settings are available
 * @param {...*} args      Arguments to console.debug
 */
export let debug: (...args: unknown[]) => void = console.debug.bind(
  console,
  LOG_PREFIX
);

/**
 * Display info messages on the console if debugging is enabled
 * Enabled by default and configured when game settings are available
 * @param {...*} args      Arguments to console.info
 */
export let info: (...args: unknown[]) => void = console.info.bind(
  console,
  LOG_PREFIX
);

/**
 * Display warning messages on the console
 * @param {...*} args      Arguments to console.warn
 */

export const warn: (...args: unknown[]) => void = console.warn.bind(
  console,
  LOG_PREFIX
);

/**
 * Display error messages on the console
 * @param {...*} args      Arguments to console.error
 */
export const error: (...args: unknown[]) => void = console.error.bind(
  console,
  LOG_PREFIX
);

// Enable debug & info logs if debugging is enabled
export function setDebug(value: boolean): void {
  if (value) {
    debug = console.debug.bind(console, LOG_PREFIX);
    info = console.info.bind(console, LOG_PREFIX);
  } else {
    debug = () => {
      return;
    };
    info = () => {
      return;
    };
  }

  Hooks.callAll(`${MODULE_NAME}DebugSet`, value);
}
