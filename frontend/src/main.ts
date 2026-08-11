import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import App from './App.vue'
import router from './router'
import './styles/main.scss'
import { initI18n } from './i18n'
import { initTheme } from './composables/useTheme'

const app = createApp(App)
initTheme()
initI18n()

app.use(createPinia())
app.use(router)

app.mount('#app')
