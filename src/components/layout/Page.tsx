import { type ReactNode } from "react";
import { Header } from "./Header";

export function Page({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Header title={title} action={action} />
      <main className="px-4 pb-24 pt-4">{children}</main>
    </>
  );
}
