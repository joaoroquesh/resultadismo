// Barrel de entrada para o design-sync (claude.ai/design).
// Reexporta os componentes do design system Resultadismo para o bundle
// window.ResultaDS. NÃO é usado pelo app — só pelo conversor (esbuild resolve
// os aliases @/ via tsconfig.app.json). Ver .design-sync/config.json.
export * from "@/components/ui/Avatar";
export * from "@/components/ui/Badge";
export * from "@/components/ui/Button";
export * from "@/components/ui/Card";
export * from "@/components/ui/Coachmark";
export * from "@/components/ui/Combobox";
export * from "@/components/ui/ConfirmDialog";
export * from "@/components/ui/CrestEditor";
export * from "@/components/ui/CrestMask";
export * from "@/components/ui/EmptyState";
export * from "@/components/ui/Escudo";
export * from "@/components/ui/Input";
export * from "@/components/ui/Modal";
export * from "@/components/ui/ScrollRow";
export * from "@/components/ui/SegmentedControl";
export * from "@/components/ui/Select";
export * from "@/components/ui/Skeleton";
export * from "@/components/ui/SortControl";
export * from "@/components/ui/Spinner";
export * from "@/components/ui/Switch";
export * from "@/components/ui/Toast";
export * from "@/components/ScorePill";
