import { Button, Checkbox, Textbox, Toggle } from '@create-figma-plugin/ui'
import { Fragment, h } from 'preact'
import { useState } from 'preact/hooks'
import { TARGETS } from '../core/generators'
import { HOSTS, parseRepoInput } from '../core/gitHost'
import { cleanNamespace } from '../core/naming'
import { groupOutputs, newOutput, packagesOf } from '../core/outputs'
import { MAX_OUTPUTS } from '../core/settingsSchema'
import { OutputSettings, Settings } from '../types'
import { Field } from './components/Field'
import { Segmented } from './components/Segmented'
import styles from './styles'
import { plural } from './util'

/** Settings → Output: where the packages go. A local ZIP always has every package; each repository output takes a subset into its own folder. */
export function OutputsTab(props: {
  settings: Settings
  patch: (p: Partial<Settings>) => void
  testMessages: Record<string, string>
  problems: Record<string, string[]>
  onTest: (o: OutputSettings) => void
}) {
  const { settings, patch } = props
  const ns = cleanNamespace(settings.namespace)
  const [hostNotes, setHostNotes] = useState<Record<string, string>>({})
  const enabled = TARGETS.filter((t) => settings.formats[t.key])
  const setOutput = (id: string, p: Partial<OutputSettings>) => patch({ outputs: settings.outputs.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const groups = groupOutputs(settings.outputs, settings.formats)
  const hosts = [...new Set(settings.outputs.map((o) => o.provider))]
  return (
    <Fragment>
      <div class={styles.section}>
        <span class={styles.sectionTitle}>Local export</span>
        <div class={styles.muted}>Export downloads one ZIP with every package you chose on the Packages tab.</div>
        <Field label="ZIP file name" info={{ title: 'ZIP name', body: <span>File name of the downloaded ZIP. Leave empty to use <code>{ns}-icons.zip</code>.</span> }}>
          <Textbox value={settings.zipName} onValueInput={(v) => patch({ zipName: v })} placeholder={`${ns}-icons`} />
        </Field>
      </div>

      <div class={styles.section}>
        <span class={styles.sectionTitle}>Repositories</span>
        <div class={styles.muted}>
          Publish creates a branch and a pull request (GitHub) or merge request (GitLab) for review. Add one output per destination: a monorepo is several outputs with different folders, separate repositories are outputs on different repositories. Outputs on the same repository are published together as one branch and one request.
        </div>
        {settings.outputs.length === 0 && <div class={styles.muted}>No repository yet. The local ZIP above works without one.</div>}
        {settings.outputs.map((o, i) => {
          const issues = props.problems[o.id] ?? []
          const own = o.packages !== null
          const shown = packagesOf(o, settings.formats)
          return (
            <div key={o.id} class={styles.section} style={{ borderTop: i ? '1px solid var(--figma-color-border)' : undefined, paddingTop: i ? 12 : 0 }}>
              <div class={styles.fieldRow}>
                <div class={styles.grow}>
                  <Textbox value={o.name} onValueInput={(v) => setOutput(o.id, { name: v })} placeholder={`Output ${i + 1} name (optional)`} />
                </div>
                <Button secondary onClick={() => patch({ outputs: settings.outputs.filter((x) => x.id !== o.id) })}>Remove</Button>
              </div>
              <Field label="Packages" info={{ title: 'Packages', body: <span>Which of the packages you switched on in the Packages tab this output receives. Every output also gets <code>icons.json</code>, the README, the config and the changelog, so each folder describes itself and can be used as the baseline.</span> }}>
                <div>
                  <Toggle value={!own} onValueChange={(all) => setOutput(o.id, { packages: all ? null : enabled.map((t) => t.key) })}>
                    All packages that are on ({enabled.length})
                  </Toggle>
                  {own && (
                    <div style={{ display: 'grid', gap: 4, paddingTop: 6 }}>
                      {enabled.map((t) => (
                        <Checkbox key={t.key} value={o.packages!.includes(t.key)} onValueChange={(on) => setOutput(o.id, { packages: on ? [...o.packages!, t.key] : o.packages!.filter((k) => k !== t.key) })}>
                          {t.label}
                        </Checkbox>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Host">
                <Segmented value={o.provider} onValueChange={(v) => setOutput(o.id, { provider: v })} label="Git host" options={[{ value: 'github', children: 'GitHub' }, { value: 'gitlab', children: 'GitLab' }]} />
              </Field>
              <Field label="Repository" info={{ title: 'Repository', body: <span>The repository that receives the files: <code>owner/name</code> on GitHub, <code>group/project</code> (subgroups allowed) on gitlab.com. You can paste the repository URL.</span> }}>
                <Textbox
                  value={o.repo}
                  placeholder={o.provider === 'github' ? 'owner/name' : 'group/project'}
                  onValueInput={(v) => {
                    const parsed = parseRepoInput(v)
                    setHostNotes((n) => ({ ...n, [o.id]: parsed?.unsupportedHost ? `${parsed.unsupportedHost} is not supported yet: only github.com and gitlab.com.` : '' }))
                    if (parsed && parsed.provider) setOutput(o.id, { provider: parsed.provider, repo: parsed.repo })
                    else setOutput(o.id, { repo: parsed ? parsed.repo : v })
                  }}
                />
              </Field>
              {hostNotes[o.id] && <div class={styles.sevWarn}>{hostNotes[o.id]}</div>}
              <Field label="Folder in repo" info={{ title: 'Folder', body: <span>Where this output goes inside the repository, e.g. <code>icons</code> or <code>packages/icons-angular</code>. Not the repository root, and not a hidden folder such as <code>.github</code>. Only files this tool published before are ever replaced or removed there. Outputs on the same repository need separate folders.</span> }}>
                <Textbox value={o.subdir} onValueInput={(v) => setOutput(o.id, { subdir: v })} placeholder="icons" />
              </Field>
              <Field label="Branch" info={{ title: 'Branch', body: <span>The new branch to create. Leave empty for <code>icons/update-&lt;date&gt;-&lt;time&gt;</code>. It always branches from the default branch and the default branch is never changed directly. When several outputs share a repository, the first branch name entered is used for all of them.</span> }}>
                <Textbox value={o.branch} onValueInput={(v) => setOutput(o.id, { branch: v })} placeholder="icons/update-<date>-<time>" />
              </Field>
              {issues.map((m) => <div key={m} class={styles.sevWarn}>{m}</div>)}
              <div class={styles.fieldRow}>
                <Button secondary onClick={() => props.onTest(o)} disabled={!settings.tokens[o.provider] || !o.repo}>Test connection</Button>
                <span class={styles.muted}>{props.testMessages[o.id] ?? (shown.length ? plural(shown.length, 'package') : '')}</span>
              </div>
            </div>
          )
        })}
        <div class={styles.fieldRow}>
          <Button secondary onClick={() => patch({ outputs: [...settings.outputs, newOutput(settings.outputs)] })} disabled={settings.outputs.length >= MAX_OUTPUTS}>Add output</Button>
          {groups.length > 1 && <span class={styles.muted}>{plural(groups.length, 'repository')}: each gets its own branch and request.</span>}
        </div>
      </div>

      {hosts.length > 0 && (
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Access tokens</span>
          {hosts.map((host) => (
            <Field key={host} label={HOSTS[host].label} info={{ title: 'Access token', body: <span>{HOSTS[host].tokenHelp} One token per host: every output on that host uses it. It stays on this computer: not part of the team config, not in exports and not in diagnostics.</span> }}>
              <Textbox password value={settings.tokens[host]} onValueInput={(v) => patch({ tokens: { ...settings.tokens, [host]: v.trim() } })} placeholder="paste your token" />
            </Field>
          ))}
          <div class={styles.muted}>The plugin connects to {hosts.map((x) => HOSTS[x].domain).join(' and ')} only when you press Test connection or Publish, and sends only the export and your token. Self-hosted GitLab and other hosts are not supported yet.</div>
        </div>
      )}
    </Fragment>
  )
}
