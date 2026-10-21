export function SelectionInspectorToggle({ collapse = false }: { collapse?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M15 4v16" />
      <path d={collapse ? "m8 9 3 3-3 3" : "m10 9-3 3 3 3"} />
    </svg>
  );
}
