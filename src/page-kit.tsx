// What the quiz's own pages are drawn with. The list and the builder use the host's kit;
// a quiz, a course, its scores, and a result take Bible Academy's look (Quizzes REQ36),
// a surface of the plugin's own, styled only with the page's tokens so a theme holds.
import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import { Notice, SkeletonBar, Stack, useFileChanges, usePluginHost, type PluginHost } from 'eidosmd/page';

export const CSS = `
.qz { max-width: 880px; margin: 0 auto; padding: 4px 0 56px; font-size: var(--text-body); line-height: 1.6; color: var(--color-fg); }
.qz a { color: inherit; text-decoration: none; }
.qz a.qz-link { color: var(--color-accent); }
.qz a.qz-link:hover { text-decoration: underline; }
.qz-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; margin-bottom: 12px; border-radius: 999px; background: var(--color-accent-soft); color: var(--color-accent) !important; font-size: var(--text-xs); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.qz-eyebrow::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.qz-h1 { margin: 0 0 6px; font-size: var(--text-6xl); font-weight: 700; line-height: 1.15; letter-spacing: -.03em; }
.qz-h2 { margin: 34px 0 12px; font-size: var(--text-3xl); font-weight: 700; letter-spacing: -.02em; }
.qz-card { min-width: 0; padding: 18px 20px; background: var(--color-raised); border: 1px solid var(--color-line); border-radius: var(--radius-3xl); }
.qz-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.qz-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.qz-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 8px 18px; border: 1px solid var(--color-accent); border-radius: 999px; background: var(--color-accent); color: var(--color-on-accent) !important; font: inherit; font-size: var(--text-md); font-weight: 600; white-space: nowrap; cursor: pointer; }
.qz-btn:hover { background: var(--color-accent-strong); border-color: var(--color-accent-strong); }
.qz-btn.secondary { background: transparent; color: var(--color-accent) !important; }
.qz-btn.secondary:hover { background: var(--color-accent-soft); border-color: var(--color-accent); }
.qz-btn:disabled { opacity: .4; cursor: default; }
.qz-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.qz-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; background: var(--color-hover); color: var(--color-muted); font-size: var(--text-sm); font-weight: 600; white-space: nowrap; }
.qz-badge.accent { background: var(--color-accent-soft); color: var(--color-accent); }
.qz-badge.good { background: color-mix(in srgb, var(--color-ok) 15%, transparent); color: var(--color-ok); }
.qz-progress { height: 8px; margin: 10px 0 4px; overflow: hidden; border-radius: 999px; background: var(--color-hover); }
.qz-progress > div { height: 100%; border-radius: 999px; background: var(--color-accent); }
.qz-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 0 0 18px; }
.qz-stat { padding: 16px 18px; background: var(--color-raised); border: 1px solid var(--color-line); border-radius: var(--radius-3xl); }
.qz-stat.hero { background: linear-gradient(160deg, var(--color-accent-soft), var(--color-raised) 70%); border-color: color-mix(in srgb, var(--color-accent) 35%, transparent); }
.qz-stat-label { color: var(--color-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.qz-stat-value { margin: 5px 0 3px; font-size: 38px; font-weight: 800; line-height: 1.1; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.qz-stat-sub { color: var(--color-muted); font-size: var(--text-sm); }
.qz-up { color: var(--color-ok); font-weight: 600; }
.qz-down { color: var(--color-error); font-weight: 600; }
.qz-muted { color: var(--color-muted); }
.qz-small { font-size: var(--text-sm); }
.qz-prompt { margin: 20px 0; font-size: var(--text-4xl); font-weight: 700; line-height: 1.35; letter-spacing: -.02em; white-space: pre-wrap; }
.qz-option { display: block; width: 100%; min-height: 44px; margin-bottom: 10px; padding: 14px 18px; border: 1px solid var(--color-line); border-radius: var(--radius-3xl); background: var(--color-raised); color: var(--color-fg); font: inherit; font-weight: 500; line-height: 1.45; text-align: left; cursor: pointer; }
.qz-option:hover:not(:disabled) { border-color: var(--color-accent); background: var(--color-hover); }
.qz-option:disabled { cursor: default; }
.qz-option.correct { border-color: var(--color-ok); background: color-mix(in srgb, var(--color-ok) 12%, transparent); }
.qz-option.wrong { border-color: var(--color-error); background: color-mix(in srgb, var(--color-error) 12%, transparent); }
.qz-feedback { margin: 18px 0; padding: 12px 16px; border-left: 3px solid var(--color-line); border-radius: 0 12px 12px 0; background: var(--color-raised); white-space: pre-wrap; }
.qz-feedback.correct { border-left-color: var(--color-ok); }
.qz-feedback.wrong { border-left-color: var(--color-error); }
.qz-hero { padding: 34px 20px; text-align: center; }
.qz-score { margin: 10px 0; color: var(--color-accent); font-size: 88px; font-weight: 800; line-height: 1; letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
.qz-review { padding: 14px 0; border-top: 1px solid var(--color-line); }
.qz-yes { color: var(--color-ok); font-weight: 700; }
.qz-no { color: var(--color-error); font-weight: 700; }
.qz-scroll { overflow-x: auto; }
.qz-table { width: 100%; border-collapse: collapse; }
.qz-table th, .qz-table td { padding: 10px 6px; border-bottom: 1px solid var(--color-line); text-align: left; font-variant-numeric: tabular-nums; }
.qz-table th { color: var(--color-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.qz-table .num { text-align: right; }
.qz-table button.qz-sort { padding: 0; border: 0; background: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
.qz-table button.qz-rowlink { padding: 0; border: 0; background: none; color: inherit; font: inherit; font-weight: 500; text-align: left; cursor: pointer; }
.qz-table button.qz-rowlink:hover { color: var(--color-accent); }
.qz-tabs { display: flex; gap: 2px; margin-bottom: 18px; overflow: auto hidden; box-shadow: inset 0 -1px 0 var(--color-line); font-size: var(--text-base); }
.qz-tab { padding: 8px 12px; border-bottom: 2px solid transparent; color: var(--color-muted) !important; white-space: nowrap; }
.qz-tab:hover { color: var(--color-fg) !important; }
.qz-tab[aria-current] { border-color: var(--color-accent); color: var(--color-fg) !important; }
.qz-props { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 6px 12px; align-items: center; margin: 10px 0 16px; font-size: var(--text-base); }
.qz-props dt { color: var(--color-muted); }
.qz-props dd { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; margin: 0; }
.qz-pill { display: inline-flex; align-items: center; gap: 4px; max-width: 280px; height: 22px; padding: 0 8px; overflow: hidden; border: 1px solid var(--color-line-strong); border-radius: 11px; background: none; color: inherit; font-size: var(--text-sm); white-space: nowrap; text-overflow: ellipsis; }
.qz-pill button { padding: 0; border: 0; background: none; color: var(--color-muted); font: inherit; cursor: pointer; }
.qz-pill button:hover { color: var(--color-fg); }
.qz-add { display: inline-flex; align-items: center; min-width: max-content; border-radius: var(--radius-md); color: var(--color-faint); font-size: var(--text-base); cursor: pointer; }
.qz-add:hover { background: var(--color-hover); color: var(--color-fg); }
.qz-add [aria-haspopup=listbox] { padding: 1px 6px; border-color: transparent; background: transparent; color: inherit; }
.qz-add [aria-haspopup=listbox]:hover { border-color: var(--color-line); }
.qz-help { display: inline-flex; vertical-align: -2px; color: var(--color-faint); cursor: help; }
.qz-help:hover, .qz-help:focus-visible { color: var(--color-fg); }
.qz-user { padding-left: 3px; }
.qz-avatar { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--color-accent-soft); color: var(--color-accent-strong); font-size: var(--text-3xs); font-weight: 700; }
.qz-me { color: var(--color-accent-strong); font-weight: 600; }
.qz-bars { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: end; height: 150px; }
.qz-bar { display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; height: 100%; color: var(--color-muted); font-size: var(--text-sm); text-align: center; }
.qz-bar i { display: block; min-height: 2px; border-radius: 4px 4px 0 0; background: var(--color-line-strong); }
.qz-bar.mine { color: var(--color-fg); font-weight: 600; }
.qz-bar.mine i { background: var(--color-accent); }
.qz-barlabels { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-line); color: var(--color-muted); font-size: var(--text-sm); text-align: center; }
.qz-barlabels .mine { color: var(--color-accent); font-weight: 600; }
.qz-move { display: inline-flex; flex-direction: column; gap: 2px; }
.qz-move button { display: flex; align-items: center; justify-content: center; width: 24px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--color-muted); cursor: pointer; }
.qz-move button:hover:not(:disabled) { background: var(--color-hover); color: var(--color-fg); }
.qz-move button:disabled { opacity: .3; cursor: default; }
.qz-quiz { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 10px; padding: 14px 16px; }
.qz-builder { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.qz-qlist { flex: 1 1 250px; max-width: 320px; overflow: hidden; border: 1px solid var(--color-line); border-radius: var(--radius-xl); }
.qz-qrow { display: flex; gap: 8px; width: 100%; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--color-line); background: none; color: inherit; font: inherit; font-size: var(--text-sm); text-align: left; cursor: pointer; }
.qz-qrow:last-child { border-bottom: 0; }
.qz-qrow:hover { background: var(--color-hover); }
.qz-qrow[aria-current] { background: var(--color-accent-soft); }
.qz-qrow span:last-child { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.qz-qform { display: flex; flex: 999 1 420px; flex-direction: column; gap: 14px; min-width: 0; max-width: 720px; }
.qz-label { display: block; margin-bottom: 4px; color: var(--color-muted); font-size: var(--text-sm); }
.qz-key { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.qz-key input[type=radio] { flex: none; width: 16px; height: 16px; accent-color: var(--color-ok); }
.qz-aux { padding: 0 12px 12px; font-size: var(--text-base); }
@media (max-width: 760px) { .qz-h1 { font-size: 26px; } .qz-score { font-size: 68px; } .qz-prompt { font-size: var(--text-2xl); } .qz-qlist { max-width: none; } }
`;

