// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import { APP_NAME } from '../app/app.constant.js';

// RF12: com a aba escondida o título vira "(2) AtivAdA" com os avisos não lidos; ao voltar, o título de sempre.
export function useTabTitle(params: {
  readonly unreadCount: number;
  readonly isHidden: boolean;
}): void {
  const { unreadCount, isHidden } = params;
  useEffect(() => {
    const original = document.title;
    if (isHidden && unreadCount > 0) document.title = `(${unreadCount}) ${APP_NAME}`;
    return (): void => {
      document.title = original;
    };
  }, [unreadCount, isHidden]);
}
