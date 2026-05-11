import classic from '~/assets/svg/classic.svg?raw';
import inverted from '~/assets/svg/inverted.svg?raw';
import chase from '~/assets/svg/chase.svg?raw';
import mirror from '~/assets/svg/mirror.svg?raw';

/** @typedef {GameList} */
export default [
  {
    name: 'classic',
    load: () => import('./classic.js'),
    preview: classic,
  },
  {
    name: 'chase',
    load: () => import('./chase.js'),
    preview: chase,
  },
  {
    name: 'inverted',
    load: () => import('./inverted.js'),
    preview: inverted,
  },
  {
    name: 'mirror',
    load: () => import('./mirror.js'),
    preview: mirror,
  },
];
