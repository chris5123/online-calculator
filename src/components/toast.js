export function createToast(element) {
  let hideTimer;
  return {
    show(message, duration = 3500) {
      element.textContent = message;
      element.classList.add('is-visible');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => element.classList.remove('is-visible'), duration);
    },
  };
}

export function createLiveStatus(element) {
  return {
    set(message, tone = 'info') {
      element.textContent = message;
      element.dataset.tone = tone;
    },
  };
}
