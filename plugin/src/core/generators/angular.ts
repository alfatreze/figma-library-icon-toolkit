import { pascal } from '../naming'
import { BuildInput, componentName, constName, Files, ns } from './common'
import { camelNs, iconDataFiles, K } from './icondata'

function names(b: BuildInput) {
  const n = ns(b)
  const P = pascal(n)
  return { n, P, C: componentName(b), k: K(b), c: camelNs(b), reg: `${P}IconRegistry`, tok: `${K(b)}_ICONS_TOKEN`, provide: `provide${P}Icons` }
}

const HOST_STYLE = (n: string) => `    ':host{display:inline-block;width:var(--${n}-icon-size,1em);height:var(--${n}-icon-size,1em);flex:none;line-height:0;vertical-align:-0.125em}',
    '.${n}-icon__inner{display:block;width:100%;height:100%}'`

// ---------------------------------------------------------------- registry
function registryModern(b: BuildInput): string {
  const { n, C, k, reg, tok, provide } = names(b)
  return `import { inject, Injectable, InjectionToken, Provider, signal } from '@angular/core';
import { ${k}_CATEGORY_OF, ${k}_DEPRECATED, ${C}Data } from './icon-data';
import { ${k}_LOADERS } from './loaders';

type IconInput = ${C}Data | readonly ${C}Data[];

export const ${tok} = new InjectionToken<readonly (readonly IconInput[])[]>('${n} icons');

/**
 * Register icons up front (synchronous, tree-shakable):
 *   providers: [${provide}(${camelNs(b)}Home, ${camelNs(b)}Search)]
 * Icons you do not register are still found by name: their category is loaded on first use as a lazy chunk.
 */
export function ${provide}(...icons: IconInput[]): Provider {
  return { provide: ${tok}, multi: true, useValue: icons };
}

@Injectable({ providedIn: 'root' })
export class ${reg} {
  private readonly store = signal<ReadonlyMap<string, ${C}Data>>(new Map());
  private readonly requested = new Set<string>();

  constructor() {
    const given = inject(${tok}, { optional: true }) ?? [];
    for (const group of given) for (const item of group) this.add(...(Array.isArray(item) ? item : [item as ${C}Data]));
  }

  add(...icons: ${C}Data[]): void {
    if (!icons.length) return;
    this.store.update((m) => {
      const next = new Map(m);
      for (const i of icons) next.set(i.name, i);
      return next;
    });
  }

  /** Reads a signal: call it inside computed() or a template so the view updates when a lazy category arrives. */
  get(requested: string): ${C}Data | undefined {
    const name = (${k}_DEPRECATED as Record<string, string>)[requested] ?? requested;
    const hit = this.store().get(name);
    if (!hit) this.load(name);
    return hit;
  }

  /** Warm categories ahead of use, e.g. preload('arrows'). */
  async preload(...categories: string[]): Promise<void> {
    await Promise.all(categories.map((c) => this.loadCategory(c)));
  }

  private load(name: string): void {
    const category = ${k}_CATEGORY_OF[name];
    if (category !== undefined) void this.loadCategory(category);
  }

  private async loadCategory(category: string): Promise<void> {
    const loader = ${k}_LOADERS[category];
    if (!loader || this.requested.has(category)) return;
    this.requested.add(category);
    try {
      this.add(...(await loader()));
    } catch {
      this.requested.delete(category); // allow a retry (network hiccup)
    }
  }
}
`
}

