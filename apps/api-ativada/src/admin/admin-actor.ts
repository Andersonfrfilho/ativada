// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserId } from '@ativada/database';

export type AdminActor = {
  readonly userId: UserId;
  readonly clientAddress: string;
};
