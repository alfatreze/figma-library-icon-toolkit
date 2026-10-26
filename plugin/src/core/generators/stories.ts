import { BuildInput, componentName, Files, ns } from './common'
import { K } from './icondata'

/**
 * Storybook stories (CSF 3) for the React, Vue and Svelte packages, in a stories/ folder next to them so the publishable package folders
 * stay clean. Each file has a Playground story (controls for name, size, colour, stroke width and label) and an AllIcons story with a grid
 * of every icon. Copy stories/ into your Storybook (it imports ../react, ../vue or ../svelte).
 */

const GRID = "display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(96px,1fr))',gap:16"
const CELL = "textAlign:'center',fontSize:11"

const controls = (names: string) => `  argTypes: {
    name: { control: 'select', options: ${names} },
    size: { control: { type: 'number', min: 8, max: 128, step: 4 } },
    color: { control: 'color' },
    strokeWidth: { control: { type: 'number', min: 0.5, max: 4, step: 0.25 } },
    label: { control: 'text' },
  },`

function react(b: BuildInput): string {
  const C = componentName(b)
  const names = `${K(b)}_ICON_NAMES`
  return `import type { Meta, StoryObj } from '@storybook/react';
import { ${C} } from '../react';
import { ${names} } from '../react/icons';

const meta = {
  title: 'Icons/${C}',
  component: ${C},
  args: { name: ${names}[0], size: 32 },
${controls(names)}
} satisfies Meta<typeof ${C}>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One icon with controls. */
export const Playground: Story = {};

/** Every icon, with its name. */
export const AllIcons: Story = {
  render: (args) => (
    <div style={{ ${GRID} }}>
      {${names}.map((name) => (
        <div key={name} style={{ ${CELL} }}>
          <${C} {...args} name={name} />
          <div>{name}</div>
        </div>
      ))}
    </div>
  ),
};
`
}

function vue(b: BuildInput): string {
  const C = componentName(b)
  const names = `${K(b)}_ICON_NAMES`
  return `import type { Meta, StoryObj } from '@storybook/vue3';
import { h } from 'vue';
import { ${C} } from '../vue';
import { ${names} } from '../vue/icons';

const meta = {
  title: 'Icons/${C}',
  component: ${C},
  args: { name: ${names}[0], size: 32 },
${controls(names)}
} satisfies Meta<typeof ${C}>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One icon with controls. */
export const Playground: Story = {};

/** Every icon, with its name. */
export const AllIcons: Story = {
  render: (args) => ({
    setup: () => () =>
      h('div', { style: { ${GRID} } }, ${names}.map((name) => h('div', { key: name, style: { ${CELL} } }, [h(${C}, { ...args, name }), h('div', name)]))),
  }),
};
`
}

function svelte(b: BuildInput): string {
  const C = componentName(b)
  const names = `${K(b)}_ICON_NAMES`
  return `import type { Meta, StoryObj } from '@storybook/svelte';
import ${C} from '../svelte/${ns(b)}-icon.svelte';
import { ${names} } from '../svelte/icons';
import ${C}Gallery from './${ns(b)}-icon-gallery.svelte';

const meta = {
  title: 'Icons/${C}',
  component: ${C},
  args: { name: ${names}[0], size: 32 },
${controls(names)}
} satisfies Meta<typeof ${C}>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One icon with controls. */
export const Playground: Story = {};

/** Every icon, with its name. */
export const AllIcons: Story = {
  render: (args) => ({ Component: ${C}Gallery, props: args }),
};
`
}

function svelteGallery(b: BuildInput): string {
  const C = componentName(b)
  return `<script lang="ts">
  import ${C} from '../svelte/${ns(b)}-icon.svelte';
  import { ${K(b)}_ICON_NAMES } from '../svelte/icons';

  export let size: number | string | undefined = undefined;
  export let color: string | undefined = undefined;
  export let strokeWidth: number | string | undefined = undefined;
  export let label: string | undefined = undefined;
  // the Playground controls also pass a name; the gallery shows every icon
  export let name: string | undefined = undefined;
  $: void name;
</script>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:16px">
  {#each ${K(b)}_ICON_NAMES as icon}
    <div style="text-align:center;font-size:11px">
      <${C} name={icon} {size} {color} {strokeWidth} {label} />
      <div>{icon}</div>
    </div>
  {/each}
</div>
`
}

export function storiesFiles(b: BuildInput): Files {
  const f = b.settings.formats
  const n = ns(b)
  const out: Files = {}
  if (f.react) out[`stories/${n}-icon.react.stories.tsx`] = react(b)
  if (f.vue) out[`stories/${n}-icon.vue.stories.ts`] = vue(b)
  if (f.svelte) {
    out[`stories/${n}-icon.svelte.stories.ts`] = svelte(b)
    out[`stories/${n}-icon-gallery.svelte`] = svelteGallery(b)
  }
  if (Object.keys(out).length) {
    out['stories/README.md'] = `# Storybook stories

CSF 3 stories for the ${[f.react ? 'React' : '', f.vue ? 'Vue' : '', f.svelte ? 'Svelte' : ''].filter(Boolean).join(', ')} component${[f.react, f.vue, f.svelte].filter(Boolean).length > 1 ? 's' : ''}: a **Playground** (controls for name, size, colour, stroke width and label) and **AllIcons** (every icon with its name).

Keep this folder next to the package folders (the stories import \`../react\`, \`../vue\` or \`../svelte\`) and add \`stories/*.stories.*\` to your Storybook \`stories\` setting. The package folders do not need Storybook, so publishing them is unaffected.
`
  }
  return out
}
