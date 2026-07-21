// Where the assistant conversation is kept between page loads. It lives only in
// the browser (localStorage) and is wiped on "Forget" or on logout.
export const CHAT_STORAGE_KEY = "cf.chat.v1";

export function clearStoredChat() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
