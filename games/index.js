import classic from '~/assets/svg/classic.svg?raw';

/** @typedef {GameList} */
export default [
  {
    name: 'classic',
    load: () => import('./classic.js'),
    preview: classic,
  },
];
