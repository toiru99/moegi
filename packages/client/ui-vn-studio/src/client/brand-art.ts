/** Shared vector geometry for the app mark and installed-app icons. */
export const STUDIO_FRAME = 'M6 5.5h15l5 5v16H6z M21 5.5v6h5 M6 22h20'
/** Playback triangle inside the authored scene frame. */
export const STUDIO_PLAY = 'M12 11.5v7l6-3.5z'
/** Opaque browser-tab artwork readable on both light and dark browser chrome. */
export const STUDIO_TAB_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#152e3f"/><g fill="none" stroke="#f5f8fb" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${STUDIO_FRAME}"/></g><path d="${STUDIO_PLAY}" fill="#f5f8fb"/></svg>`
