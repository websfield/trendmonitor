import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, configFor, requestUrl, profileFrom, postsFrom, runResearch } from './rapidapi-research.mjs';

const env = {
  RAPIDAPI_INSTAGRAM_BaseUrl: 'https://instagram-scraper-api2.p.rapidapi.com',
  RAPIDAPI_INSTAGRAM_Host: 'instagram-scraper-api2.p.rapidapi.com', RAPIDAPI_INSTAGRAM_ApiKey: 'fake-instagram-key-test-only',
  RAPIDAPI_TIKTOK_BaseUrl: 'https://tiktok-scraper7.p.rapidapi.com',
  RAPIDAPI_TIKTOK_Host: 'tiktok-scraper7.p.rapidapi.com', RAPIDAPI_TIKTOK_ApiKey: 'fake-tiktok-key-test-only',
};
const noPause = async () => {};
const json = (body, options) => new Response(JSON.stringify(body), options);
const noNetwork = async () => { throw new Error('Unexpected fetch in no-network case'); };
const suppliedEnv = {
  ...env,
  RAPIDAPI_INSTAGRAM_BaseUrl: 'https://instagram-social-api.p.rapidapi.com/v1',
  RAPIDAPI_INSTAGRAM_Host: 'instagram-social-api.p.rapidapi.com',
  RAPIDAPI_TIKTOK_BaseUrl: 'https://tiktok-api23.p.rapidapi.com/api',
  RAPIDAPI_TIKTOK_Host: 'tiktok-api23.p.rapidapi.com',
};

test('configuration restricts credential delivery to matching HTTPS RapidAPI origins', () => {
  assert.equal(configFor(env, 'instagram').status, 'ready');
  for (const base of ['http://instagram-scraper-api2.p.rapidapi.com', 'https://evil.example',
    'https://user:password@instagram-scraper-api2.p.rapidapi.com', 'https://instagram-scraper-api2.p.rapidapi.com?token=x']) {
    assert.equal(configFor({ ...env, RAPIDAPI_INSTAGRAM_BaseUrl: base }, 'instagram').status, 'unsafe_configuration');
  }
  assert.equal(configFor({ ...env, RAPIDAPI_INSTAGRAM_BaseUrl: env.RAPIDAPI_INSTAGRAM_BaseUrl + '/v1/info' }, 'instagram').status, 'base_url_must_be_origin');
  for (const endpoint of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', '/profile?api_key=x', '/{bad}']) {
    assert.throws(() => requestUrl(env.RAPIDAPI_INSTAGRAM_BaseUrl, endpoint, 'name'));
  }
  assert.throws(() => requestUrl(env.RAPIDAPI_INSTAGRAM_BaseUrl, '/posts?id={id}', 'name'));
});

test('plan and unknown providers make zero calls, and never export keys', async () => {
  const plan = await runResearch(env, { planOnly: true, fetchFn: noNetwork });
  assert.equal(plan.callsMade, 0); assert.equal(plan.accounts.length, 5);
  assert(!JSON.stringify(plan).includes(env.RAPIDAPI_INSTAGRAM_ApiKey));
  const unknown = await runResearch({ ...env,
    RAPIDAPI_INSTAGRAM_BaseUrl: 'https://unknown.p.rapidapi.com', RAPIDAPI_INSTAGRAM_Host: 'unknown.p.rapidapi.com',
    RAPIDAPI_TIKTOK_BaseUrl: 'https://unknown.p.rapidapi.com', RAPIDAPI_TIKTOK_Host: 'unknown.p.rapidapi.com',
  }, { fetchFn: noNetwork });
  assert.equal(unknown.callsMade, 0); assert(unknown.accounts.every(a => a.status === 'needs_endpoint_mapping'));
});

