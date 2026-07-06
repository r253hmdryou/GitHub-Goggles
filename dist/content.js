"use strict";
const ICON_CLASS = "github-goggles-author-icon";
const ROW_SELECTOR = 'div[id^="issue_"], div.js-issue-row, [data-testid="issue-row"]';
const appAvatarCache = new Map();
function isPullRequestsPage() {
    return /^\/[^/]+\/[^/]+\/pulls(?:\/|$)/.test(location.pathname);
}
function toUrl(value) {
    try {
        return new URL(value || "", location.origin);
    }
    catch {
        return null;
    }
}
function hasBotLabel(authorLink) {
    let sibling = authorLink.nextElementSibling;
    while (sibling) {
        if (sibling.classList.contains("Label") && sibling.textContent?.trim() === "Bot") {
            return true;
        }
        if (sibling.matches("a[href]")) {
            return false;
        }
        sibling = sibling.nextElementSibling;
    }
    return false;
}
function getAppSlugFromSearch(authorLink) {
    if (!hasBotLabel(authorLink)) {
        return null;
    }
    const query = toUrl(authorLink.getAttribute("href"))?.searchParams.get("q") || "";
    return query.match(/(?:^|\s)author:app\/([^\s]+)/)?.[1] || null;
}
function getAppSlug(authorLink) {
    const searchSlug = getAppSlugFromSearch(authorLink);
    if (searchSlug) {
        return searchSlug;
    }
    const hovercardPath = toUrl(authorLink.getAttribute("data-hovercard-url"))?.pathname || "";
    const hovercardSlug = hovercardPath.match(/^\/apps\/([^/]+)\/hovercard$/)?.[1];
    if (hovercardSlug) {
        return hovercardSlug;
    }
    return toUrl(authorLink.getAttribute("href"))?.pathname.match(/^\/apps\/([^/]+)$/)?.[1] || null;
}
function getUserAvatarUrl(authorLink) {
    const hovercardPath = toUrl(authorLink.getAttribute("data-hovercard-url"))?.pathname || "";
    const hovercardUser = hovercardPath.match(/^\/users\/([^/]+)\/hovercard$/)?.[1];
    const authorName = authorLink.textContent?.trim() || "";
    return `https://github.com/${hovercardUser || authorName}.png?size=32`;
}
function resolveAppAvatar(appSlug) {
    if (!appAvatarCache.has(appSlug)) {
        const avatar = fetch(`/apps/${encodeURIComponent(appSlug)}`)
            .then((response) => (response.ok ? response.text() : ""))
            .then((html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const imageSource = doc.querySelector('img[src*="avatars.githubusercontent.com/in/"]')?.src;
            const metaSource = doc.querySelector('meta[property="og:image"][content*="avatars.githubusercontent.com/in/"]')?.content;
            const source = imageSource || metaSource;
            return source ? new URL(source, location.origin).toString() : null;
        })
            .catch(() => null);
        appAvatarCache.set(appSlug, avatar);
    }
    return appAvatarCache.get(appSlug);
}
function createAuthorIcon(authorName) {
    const icon = document.createElement("img");
    icon.className = ICON_CLASS;
    icon.alt = "";
    icon.decoding = "async";
    icon.loading = "lazy";
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("title", authorName);
    return icon;
}
function getOrCreateIcon(authorLink) {
    const previous = authorLink.previousElementSibling;
    if (previous?.classList.contains(ICON_CLASS)) {
        if (previous instanceof HTMLImageElement) {
            return previous;
        }
        previous.remove();
    }
    const icon = createAuthorIcon(authorLink.textContent?.trim() || "");
    authorLink.before(icon);
    return icon;
}
function setIconSource(icon, key, source) {
    if (icon.dataset.githubGogglesSource === key) {
        return;
    }
    icon.dataset.githubGogglesSource = key;
    icon.style.visibility = source ? "" : "hidden";
    if (source) {
        icon.src = source;
    }
    else {
        icon.removeAttribute("src");
    }
}
async function updateAppIcon(icon, appSlug) {
    const key = `app:${appSlug}`;
    setIconSource(icon, key, null);
    const source = await resolveAppAvatar(appSlug);
    if (source && icon.dataset.githubGogglesSource === key) {
        icon.style.visibility = "";
        icon.src = source;
    }
}
function decorateAuthor(authorLink) {
    const icon = getOrCreateIcon(authorLink);
    const appSlug = getAppSlug(authorLink);
    if (appSlug) {
        void updateAppIcon(icon, appSlug);
        return;
    }
    setIconSource(icon, `user:${authorLink.textContent?.trim() || ""}`, getUserAvatarUrl(authorLink));
}
function findAuthorLink(row) {
    return ([...row.querySelectorAll(".opened-by a[href]")].find((link) => !link.textContent?.trim().startsWith("#")) || null);
}
function decoratePullRequestAuthors() {
    if (!isPullRequestsPage()) {
        return;
    }
    document.querySelectorAll(ROW_SELECTOR).forEach((row) => {
        const authorLink = findAuthorLink(row);
        if (authorLink) {
            decorateAuthor(authorLink);
        }
    });
}
let pending = false;
function scheduleDecorate() {
    if (pending) {
        return;
    }
    pending = true;
    requestAnimationFrame(() => {
        pending = false;
        decoratePullRequestAuthors();
    });
}
decoratePullRequestAuthors();
new MutationObserver(scheduleDecorate).observe(document.body, {
    childList: true,
    subtree: true
});