function registryClassic(b: BuildInput): string {
  const { n, C, k, reg, tok, provide } = names(b)
  return `import { Inject, Injectable, InjectionToken, Optional, Provider } from '@angular/core';
import { Subject } from 'rxjs';
import { ${k}_CATEGORY_OF, ${k}_DEPRECATED, ${C}Data } from './icon-data';
import { ${k}_LOADERS } from './loaders';

type IconInput = ${C}Data | readonly ${C}Data[];

export const ${tok} = new InjectionToken<readonly (readonly IconInput[])[]>('${n} icons');

/**
 * Register icons up front (synchronous, tree-shakable):
 *   providers: [${provide}(${camelNs(b)}Home, ${camelNs(b)}Search)]
 * Icons you do not register are still found by name: their category is loaded on first use as a lazy chunk.
 */
export function ${provide}(...icons: IconInput[]): Provider {
  return { provide: ${tok}, multi: true, useValue: icons };
}

@Injectable({ providedIn: 'root' })
export class ${reg} {
  private readonly store = new Map<string, ${C}Data>();
  private readonly requested = new Set<string>();
  /** emits when icons were added (a lazy category arrived) */
  readonly changes = new Subject<void>();

  constructor(@Optional() @Inject(${tok}) given: readonly (readonly IconInput[])[] | null) {
    for (const group of given ?? []) for (const item of group) this.add(...(Array.isArray(item) ? item : [item as ${C}Data]));
  }

  add(...icons: ${C}Data[]): void {
    if (!icons.length) return;
    for (const i of icons) this.store.set(i.name, i);
    this.changes.next();
  }

  get(requested: string): ${C}Data | undefined {
    const name = (${k}_DEPRECATED as Record<string, string>)[requested] ?? requested;
    const hit = this.store.get(name);
    if (!hit) this.load(name);
    return hit;
  }

  /** Warm categories ahead of use, e.g. preload('arrows'). */
  preload(...categories: string[]): Promise<void[]> {
    return Promise.all(categories.map((c) => this.loadCategory(c)));
  }

  private load(name: string): void {
    const category = ${k}_CATEGORY_OF[name];
    if (category !== undefined) void this.loadCategory(category);
  }

  private loadCategory(category: string): Promise<void> {
    const loader = ${k}_LOADERS[category];
    if (!loader || this.requested.has(category)) return Promise.resolve();
    this.requested.add(category);
    return loader().then(
      (icons) => this.add(...icons),
      () => { this.requested.delete(category); }
    );
  }
}
`
}

function allIcons(b: BuildInput): string {
  const { P, k, provide } = names(b)
  return `import { Provider } from '@angular/core';
import { ${k}_ICONS } from './icons';
import { ${provide} } from './${ns(b)}-icon-registry';

/** Synchronous access to every icon by name. Puts ALL icons in your main bundle; prefer ${provide}(…) with the icons you use. */
export function provide${P}AllIcons(): Provider {
  return ${provide}(Object.values(${k}_ICONS));
}
`
}

// --------------------------------------------------------------- components
function modern(b: BuildInput): string {
  const { n, C, k, c, reg } = names(b)
  return `import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ${C}Data, ${C}DeprecatedName, ${C}Name, ${c}StrokeFor, ${c}Svg } from './icon-data';
import { ${reg} } from './${n}-icon-registry';

/**
 * <${n}-icon name="…" />        looked up by name (registered icons, otherwise its category loads lazily)
 * <${n}-icon [icon]="${c}Home" />  imported directly: synchronous and tree-shakable
 * (Angular 17.1+, standalone, signals)
 * Customise via inputs or CSS variables: --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2, --${n}-icon-stroke-width.
 * Pass [label] for meaningful icons; without it the icon is decorative (aria-hidden).
 */
@Component({
  selector: '${n}-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[style.--${n}-icon-size]': 'sizeCss()',
    '[style.--${n}-icon-color]': 'color() || null',
    '[style.--${n}-icon-stroke-width]': 'strokeCss()'
  },
  template: '<span class="${n}-icon__inner" [innerHTML]="html()"></span>',
  styles: [
${HOST_STYLE(n)}
  ]
})
export class ${C} {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly registry = inject(${reg});

  readonly name = input<${C}Name | ${C}DeprecatedName | undefined>(undefined);
  /** icon object imported from './icons' (wins over name) */
  readonly icon = input<${C}Data | undefined>(undefined);
  readonly size = input<string | number | undefined>(undefined);
  readonly color = input<string | undefined>(undefined);
  readonly strokeWidth = input<number | string | undefined>(undefined);
  readonly label = input<string | undefined>(undefined);

  protected readonly sizeCss = computed(() => {
    const s = this.size();
    return s === undefined || s === '' ? null : typeof s === 'number' ? s + 'px' : s;
  });

  /** explicit strokeWidth wins; otherwise the plugin's weight-by-size table (when that policy is used) */
  protected readonly strokeCss = computed(() => this.strokeWidth() ?? ${c}StrokeFor(this.size()));

  protected readonly html = computed(() => {
    const name = this.name();
    const data = this.icon() ?? (name ? this.registry.get(name) : undefined);
    if (!data) return '';
    // Trusted, generated markup (not user input).
    return this.sanitizer.bypassSecurityTrustHtml(${c}Svg(data));
  });
}
`
}

