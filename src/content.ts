declare const chrome: {
  runtime: {
    getURL(path: string): string;
  };
};

const ICON_CLASS = "github-goggles-author-icon";
const ROW_SELECTOR = 'div[id^="issue_"], div.js-issue-row, [data-testid="issue-row"]';
const EXPANDED_VIDEO_CLASS = "github-goggles-expanded-video";
const VIDEO_LINK_SELECTOR = '.markdown-body a[href]:not([data-github-goggles-video])';
const REVIEW_COMMENTS_SECTION_ID = "github-goggles-unresolved-review-comments";
const REVIEW_THREAD_SELECTOR = [
  ".js-resolvable-timeline-thread-container",
  ".js-resolvable-thread",
  ".js-inline-comments-container",
  "[data-resolvable-thread-id]",
  "[data-review-thread-id]"
].join(",");
const appAvatarCache = new Map<string, Promise<string | null>>();

type ReviewCommentItem = {
  id: string;
  href: string;
  author: string;
  body: string;
  location: string;
};

function isPullRequestsPage(): boolean {
  return /^\/[^/]+\/[^/]+\/pulls(?:\/|$)/.test(location.pathname);
}

function isPullRequestDetailPage(): boolean {
  return /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/.test(location.pathname);
}

function toUrl(value: string | null): URL | null {
  try {
    return new URL(value || "", location.origin);
  } catch {
    return null;
  }
}

function hasBotLabel(authorLink: HTMLAnchorElement): boolean {
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

function getAppSlugFromSearch(authorLink: HTMLAnchorElement): string | null {
  if (!hasBotLabel(authorLink)) {
    return null;
  }

  const query = toUrl(authorLink.getAttribute("href"))?.searchParams.get("q") || "";
  return query.match(/(?:^|\s)author:app\/([^\s]+)/)?.[1] || null;
}

function getAppSlug(authorLink: HTMLAnchorElement): string | null {
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

function getUserAvatarUrl(authorLink: HTMLAnchorElement): string {
  const hovercardPath = toUrl(authorLink.getAttribute("data-hovercard-url"))?.pathname || "";
  const hovercardUser = hovercardPath.match(/^\/users\/([^/]+)\/hovercard$/)?.[1];
  const authorName = authorLink.textContent?.trim() || "";

  return `https://github.com/${hovercardUser || authorName}.png?size=32`;
}

function resolveAppAvatar(appSlug: string): Promise<string | null> {
  if (!appAvatarCache.has(appSlug)) {
    const avatar = fetch(`/apps/${encodeURIComponent(appSlug)}`)
      .then((response) => (response.ok ? response.text() : ""))
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const imageSource = doc.querySelector<HTMLImageElement>(
          'img[src*="avatars.githubusercontent.com/in/"]'
        )?.src;
        const metaSource = doc.querySelector<HTMLMetaElement>(
          'meta[property="og:image"][content*="avatars.githubusercontent.com/in/"]'
        )?.content;
        const source = imageSource || metaSource;

        return source ? new URL(source, location.origin).toString() : null;
      })
      .catch(() => null);

    appAvatarCache.set(appSlug, avatar);
  }

  return appAvatarCache.get(appSlug)!;
}

function createAuthorIcon(authorName: string): HTMLImageElement {
  const icon = document.createElement("img");
  icon.className = ICON_CLASS;
  icon.alt = "";
  icon.decoding = "async";
  icon.loading = "lazy";
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("title", authorName);
  return icon;
}

