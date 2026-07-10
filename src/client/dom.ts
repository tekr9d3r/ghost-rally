import { MAX_NAME_LEN } from '../shared/track';
import { gameRef } from './game';

/**
 * Phaser captures game keys (WASD, arrows, space) globally and preventDefaults
 * them, which swallows those characters in text inputs. Suspend the keyboard
 * while a DOM modal has focus.
 */
const setGameKeyboard = (enabled: boolean): void => {
  const kb = gameRef?.input?.keyboard;
  if (kb) kb.enabled = enabled;
};

/**
 * Publish dialog rendered in DOM (crisp text input on mobile).
 * Elements live in game.html.
 */
export const showPublishModal = (initialName: string, recordLabel: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const modal = document.getElementById('publish-modal') as HTMLDivElement | null;
    const input = document.getElementById('publish-name') as HTMLInputElement | null;
    const sub = document.getElementById('publish-sub') as HTMLParagraphElement | null;
    const okBtn = document.getElementById('publish-ok') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('publish-cancel') as HTMLButtonElement | null;
    if (!modal || !input || !okBtn || !cancelBtn) {
      resolve(initialName || 'My Track');
      return;
    }
    modal.classList.add('open');
    setGameKeyboard(false);
    input.value = initialName;
    input.maxLength = MAX_NAME_LEN;
    if (sub) sub.textContent = recordLabel;
    input.focus();

    const cleanup = (): void => {
      modal.classList.remove('open');
      setGameKeyboard(true);
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
    };
    okBtn.onclick = () => {
      const v = input.value.trim();
      if (v.length < 3) {
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 600);
        return;
      }
      cleanup();
      resolve(v);
    };
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') okBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    };
  });
};

/** Fullscreen busy overlay while the post is being created. */
export const setBusy = (on: boolean, label = 'Publishing your track…'): void => {
  const el = document.getElementById('busy') as HTMLDivElement | null;
  if (!el) return;
  el.textContent = label;
  el.classList.toggle('open', on);
};