export function Surface({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <style>{CSS}</style>
      {children}
    </>
  );
}

export const asPercent = (fraction: number | null | undefined): string => (fraction === null || fraction === undefined ? '-' : `${Math.round(fraction * 100)}%`);

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Change between two fractions, in percentage points, as the Academy says it.
export function Delta({ change, suffix }: { change: number | null | undefined; suffix: string }): JSX.Element | null {
  if (change === null || change === undefined) return null;
  const points = Math.round(change * 100);
  if (points === 0) return <span>Same as {suffix.replace(/^vs /, '')}</span>;
  return (
    <span>
      <span className={points > 0 ? 'qz-up' : 'qz-down'}>
        {points > 0 ? '+' : '−'}
        {Math.abs(points)}
      </span>{' '}
      {suffix}
    </span>
  );
}

export function Stat({ label, value, sub, hero }: { label: string; value: ReactNode; sub?: ReactNode; hero?: boolean }): JSX.Element {
  return (
    <div className={`qz-stat${hero ? ' hero' : ''}`}>
      <div className="qz-stat-label">{label}</div>
      <div className="qz-stat-value">{value}</div>
      {sub !== undefined && <div className="qz-stat-sub">{sub}</div>}
    </div>
  );
}

// What a heading means, behind a ? (the design system's HelpMark, which the kit does not hand a plugin yet).
export function HelpMark({ tip }: { tip: string }): JSX.Element {
  return (
    <span className="qz-help" tabIndex={0} role="img" aria-label={tip} data-tip={tip} data-tip-pos="right" data-tip-now="">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M6.2 6.2a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.3M8 11.6h.01" />
      </svg>
    </span>
  );
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');

// A person as the page's own pills draw one: their initials in a round mark, then their name, in the accent when it is you.
export function UserPill({ alias, name, children }: { alias: string; name?: string | null | undefined; children?: ReactNode }): JSX.Element {
  const host = usePluginHost();
  const shown = name ?? alias;
  const me = host.user?.alias === alias;
  return (
    <span className="qz-pill qz-user" title={`@${alias}`}>
      <span className="qz-avatar" aria-hidden="true">
        {initialsOf(shown)}
      </span>
      <span className={me ? 'qz-me' : undefined}>{shown}</span>
      {children}
    </span>
  );
}

export function LaptopMark(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Local">
      <path d="M5 6h14v10H5zM3 19h18" />
    </svg>
  );
}