function getOrCreateIcon(authorLink: HTMLAnchorElement): HTMLImageElement {
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

function setIconSource(icon: HTMLImageElement, key: string, source: string | null): void {
  if (icon.dataset.githubGogglesSource === key) {
    return;
  }

  icon.dataset.githubGogglesSource = key;
  icon.style.visibility = source ? "" : "hidden";

  if (source) {
    icon.src = source;
  } else {
    icon.removeAttribute("src");
  }
}

async function updateAppIcon(icon: HTMLImageElement, appSlug: string): Promise<void> {
  const key = `app:${appSlug}`;

  setIconSource(icon, key, null);
  const source = await resolveAppAvatar(appSlug);

  if (source && icon.dataset.githubGogglesSource === key) {
    icon.style.visibility = "";
    icon.src = source;
  }
}

function decorateAuthor(authorLink: HTMLAnchorElement): void {
  const icon = getOrCreateIcon(authorLink);
  const appSlug = getAppSlug(authorLink);

  if (appSlug) {
    void updateAppIcon(icon, appSlug);
    return;
  }

  setIconSource(icon, `user:${authorLink.textContent?.trim() || ""}`, getUserAvatarUrl(authorLink));
}

function findAuthorLink(row: Element): HTMLAnchorElement | null {
  return (
    [...row.querySelectorAll<HTMLAnchorElement>(".opened-by a[href]")].find(
      (link) => !link.textContent?.trim().startsWith("#")
    ) || null
  );
}

function decoratePullRequestAuthors(): void {
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

function isVideoUrl(value: string): boolean {
  const url = toUrl(value);
  return Boolean(url && /\.(?:mp4|m4v|webm|ogv|ogg)$/i.test(url.pathname));
}

function expandVideoLinks(): void {
  if (!isPullRequestDetailPage()) {
    return;
  }

  document.querySelectorAll<HTMLAnchorElement>(VIDEO_LINK_SELECTOR).forEach((link) => {
    const href = link.href;

    if (!isVideoUrl(href) || link.closest(`.${EXPANDED_VIDEO_CLASS}`)) {
      return;
    }

    link.dataset.githubGogglesVideo = "expanded";

    const label = normalizeText(link.textContent) || "添付動画";
    const playerUrl = new URL("player.html", chrome.runtime.getURL("/"));
    playerUrl.searchParams.set("src", href);
    playerUrl.searchParams.set("label", label);

    const player = document.createElement("iframe");
    player.className = EXPANDED_VIDEO_CLASS;
    player.src = playerUrl.toString();
    player.title = label;
    player.loading = "lazy";
    player.allowFullscreen = true;

    const paragraph = link.closest("p");
    const listItem = link.closest("li");

    if (paragraph) {
      paragraph.after(player);
    } else if (listItem) {
      listItem.append(player);
    } else {
      link.after(player);
    }
  });
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getControlText(control: Element): string {
  return normalizeText(
    [
      control.textContent,
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("value")
    ].join(" ")
  );
}

function isResolveControl(control: Element): boolean {
  const text = getControlText(control);

  return /\bResolve (?:conversation|thread)\b/i.test(text);
}

function isUnresolvedReviewThread(thread: Element): boolean {
  return [...thread.querySelectorAll("button, input[type='submit'], summary, a")].some(
    isResolveControl
  );
}

function getElementId(element: Element): string | null {
  if (element.id) {
    return element.id;
  }

  if (element instanceof HTMLElement) {
    return (
      element.dataset.resolvableThreadId ||
      element.dataset.reviewThreadId ||
      element.dataset.threadId ||
      null
    );
  }

  return null;
}

function getThreadAnchor(thread: Element): HTMLAnchorElement | null {
  return (
    thread.querySelector<HTMLAnchorElement>('a[href*="#discussion_r"]') ||
    thread.querySelector<HTMLAnchorElement>('a[href*="#pullrequestreview-"]') ||
    thread.querySelector<HTMLAnchorElement>('a[href^="#"]')
  );
}

function getThreadHref(thread: Element): string {
  const anchor = getThreadAnchor(thread);

  if (anchor?.href) {
    return anchor.href;
  }

  const id = getElementId(thread);
  return id ? `${location.pathname}${location.search}#${encodeURIComponent(id)}` : location.href;
}

function getThreadAuthor(thread: Element): string {
  const author =
    thread.querySelector<HTMLElement>(".author") ||
    thread.querySelector<HTMLElement>('a[data-hovercard-type="user"]') ||
    thread.querySelector<HTMLElement>('a[href^="/"][data-hovercard-url*="/users/"]');

  return normalizeText(author?.textContent) || "unknown";
}

function getThreadBody(thread: Element): string {
  const body =
    thread.querySelector<HTMLElement>(".js-comment-body") ||
    thread.querySelector<HTMLElement>(".comment-body") ||
    thread.querySelector<HTMLElement>(".markdown-body");

  return normalizeText(body?.textContent) || "コメント本文を取得できませんでした";
}

function getThreadLocation(thread: Element): string {
  const containerWithPath = thread.closest<HTMLElement>("[data-path]");
  const pathFromData = containerWithPath?.dataset.path;

  if (pathFromData) {
    return pathFromData;
  }

  const fileLink =
    thread.closest(".file")?.querySelector<HTMLElement>(".file-info a[title], .file-header a[title]") ||
    thread.querySelector<HTMLElement>('a[href*="/files#diff-"]') ||
    thread.querySelector<HTMLElement>(".file-info a, .file-header a");

  return normalizeText(fileLink?.getAttribute("title") || fileLink?.textContent) || "ファイル不明";
}

function getReviewCommentId(thread: Element, href: string): string {
  return (
    getElementId(thread) ||
    toUrl(href)?.hash.replace(/^#/, "") ||
    `${getThreadAuthor(thread)}:${getThreadLocation(thread)}:${getThreadBody(thread).slice(0, 80)}`
  );
}

function collectUnresolvedReviewComments(): ReviewCommentItem[] {
  if (!isPullRequestDetailPage()) {
    return [];
  }

  const comments = new Map<string, ReviewCommentItem>();

  document.querySelectorAll(REVIEW_THREAD_SELECTOR).forEach((thread) => {
    if (!isUnresolvedReviewThread(thread)) {
      return;
    }

    const href = getThreadHref(thread);
    const id = getReviewCommentId(thread, href);

    if (comments.has(id)) {
      return;
    }

    comments.set(id, {
      id,
      href,
      author: getThreadAuthor(thread),
      body: getThreadBody(thread),
      location: getThreadLocation(thread)
    });
  });

  return [...comments.values()];
}

function findPullRequestSidebar(): Element | null {
  return (
    document.querySelector("#partial-discussion-sidebar") ||
    document.querySelector('[data-testid="issue-sidebar"]') ||
    document.querySelector('aside[aria-label="Pull request sidebar"]') ||
    document.querySelector(".discussion-sidebar") ||
    document.querySelector(".Layout-sidebar")
  );
}

function findParticipantsSidebarItem(sidebar: Element): Element | null {
  const headings = [
    ...sidebar.querySelectorAll<HTMLElement>("h2, h3, h4, strong, .discussion-sidebar-heading")
  ];
  const heading = headings.find(
    (candidate) => normalizeText(candidate.textContent).toLowerCase() === "participants"
  );

  if (!heading) {
    return null;
  }

  const section = heading.closest(".discussion-sidebar-item, .BorderGrid-row, .clearfix, section");

  if (section && section !== sidebar) {
    return section;
  }

  let child: Element = heading;

  while (child.parentElement && child.parentElement !== sidebar) {
    child = child.parentElement;
  }

  return child.parentElement === sidebar ? child : null;
}

function getOrCreateReviewCommentsSection(sidebar: Element): HTMLElement {
  const existing = document.getElementById(REVIEW_COMMENTS_SECTION_ID);

  if (existing) {
    return existing;
  }

  const section = document.createElement("div");
  section.id = REVIEW_COMMENTS_SECTION_ID;
  section.className = "discussion-sidebar-item github-goggles-review-comments";

  const participants = findParticipantsSidebarItem(sidebar);

  if (participants?.parentElement) {
    participants.after(section);
  } else {
    sidebar.append(section);
  }

  return section;
}

function createReviewCommentListItem(comment: ReviewCommentItem): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "github-goggles-review-comment-item";

  const link = document.createElement("a");
  link.className = "github-goggles-review-comment-link";
  link.href = comment.href;

  const meta = document.createElement("span");
  meta.className = "github-goggles-review-comment-meta";
  meta.textContent = `${comment.author} - ${comment.location}`;

  const body = document.createElement("span");
  body.className = "github-goggles-review-comment-body";
  body.textContent = comment.body;

  link.append(meta, body);
  item.append(link);

  return item;
}

function renderReviewCommentsSection(section: HTMLElement, comments: ReviewCommentItem[]): void {
  const signature = JSON.stringify(comments.map((comment) => comment.id));

  if (section.dataset.githubGogglesSignature === signature) {
    return;
  }

  section.dataset.githubGogglesSignature = signature;
  section.replaceChildren();

  const heading = document.createElement("h3");
  heading.className = "discussion-sidebar-heading text-bold";
  heading.textContent = `未解決レビューコメント (${comments.length})`;
  section.append(heading);

  if (comments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "github-goggles-review-comments-empty";
    empty.textContent = "未解決のレビューコメントはありません";
    section.append(empty);
    return;
  }

  const list = document.createElement("ol");
  list.className = "github-goggles-review-comment-list";
  comments.forEach((comment) => list.append(createReviewCommentListItem(comment)));
  section.append(list);
}

function renderUnresolvedReviewComments(): void {
  if (!isPullRequestDetailPage()) {
    document.getElementById(REVIEW_COMMENTS_SECTION_ID)?.remove();
    return;
  }

  const sidebar = findPullRequestSidebar();

  if (!sidebar) {
    return;
  }

  renderReviewCommentsSection(getOrCreateReviewCommentsSection(sidebar), collectUnresolvedReviewComments());
}

let pending = false;

function enhanceGitHubPage(): void {
  decoratePullRequestAuthors();
  expandVideoLinks();
  renderUnresolvedReviewComments();
}

function scheduleEnhance(): void {
  if (pending) {
    return;
  }

  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    enhanceGitHubPage();
  });
}

enhanceGitHubPage();

new MutationObserver(scheduleEnhance).observe(document.body, {
  childList: true,
  subtree: true
});
