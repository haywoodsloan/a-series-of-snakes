declare type GameList = Array<{
  name: string,
  load: () => Promise<import('vue').VueElementConstructor>
}>