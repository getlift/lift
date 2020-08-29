import Vue from 'vue'
import App from './App.vue'

// Syntax highlighting
import 'prismjs/themes/prism.css'
import 'vue-prism-editor/dist/prismeditor.min.css'

import './assets/style.css'

Vue.config.productionTip = false

new Vue({
    render: h => h(App),
}).$mount('#app')
