import { SignJWT } from "jose";
import { Logger } from "./logger";
import { MODULE_NAME, TAVERN_AUTH_SERVER } from "./constants";

const log = new Logger();

export interface ValidatedUser {
  id: string | null;
  app_id: string | null;
  full_name: string | null;
  thumb_url: string | null;
  vanity: string | null;
  active_membership: boolean;
  active_tier: string | null;
  client_roles: string[];
  last_updated: string;
}

export interface TavernApiErrorResponse {
  error_id: string;
  status_code: number;
  error: string;
}

/**
 * Creates a new AccessToken and returns it as a signed JWT
 * @param apiKey API Key
 * @param apiSecret Secret
 * @param roomName The LiveKit room to join
 * @param userName Display name of the FVTT user
 * @param metadata User metadata, including the FVTT User ID
 */
export async function getAccessToken(
  apiKey: string | undefined,
  secretKey: string | undefined,
  roomName: string,
  userName: string,
  metadata: string,
): Promise<string> {
  // Set the payload to be signed, including the permission to join the room and the user metadata
  const tokenPayload = {
    video: {
      // LiveKit permission grants
      roomJoin: true,
      room: roomName,
    },
    metadata: metadata,
  };

  // Get the epoch timestamp for 15m before now for JWT not before value
  const notBefore = Math.floor(
    new Date(Date.now() - 1000 * (60 * 15)).getTime() / 1000,
  );

  // If the API Key or Secret is not set, log an error and return an empty string
  if (!apiKey || !secretKey) {
    log.error(
      "API Key or Secret is not set. Please configure the LiveKit API Key and Secret",
    );
    return "";
  }

  // Sign and return the JWT
  const accessTokenJwt = await new SignJWT(tokenPayload)
    .setIssuer(apiKey) // The configured API Key
    .setExpirationTime("10h") // Expire after 10 hours
    .setJti(userName) // Use the username for the JWT ID
    .setSubject(userName) // Use the username for the JWT Subject
    .setNotBefore(notBefore) // Give us a 15 minute buffer in case the user's clock is set incorrectly
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secretKey));

  log.debug("AccessToken:", accessTokenJwt);
  return accessTokenJwt;
}

/**
 * Gets an access token from the Tavern authentication server
 * @param _apiKey API Key (unused)
 * @param _secretKey Secret (unused)
 * @param roomName The LiveKit room to join
 * @param userName Display name of the FVTT user
 * @param metadata User metadata, including the FVTT User ID
 */
export async function getTavernAccessToken(
  _apiKey: string | undefined,
  _secretKey: string | undefined,
  roomName: string,
  userName: string,
  metadata: string,
): Promise<string> {
  const authServer =
    game.settings?.get(MODULE_NAME, "authServer") ?? TAVERN_AUTH_SERVER;
  const token = game.settings?.get(MODULE_NAME, "tavernPatreonToken");
  if (!token) return "";
  let response;
  try {
    response = await fetch(`${authServer}/livekit/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: token,
        room: roomName,
        userName: userName,
        metadata: metadata,
      }),
    });
  } catch (e) {
    log.error("Error validating Patreon account", e);
    return "";
  }
  if (!response.ok) {
    log.error("Error validating Patreon account", await response.json());
    return "";
  }
  let responseText;
  try {
    responseText = await response.text();
  } catch (e) {
    log.warn("Error parsing response", e);
    return "";
  }
  return responseText;
}

export async function getAuthUserInfo(
  authServer: string,
  token: string,
): Promise<ValidatedUser | TavernApiErrorResponse> {
  let response;
  try {
    response = await fetch(`${authServer}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: token }),
    });
  } catch (e) {
    log.error("Error validating authentication account", e);
    let message = "Error validating authentication account";
    if (e instanceof Error) {
      message = e.message;
    }
    const error_response: TavernApiErrorResponse = {
      error_id: "",
      status_code: 500,
      error: message,
    };
    return error_response;
  }

  let responseJson;
  try {
    responseJson = (await response.json()) as
      | ValidatedUser
      | TavernApiErrorResponse;
  } catch (e) {
    log.error("Error parsing authentication response", e);
    let message = "Error parsing authentication response";
    if (e instanceof Error) {
      message = e.message;
    }
    const error_response: TavernApiErrorResponse = {
      error_id: "",
      status_code: 500,
      error: message,
    };
    return error_response;
  }

  if (!response.ok) {
    log.error("Error validating authentication account", responseJson);
  }

  return responseJson;
}
