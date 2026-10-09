import { BuildInput, componentName, Files, ns } from './common'
import { iconsTs } from './angular'

const camelName = (b: BuildInput) => ns(b).replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase())

function component(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const K = n.toUpperCase().replace(/-/g, '_')
  return `import { CSSProperties, HTMLAttributes, memo } from 'react';
import { ${K}_DEPRECATED, ${K}_ICONS, ${C}Data, ${C}DeprecatedName, ${C}Name, ${camelName(b)}StrokeFor } from './icons';

export interface ${C}Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'> {
  /** typed icon name (renamed icons keep working under their old name for one major version) */
  name: ${C}Name | ${C}DeprecatedName;
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
 * <${C} name="…" size={24} color="#0a7d3b" />
 * Style with CSS variables too: --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2, --${n}-icon-stroke-width.
 */
export const ${C} = memo(function ${C}({ name, size, color, strokeWidth, label, style, ...rest }: ${C}Props) {
  const key = (${K}_DEPRECATED as Record<string, string>)[name] ?? name;
  const data = (${K}_ICONS as Record<string, ${C}Data>)[key];
  if (!data) return null;

  const vars: Record<string, string | number> = {};
  if (size !== undefined && size !== '') vars['--${n}-icon-size'] = typeof size === 'number' ? size + 'px' : size;
  if (color) vars['--${n}-icon-color'] = color;
  const weight = strokeWidth ?? ${camelName(b)}StrokeFor(size);
  if (weight !== null && weight !== undefined) vars['--${n}-icon-stroke-width'] = weight;

  // Trusted, generated markup (not user input).
  const html = '<svg viewBox="' + data.viewBox + '" width="100%" height="100%" fill="none" focusable="false" aria-hidden="true">' + data.body + '</svg>';

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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
`
}

export function reactFiles(b: BuildInput): Files {
  const n = ns(b)
  const C = componentName(b)
  return {
    'react/icons.ts': iconsTs(b),
    [`react/${n}-icon.tsx`]: component(b),
    'react/index.ts': `export * from './icons';\nexport { ${C} } from './${n}-icon';\nexport type { ${C}Props } from './${n}-icon';\n`
  }
}
