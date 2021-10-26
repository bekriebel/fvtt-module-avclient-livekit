import LiveKitClient from "./LiveKitClient";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";
import { getGame } from "./utils/helpers";

import * as log from "./utils/logging";

export function addContextOptions(
  contextOptions: ContextMenuEntry[],
  liveKitClient: LiveKitClient
): void {
  // Add breakout options to the playerlist context menus
  contextOptions.push(
    {
      name: getGame().i18n.localize(`${LANG_NAME}.startAVBreakout`),
      icon: '<i class="fa fa-comment"></i>',
      condition: (players) => {
        const userId: string = players[0].dataset.userId || "";
        const liveKitBreakoutRoom = liveKitClient.settings.get(
          "client",
          `users.${userId}.liveKitBreakoutRoom`
        );
        return (
          getGame().user?.isGM === true &&
          !liveKitBreakoutRoom &&
          userId !== getGame().user?.id &&
          !liveKitClient.isUserExternal(userId)
        );
      },
      callback: (players) => {
        const breakoutRoom = randomID(32);
        startBreakout(players.data("user-id"), breakoutRoom, liveKitClient);
        breakout(breakoutRoom, liveKitClient);
      },
    },
    {
      name: getGame().i18n.localize(`${LANG_NAME}.joinAVBreakout`),
      icon: '<i class="fas fa-comment-dots"></i>',
      condition: (players) => {
        const userId: string = players[0].dataset.userId || "";
        const liveKitBreakoutRoom = liveKitClient.settings.get(
          "client",
          `users.${userId}.liveKitBreakoutRoom`
        );
        return (
          getGame().user?.isGM === true &&
          !!liveKitBreakoutRoom &&
          liveKitClient.breakoutRoom !== liveKitBreakoutRoom &&
          userId !== getGame().user?.id
        );
      },
      callback: (players) => {
        const userId: string = players[0].dataset.userId || "";
        const liveKitBreakoutRoom = liveKitClient.settings.get(
          "client",
          `users.${userId}.liveKitBreakoutRoom`
        );
        if (typeof liveKitBreakoutRoom === "string") {
          breakout(liveKitBreakoutRoom, liveKitClient);
        }
      },
    },
    {
      name: getGame().i18n.localize(`${LANG_NAME}.pullToAVBreakout`),
      icon: '<i class="fas fa-comments"></i>',
      condition: (players) => {
        const userId: string = players[0].dataset.userId || "";
        const liveKitBreakoutRoom = liveKitClient.settings.get(
          "client",
          `users.${userId}.liveKitBreakoutRoom`
        );
        return (
          getGame().user?.isGM === true &&
          !!liveKitClient.breakoutRoom &&
          liveKitBreakoutRoom !== liveKitClient.breakoutRoom &&
          userId !== getGame().user?.id &&
          !liveKitClient.isUserExternal(userId)
        );
      },
      callback: (players) => {
        startBreakout(
          players.data("user-id"),
          liveKitClient.breakoutRoom,
          liveKitClient
        );
      },
    },
    {
      name: getGame().i18n.localize(`${LANG_NAME}.leaveAVBreakout`),
      icon: '<i class="fas fa-comment-slash"></i>',
      condition: (players) => {
        const userId: string = players[0].dataset.userId || "";
        return userId === getGame().user?.id && !!liveKitClient.breakoutRoom;
      },
      callback: () => {
        breakout(null, liveKitClient);
      },
    },
    {
      name: getGame().i18n.localize(`${LANG_NAME}.removeFromAVBreakout`),
      icon: '<i class="fas fa-comment-slash"></i>',
      condition: (players) => {
        const userId: string = players[0].dataset.userId || "";
        const liveKitBreakoutRoom = liveKitClient.settings.get(
          "client",
          `users.${userId}.liveKitBreakoutRoom`
        );
        return (
          getGame().user?.isGM === true &&
          !!liveKitBreakoutRoom &&
          userId !== getGame().user?.id
        );
      },
      callback: (players) => {
        if (typeof players[0].dataset.userId === "string") {
          endUserBreakout(players[0].dataset.userId, liveKitClient);
        }
      },
    },
    {
      name: getGame().i18n.localize(`${LANG_NAME}.endAllAVBreakouts`),
      icon: '<i class="fas fa-ban"></i>',
      condition: (players) => {
        const userId: string = players[0].dataset.userId || "";
        return getGame().user?.isGM === true && userId === getGame().user?.id;
      },
      callback: () => {
        endAllBreakouts(liveKitClient);
      },
    }
  );
}

export function breakout(
  breakoutRoom: string | null,
  liveKitClient: LiveKitClient
): void {
  if (breakoutRoom === liveKitClient.breakoutRoom) {
    // Already in this room, skip
    return;
  }

  if (!breakoutRoom) {
    ui.notifications?.info(
      `${getGame().i18n.localize(`${LANG_NAME}.leavingAVBreakout`)}`
    );
  } else {
    ui.notifications?.info(
      `${getGame().i18n.localize(`${LANG_NAME}.joiningAVBreakout`)}`
    );
  }

  log.debug("Switching to breakout room:", breakoutRoom);
  // log.info("Switching to breakout room:", breakoutRoom);
  // log.warn("Switching to breakout room:", breakoutRoom);
  liveKitClient.breakoutRoom = breakoutRoom;
  getGame().webrtc?.connect();
}

function startBreakout(
  userId: string,
  breakoutRoom: string | null,
  liveKitClient: LiveKitClient
): void {
  if (!getGame().user?.isGM) {
    log.warn("Only a GM can start a breakout conference room");
    return;
  }

  liveKitClient.settings.set(
    "client",
    `users.${userId}.liveKitBreakoutRoom`,
    breakoutRoom
  );
  getGame().socket?.emit(
    `module.${MODULE_NAME}`,
    {
      action: "breakout",
      userId,
      breakoutRoom,
    },
    { recipients: [userId] }
  );
}

function endUserBreakout(userId: string, liveKitClient: LiveKitClient) {
  if (!getGame().user?.isGM) {
    log.warn("Only a GM can end a user's breakout conference");
    return;
  }

  liveKitClient.settings.set(
    "client",
    `users.${userId}.liveKitBreakoutRoom`,
    ""
  );
  getGame().socket?.emit(
    `module.${MODULE_NAME}`,
    {
      action: "breakout",
      userId,
      breakoutRoom: null,
    },
    { recipients: [userId] }
  );
}

function endAllBreakouts(liveKitClient: LiveKitClient): void {
  if (!getGame().user?.isGM) {
    log.warn("Only a GM can end all breakout conference rooms");
    return;
  }

  getGame().socket?.emit(`module.${MODULE_NAME}`, {
    action: "breakout",
    userId: null,
    breakoutRoom: null,
  });

  if (liveKitClient.breakoutRoom) {
    breakout(null, liveKitClient);
  }
}
