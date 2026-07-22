import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import App from './App.vue'
import router from './router'
import './styles/main.scss'
import { initI18n } from './i18n'

const app = createApp(App)
initI18n()

app.use(createPinia())
app.use(router)

app.mount('#app')