export function Loading(): JSX.Element {
  return (
    <div className="qz">
      <Stack gap="md">
        <SkeletonBar width={180} height={20} />
        <SkeletonBar width="70%" height={34} />
        <SkeletonBar width="100%" height={110} />
        <SkeletonBar width="100%" height={210} />
      </Stack>
    </div>
  );
}

export function Failed({ message }: { message: string }): JSX.Element {
  return (
    <div className="qz">
      <Notice tone="error">{message}</Notice>
    </div>
  );
}

const message = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

// A route's answer, fetched again whenever a file of the plugin's or a blueprint changes on disk.
export function useData<T>(path: string | null): { data: T | null; error: string | null; reload: () => void } {
  const host = usePluginHost();
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null });
  const load = useCallback(() => {
    if (path === null) return;
    host.get<T>(path).then(
      (data) => setState({ path, data, error: null }),
      (cause: unknown) => setState({ path, data: null, error: message(cause) }),
    );
  }, [host, path]);
  useEffect(load, [load]);
  useFileChanges(load);
  const current = state.path === path;
  return { data: current ? state.data : null, error: current ? state.error : null, reload: load };
}

// Runs a change, saying a failure in a toast.
export function useAct(): (title: string, work: () => Promise<unknown>) => Promise<boolean> {
  const host: PluginHost = usePluginHost();
  return useCallback(
    async (title, work) => {
      try {
        await work();
        return true;
      } catch (cause) {
        host.toast(title, 'error', message(cause));
        return false;
      }
    },
    [host],
  );
}
