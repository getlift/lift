module.exports = {
  plugins: {
    tailwindcss: {},
    'vue-cli-plugin-tailwind/purgecss': {
      // So that PrismJS's CSS is not purged
      // See https://github.com/gridsome/gridsome/issues/747#issuecomment-619483830
      whitelistPatternsChildren: [/^token/, /^pre/, /^code/],
    }
  }
}