test('five accounts use at most ten GETs; reports preserve evidence and omit sensitive fields', async () => {
  let calls = 0;
  const report = await runResearch(env, { pause: noPause, fetchFn: async (url, options) => {
    calls++; assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-RapidAPI-Host'], url.hostname); assert(options.signal);
    const handle = url.searchParams.get('username_or_id_or_url') || url.searchParams.get('unique_id');
    const account = ACCOUNTS.find(a => a.handle === handle); assert(account);
    if (url.pathname.endsWith('/info')) return json({ data: { username: handle, id: '123',
      biography: `A public bio containing ${env.RAPIDAPI_INSTAGRAM_ApiKey} and ${Buffer.from(env.RAPIDAPI_TIKTOK_ApiKey).toString('base64')}`,
      follower_count: 0, public_phone_number: 'PRIVATE-CONTACT', authorization: 'DO-NOT-EXPORT', is_private: false } });
    return json({ data: { items: [
      { id: '900', code: 'other', author: { username: 'different-person' }, caption: { text: 'Wrong account' } },
      ...Array.from({ length: 15 }, (_, i) => ({ id: String(1000 + i), code: 'post' + i,
        author: { username: handle, id: '123' }, caption: { text: 'Public caption' }, like_count: i,
        comments: [{ text: 'UNREQUESTED-COMMENT' }], play_count: i === 0 ? 0 : undefined,
      })),
    ] } });
  } });
  assert.equal(calls, 10); assert.equal(report.callsMade, 10);
  assert.equal(report.videosWatched, false); assert.equal(report.remoteContentIsUntrusted, true);
  for (const account of report.accounts) {
    assert.equal(account.status, 'profile_and_post_sample'); assert.equal(account.posts.length, 12);
    assert.equal(account.profile.followers, 0); assert.equal(account.profile.following, null);
    assert.equal(account.posts[0].views, 0); assert.equal(account.posts[1].views, null);
    assert.equal(account.sample.viewsAvailable, 1); assert.equal(account.excludedOtherAuthors, 1);
  }
  const text = JSON.stringify(report);
  for (const excluded of [...Object.values(env).filter(x => x.startsWith('fake-')), 'PRIVATE-CONTACT', 'DO-NOT-EXPORT', 'UNREQUESTED-COMMENT', 'Wrong account']) {
    assert(!text.includes(excluded), excluded);
  }
  assert(text.includes('[REDACTED]'));
});

test('authentication and exhausted quotas stop each provider without retries', async () => {
  let calls = 0;
  const report = await runResearch(env, { pause: noPause, fetchFn: async () => { calls++; return json({ key: 'RAW-ERROR-SECRET' }, { status: 403 }); } });
  assert.equal(calls, 2); assert(report.providers.every(p => p.stoppedReason === 'http_403'));
  assert(!JSON.stringify(report).includes('RAW-ERROR-SECRET'));
  const quota = await runResearch(env, { pause: noPause, fetchFn: async url => {
    const handle = url.searchParams.get('username_or_id_or_url') || url.searchParams.get('unique_id');
    return json({ data: { username: handle, id: '123' } }, { headers: { 'x-ratelimit-requests-remaining': '0' } });
  } });
  assert.equal(quota.callsMade, 2); assert(quota.providers.every(p => p.stoppedReason === 'reported_quota_exhausted'));
});

test('private, mismatched and failed profiles never trigger post requests', async () => {
  for (const kind of ['private', 'mismatch', 'error']) {
    const report = await runResearch(env, { pause: noPause, fetchFn: async url => {
      assert(url.pathname.endsWith('/info'));
      const handle = url.searchParams.get('username_or_id_or_url') || url.searchParams.get('unique_id');
      return json(kind === 'error' ? { code: -1, msg: 'Do not print me' } :
        { data: { username: kind === 'mismatch' ? 'wrong' : handle, is_private: kind === 'private' } });
    } });
    assert.equal(report.callsMade, 5); assert(report.accounts.every(a => a.posts.length === 0 && a.requests.length === 1));
  }
});

test('malformed, oversized, redirect and network responses produce safe partial reports', async () => {
  for (const response of ['not json', 'x'.repeat(5 * 1024 * 1024 + 1), null]) {
    const report = await runResearch(env, { pause: noPause, fetchFn: async () => {
      if (response === null) throw new Error(`secret: ${env.RAPIDAPI_TIKTOK_ApiKey}`);
      return new Response(response);
    } });
    assert.equal(report.callsMade, 5); assert(report.accounts.every(a => a.status === 'request_failed'));
    assert(!JSON.stringify(report).includes(env.RAPIDAPI_TIKTOK_ApiKey));
  }
});

