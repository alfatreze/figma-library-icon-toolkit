import { pascal } from '../naming'
import { BuildInput, componentName, constName, Files, ns } from './common'
import { camelNs, iconDataFiles, K } from './icondata'
import { allIconsDoc, loadCategoryOfName, preloadDoc, resolveName } from './runtime-text'

function registry(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const k = K(b)
  const P = pascal(n)
  return `import { useEffect, useReducer } from 'react';
import { ${k}_CATEGORY_OF, ${k}_DEPRECATED, ${C}Data } from './icon-data';
import { ${k}_LOADERS } from './loaders';

const store = new Map<string, ${C}Data>();
const listeners = new Set<() => void>();
const requested = new Set<string>();

/**
 * Register icons up front (synchronous, tree-shakable): register${P}Icons(${camelNs(b)}Home, ${camelNs(b)}Search).
 * Icons you do not register are still found by name: their category loads on first use as a lazy chunk.
 */
export function register${P}Icons(...icons: (${C}Data | readonly ${C}Data[])[]): void {
  for (const item of icons) for (const i of Array.isArray(item) ? item : [item as ${C}Data]) store.set(i.name, i);
  listeners.forEach((l) => l());
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

/** Looks an icon up by name; triggers its category chunk when missing and re-renders the caller when it arrives. */
export function use${P}Icon(requestedName: string | undefined): ${C}Data | undefined {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);
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
  return `import { CSSProperties, HTMLAttributes, memo } from 'react';
import { ${C}Data, ${C}DeprecatedName, ${C}Name, ${c}StrokeFor, ${c}Svg } from './icon-data';
import { use${P}Icon } from './${n}-icon-registry';

export interface ${C}Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'> {
  /** typed icon name (renamed icons keep working under their old name for one major version) */
  name?: ${C}Name | ${C}DeprecatedName;
  /** icon object imported from './icons' (synchronous, tree-shakable; wins over name) */
  icon?: ${C}Data;
  /** number = px, or any CSS length */
  size?: number | string;
  /** primary colour (any CSS colour); default currentColor */
  color?: string;
  /** line icons only (px) */
  strokeWidth?: number | string;
  /** accessible name; omit for decorative icons */
  label?: string;
}

/**
 * <${C} icon={${c}Home} size={24} />   imported directly: synchronous and tree-shakable
 * <${C} name="home" size={24} />        by name: registered icons render at once, others load their category lazily
 * Style with CSS variables too: --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2, --${n}-icon-stroke-width.
 */
export const ${C} = memo(function ${C}({ name, icon, size, color, strokeWidth, label, style, ...rest }: ${C}Props) {
  const byName = use${P}Icon(icon ? undefined : name);
  const data = icon ?? byName;
  if (!data) return null;

  const vars: Record<string, string | number> = {};
  if (size !== undefined && size !== '') vars['--${n}-icon-size'] = typeof size === 'number' ? size + 'px' : size;
  if (color) vars['--${n}-icon-color'] = color;
  const weight = strokeWidth ?? ${c}StrokeFor(size);
  if (weight !== null && weight !== undefined) vars['--${n}-icon-stroke-width'] = weight;

  return (
    <span
      {...rest}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        display: 'inline-block',
        width: 'var(--${n}-icon-size, 1em)',
        height: 'var(--${n}-icon-size, 1em)',
        flex: 'none',
        lineHeight: 0,
        verticalAlign: '-0.125em',
        ...(vars as CSSProperties),
        ...style,
      }}
      // Trusted, generated markup (not user input).
      dangerouslySetInnerHTML={{ __html: ${c}Svg(data) }}
    />
  );
});
`
}

export function reactFiles(b: BuildInput): Files {
  const n = ns(b)
  const C = componentName(b)
  const P = pascal(n)
  return {
    ...iconDataFiles(b, 'react'),
    [`react/${n}-icon-registry.ts`]: registry(b),
    'react/all-icons.ts': allIcons(b),
    [`react/${n}-icon.tsx`]: component(b),
    'react/index.ts': `export * from './icon-data';\nexport * from './icons/index';\nexport { register${P}Icons, preload${P}Icons, use${P}Icon } from './${n}-icon-registry';\nexport { ${C} } from './${n}-icon';\nexport type { ${C}Props } from './${n}-icon';\n`
  }
}
