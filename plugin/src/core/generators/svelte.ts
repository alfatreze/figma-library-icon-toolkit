import { pascal } from '../naming'
import { BuildInput, componentName, Files, ns } from './common'
import { camelNs, iconDataFiles, K } from './icondata'
import { allIconsDoc, loadCategoryOfName, preloadDoc, resolveName } from './runtime-text'

function registry(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const k = K(b)
  const P = pascal(n)
  return `import { writable } from 'svelte/store';
import { ${k}_CATEGORY_OF, ${k}_DEPRECATED } from './icon-data';
import type { ${C}Data } from './icon-data';
import { ${k}_LOADERS } from './loaders';

// A store: a component that subscribed ($${camelNs(b)}Icons) updates when a category chunk arrives.
const store = writable<ReadonlyMap<string, ${C}Data>>(new Map());
export const ${camelNs(b)}Icons = { subscribe: store.subscribe };
const requested = new Set<string>();

/**
 * Register icons up front (synchronous, tree-shakable): register${P}Icons(${camelNs(b)}Home, ${camelNs(b)}Search).
 * Icons you do not register are still found by name: their category loads on first use as a lazy chunk.
 */
export function register${P}Icons(...icons: (${C}Data | readonly ${C}Data[])[]): void {
  store.update((current) => {
    const next = new Map(current);
    for (const item of icons) for (const i of Array.isArray(item) ? item : [item as ${C}Data]) next.set(i.name, i);
    return next;
  });
}

function load(category: string): Promise<void> {
  const loader = ${k}_LOADERS[category];
  if (!loader || requested.has(category)) return Promise.resolve();
  requested.add(category);
  return loader().then(
    (icons) => register${P}Icons(icons),
    () => { requested.delete(category); } // allow a retry
  );
}

/** ${preloadDoc(`preload${P}Icons('arrows')`)} */
export function preload${P}Icons(...categories: string[]): Promise<void[]> {
  return Promise.all(categories.map(load));
}

/** Looks an icon up by name in the registered icons; triggers its category chunk when missing (the store then updates). */
export function find${P}Icon(requestedName: string | undefined, icons: ReadonlyMap<string, ${C}Data>): ${C}Data | undefined {
  if (!requestedName) return undefined;
  const name = ${resolveName(b, 'requestedName')};
  const hit = icons.get(name);
  if (!hit) {
${loadCategoryOfName(b, 'load', '    ')}
  }
  return hit;
}
`
}

function allIcons(b: BuildInput): string {
  const P = pascal(ns(b))
  return `import { ${K(b)}_ICONS } from './icons';
import { register${P}Icons } from './${ns(b)}-icon-registry';

/** ${allIconsDoc(`register${P}Icons`)} */
export function register${P}AllIcons(): void {
  register${P}Icons(Object.values(${K(b)}_ICONS));
}
`
}

/**
 * The component uses the classic Svelte syntax (export let, $:), which Svelte 4 and 5 both compile: no runes, so one file serves both.
 */
function component(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const c = camelNs(b)
  const P = pascal(n)
  return `<script lang="ts">
  /**
   * <${C} icon={${c}Home} size={24} />   imported directly: synchronous and tree-shakable
   * <${C} name="home" size={24} />       by name: registered icons render at once, others load their category lazily
   * Style with CSS variables too: --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2, --${n}-icon-stroke-width.
   */
  import { ${c}StrokeFor, ${c}Svg } from './icon-data';
  import type { ${C}Data, ${C}DeprecatedName, ${C}Name } from './icon-data';
  import { find${P}Icon, ${c}Icons } from './${n}-icon-registry';

  /** typed icon name (renamed icons keep working under their old name for one major version) */
  export let name: ${C}Name | ${C}DeprecatedName | undefined = undefined;
  /** icon object imported from './icons' (synchronous, tree-shakable; wins over name) */
  export let icon: ${C}Data | undefined = undefined;
  /** number = px, or any CSS length */
  export let size: number | string | undefined = undefined;
  /** primary colour (any CSS colour); default currentColor */
  export let color: string | undefined = undefined;
  /** line icons only (px) */
  export let strokeWidth: number | string | undefined = undefined;
  /** accessible name; omit for decorative icons */
  export let label: string | undefined = undefined;

  $: data = icon ?? find${P}Icon(name, $${c}Icons);
  $: weight = strokeWidth ?? ${c}StrokeFor(size);
  $: vars = [
    size !== undefined && size !== '' ? '--${n}-icon-size:' + (typeof size === 'number' ? size + 'px' : size) : '',
    color ? '--${n}-icon-color:' + color : '',
    weight !== null && weight !== undefined ? '--${n}-icon-stroke-width:' + weight : '',
    typeof $$restProps.style === 'string' ? $$restProps.style : '',
  ].filter(Boolean).join(';');
</script>

{#if data}
  <span
    {...$$restProps}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
    style="display:inline-block;width:var(--${n}-icon-size,1em);height:var(--${n}-icon-size,1em);flex:none;line-height:0;vertical-align:-0.125em;{vars}"
  >{@html ${c}Svg(data)}</span>
{/if}
`
}

export function svelteFiles(b: BuildInput): Files {
  const n = ns(b)
  const C = componentName(b)
  const P = pascal(n)
  return {
    ...iconDataFiles(b, 'svelte'),
    [`svelte/${n}-icon-registry.ts`]: registry(b),
    'svelte/all-icons.ts': allIcons(b),
    [`svelte/${n}-icon.svelte`]: component(b),
    'svelte/index.ts': `export * from './icon-data';\nexport * from './icons/index';\nexport { register${P}Icons, preload${P}Icons } from './${n}-icon-registry';\nexport { default as ${C} } from './${n}-icon.svelte';\n`
  }
}
