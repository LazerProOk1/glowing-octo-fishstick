import { provinceSuite } from './provincesSuite';

// Small size: the quality thresholds are relaxed (see QUALITY in provincesSuite.ts).
provinceSuite([
  ['1', {}, 'small'],
  ['Бета-7', { fantasy: true }, 'small'],
]);
