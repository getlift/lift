<template>
    <div>
        <h1>Welcome to Your Vue.js App</h1>
        <p>
            The backend API URL is: <strong>{{ apiUrl }}</strong>
        </p>
        <p>
            The API responded this payload: <code>{{ apiResponse }}</code>
        </p>
    </div>
</template>

<script>
export default {
    name: 'App',
    data() {
        return {
            apiUrl: process.env.VUE_APP_API_URL,
            apiResponse: '',
        }
    },
    async mounted() {
        const response = await fetch(this.apiUrl);
        this.apiResponse = JSON.stringify(response.data);
    }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
