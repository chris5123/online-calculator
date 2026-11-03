export function registerServiceWorker() {
  if (window.location.protocol !== 'https:' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => {
      console.warn('Service worker registration failed.', error);
    });
  });
}
