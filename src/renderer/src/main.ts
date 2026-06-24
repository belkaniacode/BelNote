import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import { i18n } from './i18n'
import { initTheme } from './composables/useTheme'
import './styles/theme.css'

// In a plain browser (no Electron preload), install an in-memory API mock so the UI can be
// run/inspected outside Electron. No-op in the real app, where window.api always exists.
if (import.meta.env.DEV && !('api' in window)) {
  const { installDevApiMock } = await import('./devApiMock')
  installDevApiMock()
}

// Resolve and paint the persisted/system theme before the app mounts (no flash).
initTheme()

createApp(App).use(createPinia()).use(ElementPlus).use(i18n).mount('#app')
