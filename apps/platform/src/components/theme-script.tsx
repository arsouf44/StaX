import { THEME_SCRIPT } from '~/lib/theme-script';

export { THEME_SCRIPT, THEME_SCRIPT_CSP_HASH, THEME_STORAGE_KEY } from '~/lib/theme-script';

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
