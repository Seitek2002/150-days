// First-launch screen: choose the Fallout 1 folder and the language.
import { getLang, setLang, t, type Lang } from '../i18n.ts';
import { platform, type FolderResult } from '../platform.ts';

const REASONS: Record<string, Parameters<typeof t>[0]> = {
  missing: 'errorMissing',
  'no-dat': 'errorNoDat',
  empty: 'errorEmpty',
};

export function showSetup(root: HTMLElement, initialDir: string, onReady: () => void, initialError = ''): void {
  // The error is stored as a key so that it gets translated when the language changes.
  let errorKey: Parameters<typeof t>[0] | null = initialError ? 'errorLoad' : null;
  const render = (dir: string, error: string) => {
    root.innerHTML = `
      <main class="setup">
        <section class="setup-card" aria-labelledby="setup-title">
          <h1 id="setup-title" class="setup-title"></h1>
          <p class="setup-subtitle"></p>
          <label class="field-label" for="folder"></label>
          <p id="folder-help" class="field-help"></p>
          <div class="folder-row">
            <input id="folder" class="folder-input" type="text" spellcheck="false" autocomplete="off"
              aria-describedby="folder-help folder-error" />
            <button id="apply" class="button" type="button"></button>
          </div>
          <p id="folder-error" class="field-error" role="alert"></p>
          <div class="setup-footer">
            <div class="lang" role="group" aria-labelledby="lang-label">
              <span id="lang-label"></span>
              <button class="lang-button" type="button" data-lang="ru">RU</button>
              <button class="lang-button" type="button" data-lang="en">EN</button>
            </div>
          </div>
          <p class="disclaimer"></p>
        </section>
      </main>`;
    const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    $('.setup-title').textContent = t('title');
    $('.setup-subtitle').textContent = t('subtitle');
    $('.field-label').textContent = t('folderLabel');
    $('#folder-help').textContent = t('folderHelp');
    $('#lang-label').textContent = t('language');
    $('.disclaimer').textContent = t('disclaimer');
    const input = $<HTMLInputElement>('#folder');
    const apply = $<HTMLButtonElement>('#apply');
    const errorBox = $('#folder-error');
    input.value = dir;
    input.placeholder = t('pathPlaceholder');
    // In Electron — the system folder picker, in the browser — a path input.
    apply.textContent = platform.hasFolderDialog ? t('choose') : t('apply');
    const showError = (message: string) => {
      error = message;
      errorBox.textContent = message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    };
    showError(error);

    const finish = (result: FolderResult) => {
      apply.disabled = false;
      if (result.ok) {
        onReady();
        return;
      }
      if (result.gameDir) input.value = result.gameDir;
      if (result.reason !== 'cancelled') {
        errorKey = REASONS[result.reason ?? ''] ?? 'errorNoDat';
        showError(t(errorKey));
      }
    };

    apply.addEventListener('click', async () => {
      apply.disabled = true;
      const typed = input.value.trim();
      if (platform.hasFolderDialog && !typed) finish(await platform.chooseFolder());
      else if (!typed) finish({ ok: false, reason: 'empty' });
      else if (platform.hasFolderDialog && typed === dir) finish(await platform.chooseFolder());
      else finish(await platform.setFolder(typed));
    });
    input.addEventListener('input', () => {
      if (platform.hasFolderDialog) apply.textContent = input.value.trim() && input.value.trim() !== dir ? t('apply') : t('choose');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') apply.click();
    });

    root.querySelectorAll<HTMLButtonElement>('.lang-button').forEach((button) => {
      const lang = button.dataset.lang as Lang;
      button.setAttribute('aria-pressed', String(lang === getLang()));
      button.addEventListener('click', () => {
        setLang(lang);
        void platform.setLang(lang);
        render(input.value, errorKey ? t(errorKey) : '');
        (root.querySelector(`[data-lang="${lang}"]`) as HTMLElement | null)?.focus();
      });
    });
  };
  render(initialDir, errorKey ? t(errorKey) : '');
}
