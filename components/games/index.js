import unknown from '~/assets/svg/unknown.svg?raw';

/** @typedef {GameList} */
export default [
  {
    name: 'Classic',
    load: () => import('./Classic.vue'),
    preview: unknown,
  },
];