function classic(b: BuildInput): string {
  const { n, C, c, reg } = names(b)
  return `import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ${C}Data, ${C}DeprecatedName, ${C}Name, ${c}StrokeFor, ${c}Svg } from './icon-data';
import { ${reg} } from './${n}-icon-registry';

/**
 * <${n}-icon name="…"></${n}-icon>          looked up by name (registered icons, otherwise its category loads lazily)
 * <${n}-icon [icon]="${c}Home"></${n}-icon>  imported directly: synchronous and tree-shakable
 * (Angular 14+, standalone, classic @Input)
 * Customise via inputs or CSS variables: --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2, --${n}-icon-stroke-width.
 * Pass [label] for meaningful icons; without it the icon is decorative (aria-hidden).
 */
@Component({
  selector: '${n}-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="${n}-icon__inner" [innerHTML]="html"></span>',
  styles: [
${HOST_STYLE(n)}
  ]
})
export class ${C} implements OnChanges, OnInit, OnDestroy {
  @Input() name?: ${C}Name | ${C}DeprecatedName;
  /** icon object imported from './icons' (wins over name) */
  @Input() icon?: ${C}Data;
  @Input() size?: string | number;
  @Input() color?: string;
  @Input() strokeWidth?: number | string;
  @Input() label?: string;

  html: SafeHtml = '';
  private sub?: Subscription;

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly registry: ${reg},
    private readonly cdr: ChangeDetectorRef
  ) {}

  @HostBinding('attr.role') get role(): string | null { return this.label ? 'img' : null; }
  @HostBinding('attr.aria-label') get ariaLabel(): string | null { return this.label || null; }
  @HostBinding('attr.aria-hidden') get ariaHidden(): string | null { return this.label ? null : 'true'; }
  @HostBinding('style.--${n}-icon-size') get sizeVar(): string | null {
    return this.size === undefined || this.size === '' ? null : typeof this.size === 'number' ? this.size + 'px' : this.size;
  }
  @HostBinding('style.--${n}-icon-color') get colorVar(): string | null { return this.color || null; }
  @HostBinding('style.--${n}-icon-stroke-width') get strokeVar(): string | number | null {
    return this.strokeWidth !== undefined ? this.strokeWidth : ${c}StrokeFor(this.size);
  }

  ngOnInit(): void {
    // a lazily loaded category arrived
    this.sub = this.registry.changes.subscribe(() => {
      this.render();
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private render(): void {
    const data = this.icon ?? (this.name ? this.registry.get(this.name) : undefined);
    // Trusted, generated markup (not user input).
    this.html = data ? this.sanitizer.bypassSecurityTrustHtml(${c}Svg(data)) : '';
  }
}
`
}

// ------------------------------------------------------------------ sprite
function spriteService(b: BuildInput): string {
  const { n, P, k } = names(b)
  return `import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, InjectionToken, Optional, Provider } from '@angular/core';

export interface ${P}SpriteConfig {
  /** where the sprite file is served, e.g. '/assets/${n}-sprite.svg' */
  url: string;
  /**
   * false (default): reference the file with <use href="url#id"> (same origin only).
   * true: fetch it once and insert it into the page, so icons use <use href="#id"> (works cross-origin with CORS, and in older browsers).
   */
  inline?: boolean;
}

export const ${k}_SPRITE = new InjectionToken<${P}SpriteConfig>('${n} sprite');

/** Sprite strategy: providers: [provide${P}Sprite({ url: '/assets/${n}-sprite.svg', inline: true })] */
export function provide${P}Sprite(config: ${P}SpriteConfig): Provider {
  return { provide: ${k}_SPRITE, useValue: config };
}

@Injectable({ providedIn: 'root' })
export class ${P}SpriteLoader {
  private started = false;
  readonly config: ${P}SpriteConfig | null;

  constructor(@Optional() @Inject(${k}_SPRITE) config: ${P}SpriteConfig | null, @Inject(DOCUMENT) private readonly doc: Document) {
    this.config = config;
  }

  /** href for an icon symbol */
  href(name: string): string {
    const id = '${n}-' + name;
    return this.config && !this.config.inline ? this.config.url + '#' + id : '#' + id;
  }

  /** inline mode: fetch the sprite once */
  ensure(): void {
    if (this.started || !this.config?.inline) return;
    this.started = true;
    fetch(this.config.url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('sprite ' + r.status))))
      .then((svg) => {
        const holder = this.doc.createElement('div');
        holder.setAttribute('aria-hidden', 'true');
        holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        holder.innerHTML = svg;
        this.doc.body.prepend(holder);
      })
      .catch(() => { this.started = false; });
  }
}
`
}

