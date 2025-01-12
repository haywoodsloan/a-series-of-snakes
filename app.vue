<template>
  <div class="main crt">
    <NuxtRouteAnnouncer />
    <h1 class="title">A Series of Snakes</h1>
  </div>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  background-color: black;
}

@font-face {
  font-family: 'PublicPixel';
  src: url('~/assets/fonts/PublicPixel.ttf');
}
</style>

<style lang="scss" scoped>
@import url('~/assets/css/crt.scss');

.main {
  min-height: 100vh;
  overflow: hidden;

  background: url('/image/noise.png'),
    radial-gradient(circle at center, rgb(0, 90, 0) 0%, rgb(0, 5, 0) 100%);
}

.title {
  font-family: PublicPixel, Roboto, sans-serif;
  font-size: 5rem;
  color: rgba(245, 245, 245, 1);
  margin: 1rem;
}
</style>
