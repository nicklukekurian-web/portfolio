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
  // until site[key] is a path under /assets/img/.
  for (const slot of document.querySelectorAll('[data-site-image]')) {
    const src = site[slot.dataset.siteImage];
    if (typeof src !== 'string' || !/^\/?assets\/img\/[\w./-]+\.(png|jpe?g|webp|svg)$/i.test(src)) continue;
    const frame = document.createElement('figure');
    frame.className = 'crt-frame';
    const img = document.createElement('img');
    img.src = src.startsWith('/') ? src : `/${src}`;
    img.alt = slot.dataset.siteImageAlt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    frame.append(img);
    slot.append(frame);
    slot.hidden = false;
  }
}
