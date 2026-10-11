// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import styles from './Card.module.css';

export type CardProps = {
  readonly title: string;
  readonly children: ReactNode;
};

// Uma ideia por cartão: o título nomeia a região para leitores de tela.
export function Card({ title, children }: CardProps): ReactElement {
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>
      {children}
    </section>
  );
}
