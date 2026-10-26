import { pascal } from '../naming'
import { BuildInput, componentName, Files, ns } from './common'
import { camelNs, iconDataFiles, K } from './icondata'
import { allIconsDoc, loadCategoryOfName, preloadDoc, resolveName } from './runtime-text'

function registry(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const k = K(b)
  const P = pascal(n)
  return `import { shallowReactive } from 'vue';
import { ${k}_CATEGORY_OF, ${k}_DEPRECATED } from './icon-data';
import type { ${C}Data } from './icon-data';
import { ${k}_LOADERS } from './loaders';

// A reactive map: a component that looked an icon up re-renders when its category chunk arrives.
const store = shallowReactive(new Map<string, ${C}Data>());
const requested = new Set<string>();

/**
 * Register icons up front (synchronous, tree-shakable): register${P}Icons(${camelNs(b)}Home, ${camelNs(b)}Search).
 * Icons you do not register are still found by name: their category loads on first use as a lazy chunk.
 */
export function register${P}Icons(...icons: (${C}Data | readonly ${C}Data[])[]): void {
  for (const item of icons) for (const i of Array.isArray(item) ? item : [item as ${C}Data]) store.set(i.name, i);
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

/** Looks an icon up by name; triggers its category chunk when missing. Call it while rendering: the lookup is reactive. */
export function use${P}Icon(requestedName: string | undefined): ${C}Data | undefined {
  if (!requestedName) return undefined;
  const name = ${resolveName(b, 'requestedName')};
  const hit = store.get(name);
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

function component(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const c = camelNs(b)
  const P = pascal(n)
  return `import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';
import { ${c}StrokeFor, ${c}Svg } from './icon-data';
import type { ${C}Data, ${C}DeprecatedName, ${C}Name } from './icon-data';
import { use${P}Icon } from './${n}-icon-registry';

/**
 * <${C} :icon="${c}Home" :size="24" />   imported directly: synchronous and tree-shakable
 * <${C} name="home" :size="24" />        by name: registered icons render at once, others load their category lazily
 * Style with CSS variables too: --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2, --${n}-icon-stroke-width.
 */
export const ${C} = defineComponent({
  name: '${C}',
  props: {
    /** typed icon name (renamed icons keep working under their old name for one major version) */
    name: { type: String as PropType<${C}Name | ${C}DeprecatedName>, default: undefined },
    /** icon object imported from './icons' (synchronous, tree-shakable; wins over name) */
    icon: { type: Object as PropType<${C}Data>, default: undefined },
    /** number = px, or any CSS length */
    size: { type: [Number, String] as PropType<number | string>, default: undefined },
    /** primary colour (any CSS colour); default currentColor */
    color: { type: String, default: undefined },
    /** line icons only (px) */
    strokeWidth: { type: [Number, String] as PropType<number | string>, default: undefined },
    /** accessible name; omit for decorative icons */
    label: { type: String, default: undefined },
  },
  setup(props) {
    return () => {
      const data = props.icon ?? use${P}Icon(props.name);
      if (!data) return null;

      const vars: Record<string, string | number> = {};
      if (props.size !== undefined && props.size !== '') vars['--${n}-icon-size'] = typeof props.size === 'number' ? props.size + 'px' : props.size;
      if (props.color) vars['--${n}-icon-color'] = props.color;
      const weight = props.strokeWidth ?? ${c}StrokeFor(props.size);
      if (weight !== null && weight !== undefined) vars['--${n}-icon-stroke-width'] = weight;

      return h('span', {
        role: props.label ? 'img' : undefined,
        'aria-label': props.label,
        'aria-hidden': props.label ? undefined : 'true',
        style: {
          display: 'inline-block',
          width: 'var(--${n}-icon-size, 1em)',
          height: 'var(--${n}-icon-size, 1em)',
          flex: 'none',
          lineHeight: 0,
          verticalAlign: '-0.125em',
          ...vars,
        },
        // Trusted, generated markup (not user input).
        innerHTML: ${c}Svg(data),
      });
    };
  },
});
`
}

export function vueFiles(b: BuildInput): Files {
  const n = ns(b)
  const C = componentName(b)
  const P = pascal(n)
  return {
    ...iconDataFiles(b, 'vue'),
    [`vue/${n}-icon-registry.ts`]: registry(b),
    'vue/all-icons.ts': allIcons(b),
    [`vue/${n}-icon.ts`]: component(b),
    'vue/index.ts': `export * from './icon-data';\nexport * from './icons/index';\nexport { register${P}Icons, preload${P}Icons, use${P}Icon } from './${n}-icon-registry';\nexport { ${C} } from './${n}-icon';\n`
  }
}
