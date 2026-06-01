import chase from '~/assets/svg/chase.svg?raw';
import classic from '~/assets/svg/classic.svg?raw';
import duo from '~/assets/svg/duo.svg?raw';
import endless from '~/assets/svg/endless.svg?raw';
import inverted from '~/assets/svg/inverted.svg?raw';
import mirror from '~/assets/svg/mirror.svg?raw';
import rpg from '~/assets/svg/rpg.svg?raw';
import spikes from '~/assets/svg/spikes.svg?raw';
import tunnels from '~/assets/svg/tunnels.svg?raw';

/** @type {GameList} */
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
    name: 'tunnels',
    load: () => import('./tunnels.js'),
    preview: tunnels,
  },
  {
    name: 'spikes',
    load: () => import('./spikes.js'),
    preview: spikes,
  },
  {
    name: 'endless',
    load: () => import('./endless.js'),
    preview: endless,
  },
  {
    name: 'mirror',
    load: () => import('./mirror.js'),
    preview: mirror,
  },
  {
    name: 'duo',
    load: () => import('./duo.js'),
    preview: duo,
  },
  {
    name: 'inverted',
    load: () => import('./inverted.js'),
    preview: inverted,
  },
  {
    name: 'rpg',
    load: () => import('./rpg.js'),
    preview: rpg,
  },
];
