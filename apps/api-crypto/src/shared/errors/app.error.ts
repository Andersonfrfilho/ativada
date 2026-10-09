// Copyright (c) 2026 Ada Technology. All rights reserved.
export type AppErrorParams = {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = new.target.name;
    this.code = params.code;
    this.status = params.status;
    this.headers = params.headers ?? {};
  }
}
