import assert from "node:assert/strict";
import test from "node:test";
import { createGithubJsonFetcher } from "./github-fetch.mjs";

const TOKEN = "test-token-value";

function fakeFetch(routes, calls) {
  return async (url, init) => {
    calls.push({ url, headers: init.headers, redirect: init.redirect });
    const route = routes[url];
    return new Response(route.body ?? "{}", { status: route.status ?? 200, headers: route.headers ?? {} });
  };
}

test("sends the token to api.github.com and github.com", async () => {
  const calls = [];
  const fetchJson = createGithubJsonFetcher({
    token: TOKEN,
    fetchImpl: fakeFetch(
      {
        "https://api.github.com/a": { status: 302, headers: { location: "https://github.com/b" } },
        "https://github.com/b": { body: '{"ok":true}' },
      },
      calls,
    ),
  });
  assert.deepEqual(await fetchJson("https://api.github.com/a"), { ok: true });
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.headers.authorization, `Bearer ${TOKEN}`);
});

test("never sends the token to a foreign redirect host", async () => {
  const calls = [];
  const fetchJson = createGithubJsonFetcher({
    token: TOKEN,
    fetchImpl: fakeFetch(
      {
        "https://api.github.com/a": { status: 302, headers: { location: "https://objects.example.net/blob" } },
        "https://objects.example.net/blob": { body: '{"ok":true}' },
      },
      calls,
    ),
  });
  await fetchJson("https://api.github.com/a");
  assert.equal(calls[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[1].url, "https://objects.example.net/blob");
  assert.equal(calls[1].headers.authorization, undefined);
});

test("does not send the token to lookalike or non-https hosts", async () => {
  const calls = [];
  const fetchJson = createGithubJsonFetcher({
    token: TOKEN,
    fetchImpl: fakeFetch(
      {
        "https://api.github.com/a": { status: 301, headers: { location: "https://api.github.com.evil.test/x" } },
        "https://api.github.com.evil.test/x": { status: 301, headers: { location: "http://api.github.com/y" } },
        "http://api.github.com/y": {},
      },
      calls,
    ),
  });
  await fetchJson("https://api.github.com/a");
  assert.equal(calls[1].headers.authorization, undefined);
  assert.equal(calls[2].headers.authorization, undefined);
});

test("stays anonymous and refuses clearly without a token", async () => {
  const calls = [];
  const fetchJson = createGithubJsonFetcher({
    fetchImpl: fakeFetch({ "https://api.github.com/a": { status: 404 } }, calls),
  });
  await assert.rejects(
    fetchJson("https://api.github.com/a"),
    /HTTP 404 for https:\/\/api\.github\.com\/a; no GITHUB_TOKEN was provided/,
  );
  assert.equal(calls[0].headers.authorization, undefined);
});

test("errors never contain the token and redirects are bounded", async () => {
  const calls = [];
  const loop = { status: 302, headers: { location: "https://api.github.com/a" } };
  const fetchJson = createGithubJsonFetcher({
    token: TOKEN,
    fetchImpl: fakeFetch({ "https://api.github.com/a": loop }, calls),
  });
  await assert.rejects(fetchJson("https://api.github.com/a"), (error) => {
    assert.match(error.message, /Too many redirects/);
    assert.ok(!error.message.includes(TOKEN));
    return true;
  });
  const failing = createGithubJsonFetcher({
    token: TOKEN,
    fetchImpl: fakeFetch({ "https://api.github.com/b": { status: 404 } }, []),
  });
  await assert.rejects(failing("https://api.github.com/b"), (error) => {
    assert.ok(!error.message.includes(TOKEN));
    assert.ok(!/no GITHUB_TOKEN/.test(error.message));
    return true;
  });
});