test('TikTok nested stats and Instagram graph captions retain null and zero correctly', () => {
  const profile = profileFrom({ data: { user: { uniqueId: 'wangfred5', id: '123' }, stats: { followerCount: 10, videoCount: 0 } } }, 'wangfred5');
  assert.equal(profile.followers, 10); assert.equal(profile.lifetimePosts, 0);
  assert.equal(profileFrom({ data: { username: 'wrong' } }, 'wangfred5'), null);
  const graph = postsFrom({ user: { edge_owner_to_timeline_media: { edges: [{ node: { id: '1', shortcode: 'abc',
    edge_media_to_caption: { edges: [{ node: { text: 'Graph caption' } }] },
    edge_liked_by: { count: 0 }, taken_at_timestamp: 1700000000,
  } }] } } }, { platform: 'instagram', handle: 'joiebeautyco' }, { id: '123' });
  assert.equal(graph.items[0].caption, 'Graph caption'); assert.equal(graph.items[0].likes, 0);
  assert.equal(graph.items[0].views, null); assert.equal(graph.items[0].publishedAt, '2023-11-14T22:13:20.000Z');
  assert.equal(postsFrom({ unexpected: [] }, ACCOUNTS[0], { id: '123' }).status, 'unrecognised_post_shape');
});

test('author evidence requires a positive comparison, not just a returned author ID', () => {
  const account = ACCOUNTS[0];
  const profileWithoutId = profileFrom({ data: { username: account.handle } }, account.handle);
  assert.equal(profileWithoutId.id, null);
  const cases = [
    [{ id: 'unrelated' }, profileWithoutId, 'account_endpoint_only'],
    [{ username: account.handle }, profileWithoutId, 'returned_author_matched'],
    [{ id: '123' }, { id: '123' }, 'returned_author_matched'],
    [undefined, { id: '123' }, 'account_endpoint_only'],
  ];
  for (const [author, profile, evidence] of cases) {
    const result = postsFrom({ items: [{ id: '1', author }] }, account, profile);
    assert.equal(result.items[0].authorEvidence, evidence);
  }
  assert.equal(postsFrom({ items: [{ id: '1', author: { id: 'unrelated' } }] }, account, { id: '123' }).items.length, 0);
});

test('supplied providers accept their documented base prefixes without duplicating paths', () => {
  for (const [platform, prefix] of [['instagram', '/v1'], ['tiktok', '/api']]) {
    const name = `RAPIDAPI_${platform.toUpperCase()}_BaseUrl`;
    const origin = new URL(suppliedEnv[name]).origin;
    for (const suffix of ['', '/', prefix, prefix + '/']) {
      const config = configFor({ ...suppliedEnv, [name]: origin + suffix }, platform);
      assert.equal(config.status, 'ready'); assert.equal(config.base, origin);
      const url = requestUrl(config.base, config.profile, 'sample.handle');
      assert.equal(url.pathname, platform === 'instagram' ? '/v1/info' : '/api/user/info');
    }
    for (const suffix of [prefix + '/info', prefix + prefix, '/unexpected']) {
      assert.equal(configFor({ ...suppliedEnv, [name]: origin + suffix }, platform).status, 'base_url_must_be_origin');
    }
  }
  const config = configFor(suppliedEnv, 'tiktok');
  const secUid = 'MS4+sample/with&symbols=value';
  const url = requestUrl(config.base, config.posts, 'wangfred5', '123', secUid);
  assert.equal(url.searchParams.get('secUid'), secUid); assert.equal(url.searchParams.size, 3);
  assert.throws(() => requestUrl(config.base, config.posts, 'wangfred5', '123'), /profile_sec_uid_unavailable/);
});

