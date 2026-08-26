import { ImogenClient } from '@imogen/sdk'

/**
 * The web app talks to the server through the published SDK rather than through its own
 * fetch calls. If the SDK cannot express something this app needs, the SDK is wrong —
 * and every third-party client would hit the same wall.
 *
 * No token: the browser already holds an HttpOnly session cookie.
 */
export const imogen = new ImogenClient({ baseUrl: window.location.origin })
