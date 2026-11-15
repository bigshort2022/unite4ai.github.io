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
  assert.equal((await chat(finishOnly)).text, '18');

  // No newline after the last line: some servers close the stream right behind it.
  const doneOnly = await streamServer((res) => {
    res.write(delta({ content: '18' }));
    res.end('data: [DONE]');
  });
  assert.equal((await chat(doneOnly)).text, '18');

  const neither = await streamServer((res) => res.end(delta({ content: '18' })));
  await assert.rejects(chat(neither), /stream ended before the reply was complete/);
});