test('supplied Instagram and TikTok schemas resolve all five profiles and one post page each', async () => {
  const report = await runResearch(suppliedEnv, { pause: noPause, fetchFn: async (url, options) => {
    assert.equal(options.headers['X-RapidAPI-Host'], url.hostname);
    const instagram = url.hostname === suppliedEnv.RAPIDAPI_INSTAGRAM_Host;
    if (url.pathname.endsWith('/info')) {
      assert.equal(url.pathname, instagram ? '/v1/info' : '/api/user/info');
      const handle = url.searchParams.get(instagram ? 'username_or_id_or_url' : 'uniqueId');
      assert(ACCOUNTS.some(a => a.handle === handle));
      return json(instagram ? { data: { id: '123', username: handle, full_name: 'Example',
        follower_count: 0, media_count: 4, is_private: false } } :
        { userInfo: { user: { id: '456', uniqueId: handle, secUid: 'MS4.' + handle, privateAccount: false },
          stats: { followerCount: 10, videoCount: 3 } }, statusCode: 0 });
    }
    assert.equal(url.pathname, instagram ? '/v1/posts' : '/api/user/posts');
    const handle = instagram ? url.searchParams.get('username_or_id_or_url') :
      url.searchParams.get('secUid')?.replace(/^MS4\./, '');
    assert(ACCOUNTS.some(a => a.handle === handle));
    if (!instagram) {
      assert.equal(url.searchParams.get('count'), '12'); assert.equal(url.searchParams.get('cursor'), '0');
      assert.equal(url.searchParams.get('secUid'), 'MS4.' + handle);
    }
    return json(instagram ? { data: { items: [
      { id: '1', code: 'one', user: { id: '123', username: handle }, caption: { text: 'Instagram caption' },
        media_type: 8, like_count: 0, comment_count: 1, taken_at: 1700000000 },
      { id: '2', code: 'two', user: { username: handle }, metrics: { like_count: null, play_count: 0, share_count: 2 } },
    ] } } : { data: { itemList: [
      { id: '3', desc: 'TikTok caption', author: { id: '456', uniqueId: handle }, createTime: '1700000000',
        stats: { playCount: 0, diggCount: 2, commentCount: 0, shareCount: 3 } },
      { id: '4', desc: 'Other account', author: { uniqueId: 'unrelated' } },
    ], hasMore: true, cursor: 'next-page' } });
  } });
  assert.equal(report.callsMade, 10);
  for (const account of report.accounts) {
    assert.equal(account.status, 'profile_and_post_sample');
    assert.equal(account.posts[0].authorEvidence, 'returned_author_matched');
    assert.equal(account.posts[0].publishedAt, '2023-11-14T22:13:20.000Z');
    if (account.platform === 'instagram') {
      assert.equal(account.profile.followers, 0); assert.equal(account.profile.secUid, null);
      assert.equal(account.posts.length, 2); assert.equal(account.posts[0].mediaType, '8');
      assert.equal(account.posts[0].likes, 0); assert.equal(account.posts[0].views, null);
      assert.equal(account.posts[1].likes, null); assert.equal(account.posts[1].views, 0);
      assert.equal(account.posts[1].shares, 2);
    } else {
      assert.equal(account.profile.secUid, 'MS4.' + account.handle); assert.equal(account.profile.followers, 10);
      assert.equal(account.posts.length, 1); assert.equal(account.excludedOtherAuthors, 1);
      assert.equal(account.posts[0].views, 0); assert.equal(account.posts[0].shares, 3);
      assert.equal(account.posts[0].permalink, `https://www.tiktok.com/@${account.handle}/video/3`);
    }
  }
});

test('missing TikTok secUid never falls back to the numeric ID or sends a posts request', async () => {
  for (const secUid of [null, '']) {
    const report = await runResearch(suppliedEnv, { pause: noPause, fetchFn: async url => {
      assert(url.pathname.endsWith('/info'));
      if (url.hostname === suppliedEnv.RAPIDAPI_INSTAGRAM_Host) return json({ code: -1 });
      return json({ userInfo: { user: { id: '123', uniqueId: url.searchParams.get('uniqueId'), secUid } }, statusCode: 0 });
    } });
    assert.equal(report.callsMade, 5);
    for (const account of report.accounts.filter(a => a.platform === 'tiktok')) {
      assert.equal(account.status, 'profile_only'); assert.equal(account.posts.length, 0);
      assert.equal(account.requests[1].status, 'profile_sec_uid_unavailable');
    }
  }
});

test('nonzero TikTok statusCode is an error even when an HTTP 200 body contains a matching profile', async () => {
  const report = await runResearch(suppliedEnv, { pause: noPause, fetchFn: async url => {
    assert(url.pathname.endsWith('/info'));
    return json({ statusCode: 10221, userInfo: { user: { uniqueId: url.searchParams.get('uniqueId'), secUid: 'unused' } } });
  } });
  assert.equal(report.callsMade, 5);
  assert(report.accounts.every(a => a.status === 'provider_error' && a.profile === null));
});

test('plain X-RateLimit-Remaining zero stops supplied providers before another call', async () => {
  const report = await runResearch(suppliedEnv, { pause: noPause, fetchFn: async () =>
    json({}, { headers: { 'X-RateLimit-Remaining': '0' } }) });
  assert.equal(report.callsMade, 2);
  assert(report.providers.every(p => p.stoppedReason === 'reported_quota_exhausted'));
});
