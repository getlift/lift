<template>
  <div id="app" class="container mx-auto px-4">
    <LiftForm/>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import LiftForm from './components/LiftForm.vue';

@Component({
  components: {
      LiftForm: LiftForm,
  },
})
export default class App extends Vue {}
</script>
