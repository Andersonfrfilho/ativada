// Copyright (c) 2026 Ada Technology. All rights reserved.
export type Rhythm = {
  // Quanto tempo um agente fica parado antes do próximo gesto ou passeio (sorteado entre o mínimo e o máximo).
  readonly idleMinMilliseconds: number;
  readonly idleMaxMilliseconds: number;
  // A reunião na mesa da Alice, na vela nova.
  readonly meetingMilliseconds: number;
  // Quanto tempo um balão fica aberto (um fala por vez).
  readonly turnMilliseconds: number;
  // Um passo de caminhada (uma casa da planta).
  readonly stepMilliseconds: number;
  // Quanto dura um gesto de mãos ou papéis.
  readonly gestureMilliseconds: number;
};

// O ritmo do preview aprovado: ocioso a cada 2–9 s, reunião de ~20 s. O "Calmo" dobra os intervalos e alonga os passos.
export const RHYTHM: Readonly<Record<'lively' | 'calm', Rhythm>> = {
  lively: {
    idleMinMilliseconds: 2000,
    idleMaxMilliseconds: 9000,
    meetingMilliseconds: 20_000,
    turnMilliseconds: 3200,
    stepMilliseconds: 450,
    gestureMilliseconds: 2400,
  },
  calm: {
    idleMinMilliseconds: 4000,
    idleMaxMilliseconds: 18_000,
    meetingMilliseconds: 40_000,
    turnMilliseconds: 6400,
    stepMilliseconds: 700,
    gestureMilliseconds: 3600,
  },
};

export function rhythmOf(isCalm: boolean): Rhythm {
  return isCalm ? RHYTHM.calm : RHYTHM.lively;
}
