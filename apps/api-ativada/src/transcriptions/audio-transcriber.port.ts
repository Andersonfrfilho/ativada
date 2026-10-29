// Copyright (c) 2026 Ada Technology. All rights reserved.

export type TranscriptionRequest = {
  readonly buffer: Buffer;
  readonly mimeType: string;
};

export type TranscriptionOutput = {
  readonly text: string;
  readonly engine: string;
};

// A porta do motor de transcrição (o `AudioTranscriber` do SDK cabe nela); os testes injetam um falso.
export type AudioTranscriberPort = {
  readonly name: string;
  readonly transcribe: (input: TranscriptionRequest) => Promise<TranscriptionOutput>;
};
