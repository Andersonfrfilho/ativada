// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useToastLifetime } from '../src/notices/useToastLifetime.hook.js';

const EXPIRE_MILLISECONDS = 80;
const RERENDER_MILLISECONDS = 30;

type ProbeProps = { readonly tick: number; readonly onExpire: () => void };

function Probe(props: ProbeProps): ReactElement {
  useToastLifetime({
    milliseconds: EXPIRE_MILLISECONDS,
    version: 1,
    isPending: false,
    onExpire: props.onExpire,
  });
  return <span>{props.tick}</span>;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('o aviso na tela some no prazo mesmo com a tela renderizando de novo', () => {
  test('uma função nova a cada render não reinicia o relógio de 8 s', async () => {
    let expirations = 0;
    const view = render(<Probe tick={0} onExpire={() => (expirations += 1)} />);
    for (let tick = 1; tick <= 2; tick += 1) {
      await act(async () => {
        await wait(RERENDER_MILLISECONDS);
        view.rerender(<Probe tick={tick} onExpire={() => (expirations += 1)} />);
      });
    }
    await act(async () => wait(RERENDER_MILLISECONDS + 10));
    expect(expirations).toBe(1);
  });
});
