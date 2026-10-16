// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext } from 'react';

import { NoticeCenterContext, type NoticeCenter } from './notice-center.types.js';

export function useNoticeCenter(): NoticeCenter {
  const center = useContext(NoticeCenterContext);
  if (center === undefined) throw new Error('NoticeCenterProvider não envolve esta árvore.');
  return center;
}
