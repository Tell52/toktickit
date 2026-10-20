// Cancelable so inline drafts can protect both shell links and Logout.
export function allowNavigation() {
  return window.dispatchEvent(new Event('toktickit:before-navigate', { cancelable: true }));
}
