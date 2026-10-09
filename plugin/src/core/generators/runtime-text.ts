import { BuildInput } from './common'
import { K } from './icondata'

/**
 * Generated-code fragments that the Angular, React and Web Component outputs have in common (the runtime half of the icon data in
 * icondata.ts). Each framework still writes its own registry and component; these are the lines that mean the same thing in all of them.
 * test/angular.test.ts and test/react-webcomponent.test.ts pin the generated text.
 */

/** the name an icon is looked up by: a renamed icon's old name resolves to the new one */
export const resolveName = (b: BuildInput, expr: string) => `(${K(b)}_DEPRECATED as Record<string, string>)[${expr}] ?? ${expr}`

/** when a looked-up name is missing, start loading its category chunk (`call` is the framework's loader function, `indent` the current indentation) */
export const loadCategoryOfName = (b: BuildInput, call: string, indent: string) =>
  `${indent}const category = ${K(b)}_CATEGORY_OF[name];\n${indent}if (category !== undefined) void ${call}(category);`

export const preloadDoc = (example: string) => `Warm categories ahead of use, e.g. ${example}.`

export const allIconsDoc = (prefer: string) => `Synchronous access to every icon by name. Puts ALL icons in your main bundle; prefer ${prefer}(…) with the icons you use.`

/** the `:host` rule every icon element gets: sized by --<ns>-icon-size, inline with text */
export const hostCss = (n: string) => `:host{display:inline-block;width:var(--${n}-icon-size,1em);height:var(--${n}-icon-size,1em);flex:none;line-height:0;vertical-align:-0.125em}`
