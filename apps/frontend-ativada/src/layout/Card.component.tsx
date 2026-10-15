// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import styles from './Card.module.css';
import { Icon, type IconName } from './Icon.component.js';

export type CardProps = {
  readonly title: string;
  // Âncora para links de dentro da tela ("#acompanhamento").
  readonly id?: string;
  readonly children: ReactNode;
  // Ícone ao lado do título, só para reforçar a ideia do cartão.
  readonly icon?: IconName;
  // Selo ou texto curto à direita do título (estado do cartão).
  readonly aside?: ReactNode;
};

// Uma ideia por cartão: o título nomeia a região para leitores de tela.
export function Card({ title, children, icon, aside, id }: CardProps): ReactElement {
  const headingId = useId();
  return (
    <section id={id} className={styles.card} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {icon === undefined ? null : (
            <span className={styles.icon}>
              <Icon name={icon} />
            </span>
          )}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
