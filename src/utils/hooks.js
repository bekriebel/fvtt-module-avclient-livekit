import { MODULE_NAME } from "./constants.js";
import registerModuleSettings from "./registerModuleSettings.js";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  // Register module settings
  registerModuleSettings();
});

Hooks.on(`${MODULE_NAME}DebugSet`, (value) => {
  // Enable debug logging if debug setting is true
  CONFIG.debug.av = value;
  CONFIG.debug.avclient = value;
});
