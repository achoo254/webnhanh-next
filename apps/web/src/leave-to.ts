/**
 * Leaves the app for a server route or another site (the sign-in at `/auth/login`): a full page load, not the
 * router. One function so tests can see where the app would go.
 */
export function leaveTo(url: string): void {
  window.location.assign(url);
}
