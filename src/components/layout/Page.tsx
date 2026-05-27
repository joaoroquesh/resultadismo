import { type ReactNode } from "react";
import { Header } from "./Header";

export function Page({
  title,
  action,
  children,
  wide = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      {/* topo mobile */}
      <Header title={title} action={action} />
      <main
        className={`mx-auto w-full px-4 pb-24 pt-4 lg:px-8 lg:pb-12 lg:pt-8 ${
          wide ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        {/* cabeçalho desktop */}
        {title && (
          <div className="mb-6 hidden items-center justify-between gap-4 lg:flex">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-950">{title}</h1>
            {action}
          </div>
        )}
        {children}
      </main>
    </>
  );
}
