<template>
  <div class="crt">
    <NuxtRouteAnnouncer />
    <div class="main">
      <div class="header">
        <h1 class="title">A Series of Snakes</h1>
      </div>
      <GameSelector class="content" />
      <div class="footer"></div>
    </div>
  </div>
</template>

<style lang="scss">
html,
body {
  overflow: hidden;

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

.crt {
  height: 100vh;
  background: url('/image/noise.png'),
    radial-gradient(
      circle at center,
      rgba(0, 90, 0, 1) 0%,
      rgba(0, 5, 0, 1) 100%
    );
}

.main {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header,
  .footer {
    flex-grow: 1;
    flex-basis: 0;
  }

  .content {
    flex-grow: 1;
  }
}

.title {
  font-family: PublicPixel;
  font-size: 3.5rem;

  color: rgba(255, 255, 255, 1);

  margin: 0;
  padding: 1rem;
}
</style>
