// Links that exist only when data/site.js says so. Each [data-site-link-row="key"] starts hidden and empty;
// if site.links[key] is a real https:// URL, the link is created inside it and the row appears. Otherwise the
// page has no link at all (no href-less anchors for crawlers). data/site.js stays the only place URLs live.
import { site } from '../data/site.js';

export function initSiteLinks() {
  for (const row of document.querySelectorAll('[data-site-link-row]')) {
    const key = row.dataset.siteLinkRow;
    const url = site.links[key];
    if (typeof url !== 'string' || !/^https:\/\/[^\s]+$/.test(url)) continue;   // unset, empty or not https: stay hidden
    const a = document.createElement('a');
    a.className = 'link-cmd';
    a.href = url;
    a.rel = 'noopener noreferrer';
    a.dataset.siteLink = key;
    a.textContent = `${row.dataset.siteLinkText || key} `;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    a.append(arrow);
    row.append(a);
    row.hidden = false;
  }
  // Optional images, same rule: [data-site-image="key"] stays hidden and empty (no frame, no broken <img>, no gap)
  // until site[key] is set. It is either a path under /assets/img/ or an object { webp, png, width, height, alt,
  // caption } (the NCL badge), drawn as a <picture> with a PNG fallback and a caption, from data/site.js alone.
  const IMG = /^\/?assets\/img\/[\w./-]+\.(png|jpe?g|webp|svg)$/i;
  const abs = (p) => (p.startsWith('/') ? p : `/${p}`);
  for (const slot of document.querySelectorAll('[data-site-image]')) {
    const v = site[slot.dataset.siteImage];
    const rich = v && typeof v === 'object';
    const png = rich ? v.png : v;
    if (typeof png !== 'string' || !IMG.test(png) || (rich && v.webp && !IMG.test(v.webp))) continue;
    const img = document.createElement('img');
    img.src = abs(png);
    img.alt = rich ? v.alt || '' : slot.dataset.siteImageAlt || '';
    if (rich && v.width && v.height) { img.width = v.width; img.height = v.height; }
    img.loading = 'lazy';
    img.decoding = 'async';
    let media = img;
    if (rich && v.webp) {
      media = document.createElement('picture');
      const source = document.createElement('source');
      source.type = 'image/webp';
      source.srcset = abs(v.webp);
      media.append(source, img);
    }
    if (rich) {
      const fig = document.createElement('figure');
      fig.className = 'badge-card';
      const cap = document.createElement('figcaption');
      cap.className = 'note label dim';
      cap.textContent = v.caption || '';
      fig.append(media, cap);
      slot.append(fig);
      slot.closest('.ncl-lead')?.classList.add('has-badge');
    } else {
      const frame = document.createElement('figure');
      frame.className = 'crt-frame';
      frame.append(media);
      slot.append(frame);
    }
    slot.hidden = false;
  }
}