function spriteIconModern(b: BuildInput): string {
  const { n, P, C, k, c } = names(b)
  return `import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ${C}DeprecatedName, ${C}Name, ${c}StrokeFor, ${k}_DEPRECATED } from './icon-data';
import { ${P}SpriteLoader } from './${n}-sprite';

/**
 * <${n}-sprite-icon name="…" />   renders from the sprite file (<use>): one request, cached, nothing per icon in your JS.
 * Configure with provide${P}Sprite({ url, inline }). Same inputs and CSS variables as <${n}-icon>.
 */
@Component({
  selector: '${n}-sprite-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[style.--${n}-icon-size]': 'sizeCss()',
    '[style.--${n}-icon-color]': 'color() || null',
    '[style.--${n}-icon-stroke-width]': 'strokeCss()'
  },
  template: '<svg width="100%" height="100%" fill="none" focusable="false" aria-hidden="true"><use [attr.href]="href()"/></svg>',
  styles: [
    ':host{display:inline-block;width:var(--${n}-icon-size,1em);height:var(--${n}-icon-size,1em);flex:none;line-height:0;vertical-align:-0.125em}',
    'svg{display:block}'
  ]
})
export class ${P}SpriteIcon {
  private readonly sprite = inject(${P}SpriteLoader);

  readonly name = input.required<${C}Name | ${C}DeprecatedName>();
  readonly size = input<string | number | undefined>(undefined);
  readonly color = input<string | undefined>(undefined);
  readonly strokeWidth = input<number | string | undefined>(undefined);
  readonly label = input<string | undefined>(undefined);

  protected readonly sizeCss = computed(() => {
    const s = this.size();
    return s === undefined || s === '' ? null : typeof s === 'number' ? s + 'px' : s;
  });
  protected readonly strokeCss = computed(() => this.strokeWidth() ?? ${c}StrokeFor(this.size()));
  protected readonly href = computed(() => {
    this.sprite.ensure();
    const requested = this.name();
    return this.sprite.href((${k}_DEPRECATED as Record<string, string>)[requested] ?? requested);
  });
}
`
}

function spriteIconClassic(b: BuildInput): string {
  const { n, P, C, k, c } = names(b)
  return `import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { ${C}DeprecatedName, ${C}Name, ${c}StrokeFor, ${k}_DEPRECATED } from './icon-data';
import { ${P}SpriteLoader } from './${n}-sprite';

/**
 * <${n}-sprite-icon name="…"></${n}-sprite-icon>   renders from the sprite file (<use>): one request, cached, nothing per icon in your JS.
 * Configure with provide${P}Sprite({ url, inline }). Same inputs and CSS variables as <${n}-icon>.
 */
@Component({
  selector: '${n}-sprite-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<svg width="100%" height="100%" fill="none" focusable="false" aria-hidden="true"><use [attr.href]="href"/></svg>',
  styles: [
    ':host{display:inline-block;width:var(--${n}-icon-size,1em);height:var(--${n}-icon-size,1em);flex:none;line-height:0;vertical-align:-0.125em}',
    'svg{display:block}'
  ]
})
export class ${P}SpriteIcon {
  @Input() name!: ${C}Name | ${C}DeprecatedName;
  @Input() size?: string | number;
  @Input() color?: string;
  @Input() strokeWidth?: number | string;
  @Input() label?: string;

  constructor(private readonly sprite: ${P}SpriteLoader) {}

  get href(): string {
    this.sprite.ensure();
    return this.sprite.href((${k}_DEPRECATED as Record<string, string>)[this.name] ?? this.name);
  }
  @HostBinding('attr.role') get role(): string | null { return this.label ? 'img' : null; }
  @HostBinding('attr.aria-label') get ariaLabel(): string | null { return this.label || null; }
  @HostBinding('attr.aria-hidden') get ariaHidden(): string | null { return this.label ? null : 'true'; }
  @HostBinding('style.--${n}-icon-size') get sizeVar(): string | null {
    return this.size === undefined || this.size === '' ? null : typeof this.size === 'number' ? this.size + 'px' : this.size;
  }
  @HostBinding('style.--${n}-icon-color') get colorVar(): string | null { return this.color || null; }
  @HostBinding('style.--${n}-icon-stroke-width') get strokeVar(): string | number | null {
    return this.strokeWidth !== undefined ? this.strokeWidth : ${c}StrokeFor(this.size);
  }
}
`
}

