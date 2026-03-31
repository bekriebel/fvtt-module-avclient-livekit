import LiveKitClient from "./LiveKitClient.js";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";

import { Logger } from "./utils/logger.js";

const log = new Logger("LiveKitBreakout");

export function getBreakoutRoom(userId: string): string | undefined {
  const breakoutRoomRegistry =
    game.settings?.get(MODULE_NAME, "breakoutRoomRegistry") ?? {};

  return breakoutRoomRegistry[userId];
}

export async function setBreakoutRoom(
  userId: string,
  breakoutRoom?: string,
): Promise<void> {
  const breakoutRoomRegistry =
    game.settings?.get(MODULE_NAME, "breakoutRoomRegistry") ?? {};
  breakoutRoomRegistry[userId] = breakoutRoom;
  await game.settings?.set(
    MODULE_NAME,
    "breakoutRoomRegistry",
    breakoutRoomRegistry,
  );
}

export function addContextOptions(
  contextOptions: foundry.applications.ux.ContextMenu.Entry<HTMLElement>[],
  liveKitClient: LiveKitClient,
): void {
  // Add breakout options to the player list context menus
  contextOptions.push(
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.startAVBreakout`) ??
        "Start AV Breakout",
      icon: '<i class="fa fa-comment"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          game.user?.isGM === true &&
          !getBreakoutRoom(userId) &&
          userId !== game.user.id
        );
      },
      callback: (players) => {
        const breakoutRoom = foundry.utils.randomID(32);
        if (!players.dataset.userId) {
          log.warn("No userId found in players dataset, cannot start breakout");
          return;
        }
        _startBreakout(players.dataset.userId, breakoutRoom);
        breakout(breakoutRoom, liveKitClient);
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.joinAVBreakout`) ?? "joinAVBreakout",
      icon: '<i class="fas fa-comment-dots"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        const breakoutRoom = getBreakoutRoom(userId);
        return (
          game.user?.isGM === true &&
          !!breakoutRoom &&
          liveKitClient.breakoutRoom !== breakoutRoom &&
          userId !== game.user.id
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        const breakoutRoom = getBreakoutRoom(userId);
        if (breakoutRoom) {
          breakout(breakoutRoom, liveKitClient);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.pullToAVBreakout`) ??
        "pullToAVBreakout",
      icon: '<i class="fas fa-comments"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          game.user?.isGM === true &&
          !!liveKitClient.breakoutRoom &&
          getBreakoutRoom(userId) !== liveKitClient.breakoutRoom &&
          userId !== game.user.id
        );
      },
      callback: (players) => {
        if (!players.dataset.userId) {
          log.warn("No userId found in players dataset, pull to breakout");
          return;
        }
        _startBreakout(players.dataset.userId, liveKitClient.breakoutRoom);
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.leaveAVBreakout`) ??
        "leaveAVBreakout",
      icon: '<i class="fas fa-comment-slash"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return userId === game.user?.id && !!liveKitClient.breakoutRoom;
      },
      callback: () => {
        breakout(undefined, liveKitClient);
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.removeFromAVBreakout`) ??
        "removeFromAVBreakout",
      icon: '<i class="fas fa-comment-slash"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          game.user?.isGM === true &&
          !!getBreakoutRoom(userId) &&
          userId !== game.user.id
        );
      },
      callback: (players) => {
        if (typeof players.dataset.userId === "string") {
          _endUserBreakout(players.dataset.userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.endAllAVBreakouts`) ??
        "endAllAVBreakouts",
      icon: '<i class="fas fa-ban"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return game.user?.isGM === true && userId === game.user.id;
      },
      callback: () => {
        _endAllBreakouts(liveKitClient);
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.muteUserLocal`) ??
        "Mute user (local)",
      icon: '<i class="fas fa-microphone-slash"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          !liveKitClient.locallyMutedUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalMute(userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.unmuteUserLocal`) ??
        "Unmute user (local)",
      icon: '<i class="fas fa-microphone"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          liveKitClient.locallyMutedUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalMute(userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.hideUserLocal`) ??
        "Hide video (local)",
      icon: '<i class="fas fa-video-slash"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          !liveKitClient.locallyHiddenUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalHide(userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.showUserLocal`) ??
        "Show video (local)",
      icon: '<i class="fas fa-video"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          liveKitClient.locallyHiddenUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalHide(userId);
        }
      },
    },
  );
}

export function breakout(
  breakoutRoom: string | undefined,
  liveKitClient: LiveKitClient,
): void {
  if (breakoutRoom === liveKitClient.breakoutRoom) {
    // Already in this room, skip
    return;
  }

  if (!breakoutRoom) {
    ui.notifications?.info(
      game.i18n?.localize(`${LANG_NAME}.leavingAVBreakout`) ??
        "leavingAVBreakout",
    );
  } else {
    ui.notifications?.info(
      game.i18n?.localize(`${LANG_NAME}.joiningAVBreakout`) ??
        "joiningAVBreakout",
    );
  }

  log.debug("Switching to breakout room:", breakoutRoom);
  liveKitClient.breakoutRoom = breakoutRoom;
  game.webrtc?.connect().catch(() => {
    log.error("Failed to connect to breakout room");
    liveKitClient.breakoutRoom = undefined;
    ui.notifications?.error(
      game.i18n.localize(`${LANG_NAME}.failedToJoinAVBreakout`),
    );
  });
}

function _startBreakout(
  userId: string,
  breakoutRoom: string | undefined,
): void {
  if (!game.user?.isGM) {
    log.warn("Only a GM can start a breakout conference room");
    return;
  }

  setBreakoutRoom(userId, breakoutRoom).catch((error: unknown) => {
    log.error("Error setting breakout room:", error);
  });

  game.socket.emit(
    `module.${MODULE_NAME}`,
    {
      action: "breakout",
      userId,
      breakoutRoom,
    },
    { recipients: [userId] },
  );
}

function _endUserBreakout(userId: string) {
  if (!game.user?.isGM) {
    log.warn("Only a GM can end a user's breakout conference");
    return;
  }

  setBreakoutRoom(userId, undefined).catch((error: unknown) => {
    log.error("Error clearing breakout room:", error);
  });
  game.socket.emit(
    `module.${MODULE_NAME}`,
    {
      action: "breakout",
      userId,
      breakoutRoom: undefined,
    },
    { recipients: [userId] },
  );
}

function _endAllBreakouts(liveKitClient: LiveKitClient): void {
  if (!game.user?.isGM) {
    log.warn("Only a GM can end all breakout conference rooms");
    return;
  }

  // Clear the breakout room registry
  // Note: breakoutRoomRegistry has scope "client", so this only clears the GM's local copy.
  // The socket broadcast below tells other clients to leave their breakout rooms,
  // which will trigger their own cleanup via the breakout() function.
  game.settings.set(MODULE_NAME, "breakoutRoomRegistry", {}).catch((error: unknown) => {
    log.error("Error clearing breakout room registry:", error);
  });

  game.socket.emit(`module.${MODULE_NAME}`, {
    action: "breakout",
    userId: undefined,
    breakoutRoom: undefined,
  });

  if (liveKitClient.breakoutRoom) {
    breakout(undefined, liveKitClient);
  }
}
