// Run: node src/lib/extract.check.ts
import assert from 'node:assert/strict';

import { fmtOf, parseFxTweet, parseIgEmbed, parseIgMedia, parseDashBest, parseInput, previewOf, parseOg, parseRedditEmbed, sourceOf } from './extract.ts';

assert.equal(parseInput('look https://redd.it/abc here')?.href, 'https://redd.it/abc');
assert.equal(parseInput('instagram.com/p/C8xQ2fLt')?.host, 'instagram.com');
assert.equal(parseInput('hello'), null);
assert.equal(sourceOf('old.reddit.com'), 'Reddit');
assert.equal(sourceOf('x.com'), 'X');
assert.equal(sourceOf('example.com'), 'Web');
assert.deepEqual(fmtOf('https://i.redd.it/a.jpeg?x=1'), ['IMG', 'JPG']);

// Reddit embed page (embed.reddit.com/r/<sub>/comments/<id>/), trimmed to the parts the parser reads.
const screen = (post: object) => `<shreddit-screenview-data data="${JSON.stringify({ post, subreddit: { name: 'pics' } }).replace(/"/g, '&quot;')}">`;
const image = parseRedditEmbed(`${screen({ url: 'https://i.redd.it/abc.jpeg', nsfw: true, type: 'image' })}<a href="/user/filmgrain/"><img src="https://preview.redd.it/sunset-v0-abc.jpeg?width=640&amp;s=9">`);
assert.equal(image.author, 'r/pics · u/filmgrain');
assert.equal(image.nsfw, true);
assert.deepEqual(image.items, [{ url: 'https://i.redd.it/abc.jpeg', thumb: 'https://preview.redd.it/sunset-v0-abc.jpeg?width=640&s=9', type: 'IMG', fmt: 'JPG' }]);

const gallery = parseRedditEmbed(`${screen({ url: 'https://www.reddit.com/gallery/x', type: 'gallery' })}<gallery-carousel>
  <faceplate-img src="https://preview.redd.it/my-grandma-v0-jqme1.jpg?width=640&amp;s=1"></faceplate-img><img src="https://preview.redd.it/my-grandma-v0-jqme1.jpg?width=640">
  <img src="https://preview.redd.it/my-grandma-v0-lexn2.png?width=640"><img src="https://preview.redd.it/zz9.gif?format=png8"></gallery-carousel>`);
assert.deepEqual(gallery.items.map((i) => [i.url, i.type, i.thumb]), [
  ['https://i.redd.it/jqme1.jpg', 'IMG', 'https://preview.redd.it/my-grandma-v0-jqme1.jpg?width=640&s=1'],
  ['https://i.redd.it/lexn2.png', 'IMG', 'https://preview.redd.it/my-grandma-v0-lexn2.png?width=640'],
  ['https://i.redd.it/zz9.gif', 'GIF', 'https://preview.redd.it/zz9.gif?format=png8'],
]);
// Screens draw the small preview; the original is only fetched when saving.
assert.equal(previewOf(gallery.items[0]), gallery.items[0].thumb);
assert.equal(previewOf({ url: 'https://x/full.jpg', type: 'IMG', fmt: 'JPG' }), 'https://x/full.jpg');
assert.equal(previewOf({ url: 'https://x/v.mp4', type: 'VID', fmt: 'MP4' }), undefined);

const pm = { playbackMp4s: { duration: 14, permutations: [
  { source: { url: 'https://packaged-media.redd.it/v/pb/m2-res_392p.mp4?a=1&b=2', dimensions: { width: 220, height: 392 } } },
  { source: { url: 'https://packaged-media.redd.it/v/pb/m2-res_1920p.mp4?a=1&b=2', dimensions: { width: 1080, height: 1920 } } },
] } };
const video = parseRedditEmbed(`${screen({ url: 'https://v.redd.it/v', type: 'video' })}<shreddit-player src="x" packaged-media-json="${JSON.stringify(pm).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`);
assert.deepEqual(video.items[0], { url: 'https://packaged-media.redd.it/v/pb/m2-res_1920p.mp4?a=1&b=2', thumb: undefined, type: 'VID', fmt: 'MP4', w: 1080, h: 1920, dur: 14 });

