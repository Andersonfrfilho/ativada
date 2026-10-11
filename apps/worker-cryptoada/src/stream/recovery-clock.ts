// Copyright (c) 2026 Ada Technology. All rights reserved.

// Quando terminou a última recuperação de lacunas SEM erro: é o que a simulação ao vivo usa para saber que a Binance já foi
// perguntada depois de ela começar a esperar. Fica em memória de propósito; a contagem que decide mora na execução.
export type RecoveryClock = {
  readonly markCleanRound: () => void;
  // 0 enquanto nenhuma recuperação limpa terminou desde que o worker subiu.
  readonly lastCleanRoundAt: () => number;
};

export function createRecoveryClock(now: () => number): RecoveryClock {
  let lastCleanAt = 0;
  return {
    markCleanRound: (): void => {
      lastCleanAt = now();
    },
    lastCleanRoundAt: (): number => lastCleanAt,
  };
}
