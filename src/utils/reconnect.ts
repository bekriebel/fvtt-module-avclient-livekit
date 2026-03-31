import { Logger } from "./logger";
import { LANG_NAME } from "./constants";

const log = new Logger("ReconnectManager");

export class ReconnectManager {
  private attempts = 0;
  private readonly maxAttempts = 5;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;

  async attemptReconnect(
    connectFn: () => Promise<boolean>,
  ): Promise<boolean> {
    if (this.cancelled) {
      return false;
    }

    if (this.attempts >= this.maxAttempts) {
      log.error("Max reconnect attempts reached");
      ui.notifications?.error(
        game.i18n?.localize(`${LANG_NAME}.reconnectFailed`) ??
          "Reconnection failed after maximum attempts",
      );
      this.reset();
      return false;
    }

    const jitter = Math.random() * 1000;
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.attempts) + jitter,
      this.maxDelay,
    );

    this.attempts++;
    log.info(
      `Reconnect attempt ${String(this.attempts)}/${String(this.maxAttempts)} in ${String(Math.round(delay))}ms`,
    );

    ui.notifications?.warn(
      `${game.i18n?.localize(`${LANG_NAME}.reconnecting`) ?? "Reconnecting"}... (${String(this.attempts)}/${String(this.maxAttempts)})`,
    );

    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        if (this.cancelled) {
          resolve(false);
          return;
        }

        connectFn()
          .then((success) => {
            if (success) {
              this.reset();
              ui.notifications?.info(
                game.i18n?.localize(`${LANG_NAME}.reconnected`) ??
                  "Reconnected successfully",
              );
              resolve(true);
            } else {
              this.attemptReconnect(connectFn)
                .then(resolve)
                .catch(() => { resolve(false); });
            }
          })
          .catch(() => {
            this.attemptReconnect(connectFn)
              .then(resolve)
              .catch(() => { resolve(false); });
          });
      }, delay);
    });
  }

  reset(): void {
    this.attempts = 0;
    this.cancelled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.reset();
  }
}
