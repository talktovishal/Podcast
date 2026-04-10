export const appShellItemBaseClass =
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 disabled:cursor-not-allowed disabled:opacity-60";

export const appShellNeutralItemClass = `${appShellItemBaseClass} border-[rgba(31,42,31,0.12)] bg-white text-[var(--ink)] hover:border-slate-300 hover:bg-slate-50`;

export const appShellAccentItemClass = `${appShellItemBaseClass} border-[rgba(31,122,90,0.24)] bg-[rgba(223,243,236,0.5)] text-[var(--ink)] hover:border-[rgba(31,122,90,0.32)] hover:bg-[rgba(223,243,236,0.68)]`;

export const appShellSelectedItemClass = `${appShellItemBaseClass} border-[rgba(31,122,90,0.32)] bg-[rgba(223,243,236,0.92)] text-[var(--ink)] shadow-[0_8px_20px_rgba(31,122,90,0.12)]`;

export const appShellWarningItemClass = `${appShellItemBaseClass} border-[#d9d0a7] bg-[#fff9e8] text-[#6f5400] hover:border-[#cbbf8b] hover:bg-[#fff4d2]`;

export const appShellDangerItemClass = `${appShellItemBaseClass} border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f] hover:border-[#ebb3ae] hover:bg-[#ffeaea]`;

export const appShellUtilityItemClass = `${appShellItemBaseClass} gap-2 px-3 md:w-10 md:px-0`;