// ------------------------------------------------------------------ readme
function readme(b: BuildInput, flavour: 'modern' | 'classic', withSprite: boolean): string {
  const { n, C, P, c, provide } = names(b)
  const first = b.icons[0]
  const range = flavour === 'modern' ? 'Angular 17.1 or newer (signal inputs)' : 'Angular 14 or newer (standalone + @Input)'
  const constant = first ? constName(b, first) : `${c}Home`
  return `# ${n} icons — Angular (${flavour})

Supports ${range}. No FontAwesome or other dependency.

## Three ways to use an icon

1. **Import the icons you use** (synchronous, tree-shakable; the bundle contains only these):
\`\`\`ts
import { ${C}, ${constant} } from './${flavour === 'modern' ? 'angular' : 'angular-classic'}';

@Component({ standalone: true, imports: [${C}], template: \`<${n}-icon [icon]="home" />\` })
export class Demo { home = ${constant}; }
\`\`\`
2. **By name** (\`<${n}-icon name="${first?.name ?? 'name'}" />\`). Icons you registered with \`${provide}(…)\` render at once; any other icon loads its **category** as a lazy chunk the first time it is used (first paint is empty, then the icon appears). Call \`inject(${P}IconRegistry).preload('<category>')\` to warm a category.
3. **Everything synchronously** (large bundle): \`import { provide${P}AllIcons } from './all-icons'\` and \`providers: [provide${P}AllIcons()]\`.
${withSprite ? `
## Sprite strategy
\`<${n}-sprite-icon name="…" />\` draws from \`sprite/${n}-sprite.svg\` through \`<use>\`: one cached request, no per-icon JS.
\`\`\`ts
providers: [provide${P}Sprite({ url: '/assets/${n}-sprite.svg', inline: true })]
\`\`\`
\`inline: true\` fetches the sprite once and inserts it in the page (use for another origin or older browsers); without it the component references the file directly (same origin).
` : ''}
Inputs: \`name\` (typed), \`icon\`, \`size\`, \`color\`, \`strokeWidth\`, \`label\`.
CSS variables: \`--${n}-icon-size\`, \`--${n}-icon-color\`, \`--${n}-icon-color-2…\`, \`--${n}-icon-stroke-width\`.

Icons: ${b.icons.length}. \`icon-data.ts\` has the typed name list (\`${C}Name\`); \`icons/\` has one file per icon.
`
}

export function angularFiles(b: BuildInput, flavour: 'modern' | 'classic'): Files {
  const dir = flavour === 'modern' ? 'angular' : 'angular-classic'
  const { n, C, P, reg, provide } = names(b)
  const sprite = b.settings.formats.sprite
  const out: Files = {
    ...iconDataFiles(b, dir),
    [`${dir}/${n}-icon-registry.ts`]: flavour === 'modern' ? registryModern(b) : registryClassic(b),
    [`${dir}/${n}-icon.component.ts`]: flavour === 'modern' ? modern(b) : classic(b),
    [`${dir}/all-icons.ts`]: allIcons(b),
    [`${dir}/README.md`]: readme(b, flavour, sprite)
  }
  const lines = [
    `export * from './icon-data';`,
    `export * from './icons/index';`,
    `export { ${reg}, ${provide} } from './${n}-icon-registry';`,
    `export { ${C} } from './${n}-icon.component';`
  ]
  if (sprite) {
    out[`${dir}/${n}-sprite.ts`] = spriteService(b)
    out[`${dir}/${n}-sprite-icon.component.ts`] = flavour === 'modern' ? spriteIconModern(b) : spriteIconClassic(b)
    lines.push(`export { ${P}SpriteLoader, provide${P}Sprite } from './${n}-sprite';`, `export type { ${P}SpriteConfig } from './${n}-sprite';`, `export { ${P}SpriteIcon } from './${n}-sprite-icon.component';`)
  }
  out[`${dir}/index.ts`] = lines.join('\n') + '\n'
  return out
}
