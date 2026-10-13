import { useState } from 'react'
import { MODELS } from '../lib/models'
import type { Settings } from '../lib/types'
import { X } from './Icons'

interface Props {
  settings: Settings
  setSettings: (p: Partial<Settings>) => void
  onClose: () => void
  skillVersion: string
}

export function SettingsDialog({ settings, setSettings, onClose, skillVersion }: Props) {
  const [reveal, setReveal] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70" onClick={onClose}>
      <div className="w-[520px] rounded-lg border border-line-2 bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="font-semibold">Settings</div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="space-y-5 p-4">
          <div>
            <div className="label mb-1">Anthropic API key</div>
            <div className="flex gap-2">
              <input
                className="field font-mono"
                type={reveal ? 'text' : 'password'}
                value={settings.apiKey}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setSettings({ apiKey: e.target.value.trim() })}
              />
              <button type="button" className="btn" onClick={() => setReveal((v) => !v)}>
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="mt-1.5 text-[11px] leading-relaxed text-fg-3">
              Stored only in this browser's local storage. Requests go directly from your browser to api.anthropic.com. Nothing is proxied or
              logged by this app.
            </div>
          </div>

          <div>
            <div className="label mb-1">Workspace ID (optional)</div>
            <input
              className="field font-mono"
              value={settings.workspaceId}
              placeholder="wrkspc_…"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setSettings({ workspaceId: e.target.value.trim() })}
            />
            <div className="mt-1.5 text-[11px] leading-relaxed text-fg-3">
              Needed only if your key is organization-wide rather than scoped to a workspace. Find it in the Anthropic Console under Settings, then
              Workspaces. Sent as the anthropic-workspace-id header.
            </div>
          </div>

          <div>
            <div className="label mb-1">Default model</div>
            <div className="space-y-1">
              {MODELS.map((m) => (
                <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${settings.model === m.id ? 'border-acid-dim bg-panel-2' : 'border-line hover:bg-panel-2'}`}>
                  <input type="radio" name="model" checked={settings.model === m.id} onChange={() => setSettings({ model: m.id })} className="accent-[#c8ff4d]" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-[11px] text-fg-3">{m.blurb}</div>
                  </div>
                  <div className="font-mono text-[11px] text-fg-3">
                    ${m.input} / ${m.output} per MTok
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={settings.fallback} onChange={(e) => setSettings({ fallback: e.target.checked })} className="mt-0.5 accent-[#c8ff4d]" />
              <span>
                Refusal fallback
                <span className="block text-[11px] text-fg-3">If a safety classifier declines, Anthropic re-runs the request on a fallback model (beta).</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={settings.showThinking} onChange={(e) => setSettings({ showThinking: e.target.checked })} className="mt-0.5 accent-[#c8ff4d]" />
              <span>
                Show thinking
                <span className="block text-[11px] text-fg-3">Display the model's summarized reasoning above each reply.</span>
              </span>
            </label>
          </div>

          <div className="rounded-md border border-line bg-ink px-3 py-2 text-[11px] text-fg-3">
            Prompt rules come from the official Seedance 2.5 skill (sd25-pe v{skillVersion}), embedded as the system prompt and cached between turns. Run{' '}
            <span className="font-mono text-fg-2">scripts/sync-skill.sh</span> after updating the skill.
          </div>
        </div>
      </div>
    </div>
  )
}
