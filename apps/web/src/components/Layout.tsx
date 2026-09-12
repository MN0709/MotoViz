import type { ReactNode } from 'react';

export interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <main>
      <h1>摩装智舱（MotoFit AI）</h1>
      {children}
    </main>
  );
}
