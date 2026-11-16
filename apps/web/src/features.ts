/**
 * Switches of the app, set when the web app is built.
 *
 * `TRY_FIRST`: a visitor without an account opens a template in the editor, edits it in the browser and signs up only
 * when they press Publish (the landing's main button is "Chọn mẫu miễn phí", the template picker has no address
 * field). Build with `VITE_TRY_FIRST=0` to go back to signing up before the editor.
 */
export const TRY_FIRST: boolean = import.meta.env.VITE_TRY_FIRST !== '0';
