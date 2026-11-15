import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test, { after } from 'node:test';
import { streamChat } from '../src/eval/client.ts';

const servers = [];
after(() => servers.forEach((server) => server.close()));

const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
const delta = (fields, finishReason = null) => event({ choices: [{ delta: fields, finish_reason: finishReason }] });

/** Serves one scripted event stream: `script(res)` writes the chunks and ends the response. */
function streamServer(script) {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.setHeader('content-type', 'text/event-stream');
        script(res);
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}/v1`));
  });
}

const chat = (baseUrl, overrides = {}) => streamChat({
  baseUrl,
  model: 'stub-model',
  messages: [{ role: 'user', content: 'Q?' }],
  maxTokens: 512,
  timeoutMs: 5_000,
  ...overrides,
});

const pick = ({ text, finishReason }) => ({ text, finishReason });

test('comment lines such as keepalives are ignored', async () => {
  const baseUrl = await streamServer((res) => {
    res.write(': keepalive\n\n');
    res.write(delta({ content: 'It is ' }));
    res.write(': keepalive\n\n');
    res.write(delta({ content: '18' }));
    res.write(delta({}, 'stop'));
    res.end('data: [DONE]\n\n');
  });
  assert.equal((await chat(baseUrl)).text, 'It is 18');
});

test('a reply is complete on a finish_reason or on [DONE], whichever the server sends', async () => {
  const finishOnly = await streamServer((res) => {
    res.write(delta({ content: '18' }));
    res.end(delta({}, 'stop'));
  });
  assert.deepEqual(pick(await chat(finishOnly)), { text: '18', finishReason: 'stop' });

  // No newline after the last line: some servers close the stream right behind it.
  const doneOnly = await streamServer((res) => {
    res.write(delta({ content: '18' }));
    res.end('data: [DONE]');
  });
  assert.deepEqual(pick(await chat(doneOnly)), { text: '18', finishReason: null });

  const cut = await streamServer((res) => {
    res.write(delta({ content: 'First, 9 times' }, 'length'));
    res.end('data: [DONE]\n\n');
  });
  assert.deepEqual(pick(await chat(cut)), { text: 'First, 9 times', finishReason: 'length' });

  const neither = await streamServer((res) => res.end(delta({ content: '18' })));
  await assert.rejects(chat(neither), /stream ended before the reply was complete/);
});

test('the clock starts at the first generated token of any kind, and reasoning stays out of the text', async () => {
  for (const field of ['reasoning', 'reasoning_content']) {
    const baseUrl = await streamServer((res) => {
      res.write(delta({ [field]: 'Nine eggs at 2 each: ' }));
      setTimeout(() => {
        res.write(delta({ [field]: '18.' }));
        res.write(delta({ content: 'It is 18' }));
        res.write(delta({}, 'stop'));
        res.end('data: [DONE]\n\n');
      }, 200);
    });
    const completion = await chat(baseUrl);
    assert.equal(completion.text, 'It is 18', field);
    assert.ok(completion.ttftMs < 150, `${field}: first token counted after ${completion.ttftMs} ms`);
    assert.ok(completion.seconds > 0.15, field);
  }
});

test('the request timeout covers the whole reply, so a stream that stalls is not waited on', async () => {
  const stalled = await streamServer((res) => res.write(delta({ content: 'It is' })));
  await assert.rejects(chat(stalled, { timeoutMs: 100 }), /request timed out after 100 ms/);
});
