// Brand marks for the sites Foldreel knows. They are bundled with the app (no network
// request is made to draw them); a site without one falls back to a lettered tile.
import {
  siInstagram, siX, siTiktok, siYoutube, siReddit, siPixiv, siDeviantart, siTumblr,
  siPatreon, siFlickr, siSmugmug, siMastodon, siBluesky, siTwitch, siFacebook, siVimeo,
  siPinterest, siImgur, siBilibili, siSoundcloud, siArtstation, siBehance, siDribbble,
  siNewgrounds, siBandcamp, siKofi, siGumroad, siTelegram, siThreads, siSnapchat,
  siDiscord, siNiconico,
} from 'simple-icons';

// Instagram is drawn in black and white like X, instead of its pink gradient colour.
const instagramMono = { ...siInstagram, hex: '000000' };

const BY_DOMAIN = {
  'instagram.com': instagramMono, 'x.com': siX, 'twitter.com': siX, 'tiktok.com': siTiktok,
  'youtube.com': siYoutube, 'youtu.be': siYoutube, 'reddit.com': siReddit, 'redd.it': siReddit,
  'pixiv.net': siPixiv, 'fanbox.cc': siPixiv, 'deviantart.com': siDeviantart,
  'tumblr.com': siTumblr, 'patreon.com': siPatreon, 'flickr.com': siFlickr,
  'smugmug.com': siSmugmug, 'bsky.app': siBluesky, 'twitch.tv': siTwitch,
  'facebook.com': siFacebook, 'fb.com': siFacebook, 'vimeo.com': siVimeo,
  'pinterest.com': siPinterest, 'imgur.com': siImgur, 'bilibili.com': siBilibili,
  'soundcloud.com': siSoundcloud, 'artstation.com': siArtstation, 'behance.net': siBehance,
  'dribbble.com': siDribbble, 'newgrounds.com': siNewgrounds, 'bandcamp.com': siBandcamp,
  'ko-fi.com': siKofi, 'gumroad.com': siGumroad, 't.me': siTelegram, 'threads.net': siThreads,
  'snapchat.com': siSnapchat, 'discord.com': siDiscord, 'mastodon.social': siMastodon, 'nicovideo.jp': siNiconico,
};

// "i.imgur.com" -> imgur.com's mark. Walks up the labels until a known domain matches.
export function brandFor(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const labels = h.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    const hit = BY_DOMAIN[labels.slice(i).join('.')];
    if (hit) return hit;
  }
  return null;
}

// White glyphs on a pale brand colour (Snapchat's yellow) are unreadable: pick by luminance.
export function glyphOn(hex) {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111111' : '#ffffff';
}

// Sites without a mark in the icon set above: their own favicon, saved once at development
// time under public/sites and shipped with the app (the app never fetches one at runtime).
const FAVICONS = new Set([
  'fantia.jp', 'danbooru.donmai.us', 'e621.net', 'mangadex.org', 'inkbunny.net',
  'sankakucomplex.com', 'zerochan.net', 'aryion.com', 'pillowfort.social',
  'subscribestar.com', 'tapas.io', 'imgbb.com', 'nijie.info',
]);

export function faviconFor(host) {
  const labels = String(host || '').toLowerCase().replace(/^www\./, '').split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    const d = labels.slice(i).join('.');
    if (FAVICONS.has(d)) return `${process.env.PUBLIC_URL}/sites/${d}.png`;
  }
  return null;
}
