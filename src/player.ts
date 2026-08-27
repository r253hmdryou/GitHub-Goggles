const params = new URLSearchParams(location.search);
const source = params.get("src");
const label = params.get("label") || "添付動画";
const video = document.querySelector("video");
const fallbackLink = document.querySelector<HTMLAnchorElement>(".error a");

function getVideoUrl(value: string | null): URL | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && /\.(?:mp4|m4v|webm|ogv|ogg)$/i.test(url.pathname)
      ? url
      : null;
  } catch {
    return null;
  }
}

const videoUrl = getVideoUrl(source);

if (video && fallbackLink && videoUrl) {
  video.setAttribute("aria-label", label);
  video.src = videoUrl.toString();
  fallbackLink.href = videoUrl.toString();
  video.addEventListener("error", () => document.body.classList.add("is-error"));
  video.addEventListener("loadedmetadata", () => document.body.classList.remove("is-error"));
} else {
  document.body.classList.add("is-error");
  fallbackLink?.remove();
}
