import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Check, Link2, ShieldAlert, X } from "lucide-react";
import type { ManagedSkill, SkillInstallTarget } from "../../../../core/managed-skill-library";
import { localize, type LanguageMode } from "../../language";

const TARGET_LABELS: Partial<Record<SkillInstallTarget, string>> = {
  codex: "Codex",
  claude: "Claude Code",
  trae: "Trae",
};

export function SkillTargetDialog({
  open,
  skill,
  busy,
  language,
  onClose,
  onSave,
}: {
  open: boolean;
  skill: ManagedSkill;
  busy: boolean;
  language: LanguageMode;
  onClose: () => void;
  onSave: (targets: SkillInstallTarget[]) => Promise<void>;
}): ReactElement | null {
  const l = (en: string, zh: string) => localize(language, en, zh);
  const [selected, setSelected] = useState<Set<SkillInstallTarget>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(skill.installations
      .filter((installation) => installation.state === "installed")
      .map((installation) => installation.target)));
    setSaving(false);
    setError(null);
  }, [open, skill]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave([...selected]);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop managed-skill-dialog-backdrop" onMouseDown={onClose}>
      <section
        className="command-dialog managed-skill-target-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-target-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="managed-skill-dialog-head">
          <div>
            <h3 id="skill-target-dialog-title">{l("Install Skill", "安装 Skill")}</h3>
            <p>{l(`Choose which agents can use “${skill.name}”.`, `选择哪些 Agent 可以使用“${skill.name}”。`)}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={l("Close", "关闭")}><X size={16} /></button>
        </header>

        <div className="managed-skill-target-options">
          {skill.installations.map((installation) => {
            const checked = selected.has(installation.target);
            const conflict = installation.state === "conflict";
            const label = TARGET_LABELS[installation.target] ?? installation.target;
            return (
              <button
                key={installation.target}
                type="button"
                className={`${checked ? "selected" : ""} ${conflict ? "conflict" : ""}`}
                role="checkbox"
                aria-checked={checked}
                disabled={busy || saving || conflict}
                title={conflict
                  ? l(`An existing ${label} Skill occupies this path.`, `${label} 中已有同名 Skill。`)
                  : installation.path}
                onClick={() => setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(installation.target)) next.delete(installation.target);
                  else next.add(installation.target);
                  return next;
                })}
              >
                <span className="managed-skill-target-option-icon">
                  {conflict ? <ShieldAlert size={15} /> : checked ? <Check size={15} /> : <Link2 size={15} />}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{conflict ? l("Path conflict", "路径冲突") : checked ? l("Will be installed", "将安装") : l("Not installed", "不安装")}</small>
                </span>
              </button>
            );
          })}
        </div>

        {error ? <div className="managed-skill-dialog-error">{error}</div> : null}
        <footer className="managed-skill-dialog-actions">
          <span>{l(`${selected.size} agents selected`, `已选择 ${selected.size} 个 Agent`)}</span>
          <button type="button" onClick={onClose} disabled={saving}>{l("Cancel", "取消")}</button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy || saving}>
            {saving ? l("Saving…", "正在保存…") : l("Save installation", "保存安装")}
          </button>
        </footer>
      </section>
    </div>
  );
}