assert.equal(parseRedditEmbed(screen({ url: 'https://imgur.com/a/x', type: 'link' })).link, 'https://imgur.com/a/x');
assert.throws(() => parseRedditEmbed(screen({ url: 'https://www.reddit.com/r/x/comments/1/', type: 'self' })));
assert.throws(() => parseRedditEmbed('<html>blocked</html>'));
assert.deepEqual(parseDashBest(`<Representation height="392" width="220"><BaseURL>CMAF_220.mp4</BaseURL></Representation>
  <Representation bandwidth="1" width="1080" id="9" height="1920"><BaseURL>CMAF_1080.mp4</BaseURL></Representation>
  <Representation id="a" mimeType="audio/mp4"><BaseURL>CMAF_AUDIO_128.mp4</BaseURL></Representation>`), { h: 1920, w: 1080, file: 'CMAF_1080.mp4' });

const tweet = parseFxTweet({ tweet: { author: { screen_name: 'orbitlabs' }, media: { all: [
  { type: 'photo', url: 'https://pbs.twimg.com/media/A.jpg', width: 10, height: 10 },
  { type: 'gif', url: 'https://video.twimg.com/g.mp4', thumbnail_url: 't' },
] } } });
assert.equal(tweet.items[0].url, 'https://pbs.twimg.com/media/A.jpg?name=orig');
assert.equal(tweet.items[1].type, 'GIF');

const og = parseOg(`<meta property="og:title" content="Harbor"><meta property="og:image" content="https://cdn/x.jpg?a=1&amp;b=2"><meta content="https://cdn/v.mp4" property="og:video">`);
assert.equal(og.title, 'Harbor');
assert.deepEqual(og.items, [{ url: 'https://cdn/v.mp4', thumb: 'https://cdn/x.jpg?a=1&b=2', type: 'VID', fmt: 'MP4' }]);

assert.equal(parseOg(`<meta property="og:title" content="O&#x2019;Keefe &amp; co">`).title, 'O’Keefe & co');

const sidecar = parseIgMedia({ owner: { username: 'northlight' }, edge_sidecar_to_children: { edges: [
  { node: { is_video: false, display_url: 'https://cdn/a.jpg?s=640', display_resources: [{ src: 'https://cdn/a.jpg?s=640', config_width: 640, config_height: 800 }, { src: 'https://cdn/a.jpg?s=1440', config_width: 1440, config_height: 1800 }] } },
  { node: { is_video: true, video_url: 'https://cdn/v.mp4', display_url: 'https://cdn/v.jpg', dimensions: { width: 1080, height: 1920 }, video_duration: 14 } },
] } });
assert.equal(sidecar!.author, '@northlight');
assert.deepEqual(sidecar!.items.map((i) => [i.url, i.type, i.w, i.thumb]), [
  ['https://cdn/a.jpg?s=1440', 'IMG', 1440, 'https://cdn/a.jpg?s=640'], ['https://cdn/v.mp4', 'VID', 1080, 'https://cdn/v.jpg'],
]);
const single = parseIgMedia({ owner: { username: 'x' }, display_url: 'https://cdn/full.jpg', dimensions: { width: 1440, height: 1800 },
  display_resources: [{ src: 'https://cdn/1080.jpg', config_width: 1080, config_height: 1350 }] });
assert.deepEqual(single!.items.map((i) => [i.url, i.w]), [['https://cdn/full.jpg', 1440]]); // full-size display_url wins
// A reel without video_url (embed page) must not turn into its cover image.
assert.equal(parseIgMedia({ owner: { username: 'x' }, is_video: true, display_url: 'https://cdn/cover.jpg' }), null);

const ctx = JSON.stringify({ gql_data: { shortcode_media: { owner: { username: 'embed' } } } });
assert.equal(parseIgEmbed(`x"contextJSON":${JSON.stringify(ctx)},"y"`).owner.username, 'embed');
assert.equal(parseIgEmbed('"contextJSON":null'), null);

console.log('extract: all checks passed');
