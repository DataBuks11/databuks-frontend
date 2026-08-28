"""DataBuks crawler service - Crawl4AI/Playwright based public website crawling.

Renders JS-heavy pages with Playwright, extracts clean evidence, persists
per-page rows to Supabase, then calls back to the Next.js API which runs
the DeepSeek synthesis (single source of truth for the AI layer).
"""

import asyncio
import json
import os
import re
import socket
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client

app = FastAPI(title="DataBuks Crawler Service")


@app.on_event("startup")
async def start_monitor_loop():
    asyncio.create_task(social_monitor_loop())

API_KEY = os.environ.get("CRAWLER_SERVICE_KEY", os.environ.get("BAILEYS_API_KEY", "dev-key"))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANALYZE_CALLBACK_URL = os.environ.get(
    "ANALYZE_CALLBACK_URL", "https://databuks-frontend.vercel.app/api/ai/website/analyze"
)

PRIVATE_IP_PATTERNS = [
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^0\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^169\.254\."),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
    re.compile(r"^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\."),
    re.compile(r"^::1$"),
    re.compile(r"^fc", re.IGNORECASE),
    re.compile(r"^fd", re.IGNORECASE),
    re.compile(r"^fe80:", re.IGNORECASE),
]

IGNORED_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "file:")
ASSET_EXTENSIONS = re.compile(
    r"\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|mp4|mp3|zip|woff2?|ttf|otf)(\?.*)?$", re.IGNORECASE
)
PDF_EXTENSION = re.compile(r"\.pdf(\?.*)?$", re.IGNORECASE)

SOCIAL_HOSTS = {
    "instagram": re.compile(r"instagram\.com", re.IGNORECASE),
    "facebook": re.compile(r"facebook\.com", re.IGNORECASE),
    "linkedin": re.compile(r"linkedin\.com", re.IGNORECASE),
    "twitter": re.compile(r"(twitter|x)\.com", re.IGNORECASE),
    "youtube": re.compile(r"youtube\.com", re.IGNORECASE),
    "whatsapp": re.compile(r"wa\.me", re.IGNORECASE),
    "telegram": re.compile(r"t\.me", re.IGNORECASE),
    "tiktok": re.compile(r"tiktok\.com", re.IGNORECASE),
    "github": re.compile(r"github\.com", re.IGNORECASE),
    "behance": re.compile(r"behance\.net", re.IGNORECASE),
    "dribbble": re.compile(r"dribbble\.com", re.IGNORECASE),
}

PAGE_TYPE_SIGNALS = [
    ("home", re.compile(r"^/$")),
    ("pricing", re.compile(r"pric|plan|package|cost", re.IGNORECASE)),
    ("service", re.compile(r"service|solution|what-we-do|offer", re.IGNORECASE)),
    ("product", re.compile(r"product|feature|platform", re.IGNORECASE)),
    ("about", re.compile(r"about|our-story|company|who-we-are|team", re.IGNORECASE)),
    ("contact", re.compile(r"contact|get-in-touch|reach-us", re.IGNORECASE)),
    ("portfolio", re.compile(r"portfolio|work|project", re.IGNORECASE)),
    ("case_study", re.compile(r"case-stud|case_stud|client-story|success", re.IGNORECASE)),
    ("testimonial", re.compile(r"testimonial|review|feedback", re.IGNORECASE)),
    ("blog", re.compile(r"blog|article|insight|news", re.IGNORECASE)),
    ("faq", re.compile(r"faq|frequently", re.IGNORECASE)),
    ("career", re.compile(r"career|job|hiring", re.IGNORECASE)),
    ("location", re.compile(r"location|office|branch", re.IGNORECASE)),
    ("industry", re.compile(r"industr|sector", re.IGNORECASE)),
    ("documentation", re.compile(r"doc|guide|reference|api", re.IGNORECASE)),
    ("legal", re.compile(r"privacy|terms|legal|policy", re.IGNORECASE)),
]


def resolve_hostname(host: str) -> List[str]:
    try:
        infos = socket.getaddrinfo(host, None, socket.AF_UNSPEC)
        return list({info[4][0] for info in infos})
    except Exception:
        return []


def is_private_host(host: str) -> bool:
    h = host.lower().strip("[]")
    if h in ("localhost",) or h.endswith(".localhost") or h.endswith(".local") or h.endswith(".internal"):
        return True
    if "metadata" in h:
        return True
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", h):
        return any(p.search(h) for p in PRIVATE_IP_PATTERNS)
    if ":" in h:
        return any(p.search(h) for p in PRIVATE_IP_PATTERNS)
    return False


def is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if parsed.hostname is None:
        return False
    if is_private_host(parsed.hostname):
        return False
    for ip in resolve_hostname(parsed.hostname):
        if is_private_host(ip):
            return False
    return True


def normalize_url(raw: str) -> Optional[str]:
    value = raw.strip()
    if not value:
        return None
    if any(value.lower().startswith(s) for s in IGNORED_SCHEMES):
        return None
    if not re.match(r"^[a-z][a-z0-9+.-]*://", value, re.IGNORECASE):
        value = "https://" + value
    try:
        parsed = urlparse(value)
    except Exception:
        return None
    if parsed.scheme not in ("http", "https"):
        return None
    host = parsed.hostname or ""
    if is_private_host(host):
        return None
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    query = parsed.query
    return f"{parsed.scheme}://{host}{path}" + (f"?{query}" if query else "")


def same_registered_domain(a: str, b: str) -> bool:
    def reg(host: str) -> str:
        parts = host.lower().split(".")
        return ".".join(parts[-2:]) if len(parts) >= 2 else host.lower()
    return reg(a) == reg(b)


def classify_page(url: str, title: str, headings: List[str]) -> str:
    path = urlparse(url).path or "/"
    haystack = f"{path} {title} {' '.join(headings[:6])}"
    for page_type, pattern in PAGE_TYPE_SIGNALS:
        if pattern.search(haystack):
            return page_type
    return "other"


def looks_like_js_shell(text: str, html_len: int, link_count: int, heading_count: int) -> bool:
    return len(text) < 400 and html_len < 8000 and heading_count == 0 and link_count < 8


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_links_simple(html: str, base_url: str) -> List[str]:
    links = []
    for match in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\']', html, re.IGNORECASE):
        href = match.group(1)
        if any(href.lower().startswith(s) for s in IGNORED_SCHEMES):
            continue
        try:
            links.append(urljoin(base_url, href))
        except Exception:
            continue
    seen = set()
    unique = []
    for link in links:
        if link not in seen:
            seen.add(link)
            unique.append(link)
    return unique


class CrawlRequest(BaseModel):
    scan_id: str
    user_id: str
    url: str
    # Defaults: 40 pages, depth 4. Most business sites need ≤ 40 pages.
    # For very large sites, the client can pass lower values to keep
    # crawl time + LLM cost reasonable.
    max_pages: int = 40
    max_depth: int = 4


async def require_key(request: Request) -> None:
    provided = request.headers.get("x-api-key", "")
    if provided != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def supabase_client() -> Any:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def update_scan(sb: Any, scan_id: str, payload: Dict[str, Any]) -> None:
    if sb is None:
        return
    try:
        sb.table("website_scans").update(payload).eq("id", scan_id).execute()
    except Exception as exc:
        print(f"[scan] status update failed: {exc}")


async def insert_page(sb: Any, page: Dict[str, Any]) -> None:
    if sb is None:
        return
    try:
        sb.table("website_scan_pages").insert(page).execute()
    except Exception as exc:
        print(f"[scan] page insert failed: {exc}")


async def fetch_static(url: str, timeout: float = 12.0) -> Optional[httpx.Response]:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (compatible; DataBuksCrawler/1.0)"},
        ) as client:
            response = await client.get(url)
            if response.status_code >= 400:
                return None
            final_url = str(response.url)
            if not is_safe_url(final_url):
                return None
            return response
    except Exception:
        return None


def extract_static_evidence(response: httpx.Response, page_url: str, depth: int) -> Dict[str, Any]:
    html = response.text
    final_url = str(response.url)
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = clean_text(re.sub(r"<[^>]+>", "", title_match.group(1))) if title_match else ""
    meta_match = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', html, re.IGNORECASE
    )
    description = meta_match.group(1) if meta_match else ""
    canonical_match = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', html, re.IGNORECASE)
    canonical = canonical_match.group(1) if canonical_match else None
    headings = [clean_text(re.sub(r"<[^>]+>", "", m)) for m in re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html, re.IGNORECASE | re.DOTALL)]
    headings = [h for h in headings if h and len(h) <= 300][:40]
    body = re.sub(r"<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    text = clean_text(re.sub(r"<[^>]+>", " ", body))
    if len(text) > 40000:
        text = text[:40000]
    links = extract_links_simple(html, final_url)
    emails = list(dict.fromkeys(re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", html)))
    phones = list(dict.fromkeys(re.findall(r"(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}", html)))[:5]
    social = []
    for link in links:
        parsed = urlparse(link)
        for platform, pattern in SOCIAL_HOSTS.items():
            if pattern.search(parsed.netloc):
                social.append({"platform": platform, "url": link})
                break
    jsonld = []
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.IGNORECASE | re.DOTALL):
        try:
            jsonld.append(json.loads(match.group(1)))
        except Exception:
            continue
    return {
        "url": page_url,
        "final_url": final_url,
        "canonical_url": canonical,
        "title": title,
        "description": description,
        "headings": headings,
        "text": text,
        "links": links,
        "social_links": social,
        "emails": emails,
        "phones": phones,
        "structured_data": jsonld,
        "rendered": False,
        "render_method": "static",
        "html_len": len(html),
    }


def extract_rendered_evidence(result: Any, page_url: str, depth: int) -> Dict[str, Any]:
    html = getattr(result, "html", "") or ""
    cleaned = getattr(result, "cleaned_html", "") or ""
    markdown = getattr(result, "markdown", "") or ""
    text = markdown if markdown else clean_text(re.sub(r"<[^>]+>", " ", cleaned or html))
    if len(text) > 40000:
        text = text[:40000]
    title = clean_text(getattr(result, "title", "") or "")
    headings = []
    for match in re.finditer(r"<h[1-3][^>]*>(.*?)</h[1-3]>", cleaned or html, re.IGNORECASE | re.DOTALL):
        heading = clean_text(re.sub(r"<[^>]+>", "", match.group(1)))
        if heading and len(heading) <= 300:
            headings.append(heading)
    headings = headings[:40]
    links = extract_links_simple(html or cleaned, page_url)
    emails = list(dict.fromkeys(re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", html or markdown)))
    phones = list(dict.fromkeys(re.findall(r"(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}", html or markdown)))[:5]
    social = []
    for link in links:
        parsed = urlparse(link)
        for platform, pattern in SOCIAL_HOSTS.items():
            if pattern.search(parsed.netloc):
                social.append({"platform": platform, "url": link})
                break
    return {
        "url": page_url,
        "final_url": page_url,
        "canonical_url": None,
        "title": title,
        "description": "",
        "headings": headings,
        "text": text,
        "links": links,
        "social_links": social,
        "emails": emails,
        "phones": phones,
        "structured_data": [],
        "rendered": True,
        "render_method": "crawl4ai",
        "html_len": len(html),
    }


async def discover(sb: Any, base_url: str, max_pages: int) -> tuple[List[Dict[str, Any]], List[str]]:
    """Robots + sitemap discovery returning (queue_items, docs)."""
    parsed_base = urlparse(base_url)
    root = f"{parsed_base.scheme}://{parsed_base.netloc}"
    queue: Dict[str, Dict[str, Any]] = {}
    docs: List[str] = []

    robots_url = f"{root}/robots.txt"
    robots_text = ""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            response = await client.get(robots_url)
            if response.status_code < 400 and is_safe_url(str(response.url)):
                robots_text = response.text
    except Exception:
        pass

    sitemap_candidates: List[str] = []
    for line in robots_text.splitlines():
        match = re.match(r"^\s*sitemap\s*:\s*(\S+)", line, re.IGNORECASE)
        if match:
            sitemap_candidates.append(match.group(1).strip())
    for candidate in (f"{root}/sitemap.xml", f"{root}/sitemap_index.xml"):
        if candidate not in sitemap_candidates:
            sitemap_candidates.append(candidate)

    visited_sitemaps = set()
    async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as client:
        index = 0
        while index < len(sitemap_candidates) and len(visited_sitemaps) < 20:
            sitemap_url = sitemap_candidates[index]
            index += 1
            if sitemap_url in visited_sitemaps:
                continue
            visited_sitemaps.add(sitemap_url)
            try:
                if not is_safe_url(sitemap_url):
                    continue
                response = await client.get(sitemap_url)
                if response.status_code >= 400:
                    continue
                if not is_safe_url(str(response.url)):
                    continue
                locs = re.findall(r"<loc[^>]*>\s*([^<]+?)\s*</loc>", response.text)
                for loc in locs:
                    try:
                        normalized = normalize_url(loc.strip())
                        if not normalized:
                            continue
                        if normalized.lower().endswith(".xml"):
                            if normalized not in sitemap_candidates:
                                sitemap_candidates.append(normalized)
                            continue
                        if PDF_EXTENSION.search(urlparse(normalized).path):
                            docs.append(normalized)
                            continue
                        if ASSET_EXTENSIONS.search(urlparse(normalized).path):
                            continue
                        if normalized not in queue:
                            queue[normalized] = {"url": normalized, "depth": 1, "priority": 20, "source": "sitemap"}
                            if len(queue) >= max_pages:
                                break
                    except Exception:
                        continue
                print(f"[discover] sitemap {sitemap_url}: {len(locs)} urls")
            except Exception:
                continue

    queue[base_url] = {"url": base_url, "depth": 0, "priority": 100, "source": "submitted"}
    return list(queue.values()), docs


def page_priority(url: str) -> int:
    path = urlparse(url).path.lower() or "/"
    signals = [
        (re.compile(r"^/$"), 100),
        (re.compile(r"pric|plan|package"), 95),
        (re.compile(r"service|solution"), 90),
        (re.compile(r"product|feature"), 90),
        (re.compile(r"about|company|team"), 80),
        (re.compile(r"case-stud|portfolio|work"), 78),
        (re.compile(r"testimonial|review|client"), 78),
        (re.compile(r"industr"), 76),
        (re.compile(r"contact"), 75),
        (re.compile(r"faq"), 70),
        (re.compile(r"blog|article|news|insight"), 60),
        (re.compile(r"career"), 60),
    ]
    for pattern, score in signals:
        if pattern.search(path):
            return score
    return 30


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "supabase": bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)})


@app.post("/crawl")
async def crawl(request: Request) -> JSONResponse:
    await require_key(request)
    body = await request.json()
    payload = CrawlRequest(**body)
    sb = supabase_client()

    base = normalize_url(payload.url)
    if not base:
        return JSONResponse({"ok": False, "error": "invalid url"}, status_code=400)
    if not is_safe_url(base):
        return JSONResponse({"ok": False, "error": "url blocked (SSRF)"}, status_code=400)

    asyncio.create_task(run_crawl(payload, sb, base))
    return JSONResponse({"ok": True, "queued": True})


async def run_crawl(payload: CrawlRequest, sb: Any, base: str) -> None:
    scan_id = payload.scan_id
    user_id = payload.user_id
    started = time.time()
    timeout_s = float(os.environ.get("CRAWL_TIMEOUT_S", "420"))

    await update_scan(sb, scan_id, {"status": "SCANNING", "updated_at": now_iso()})

    try:
        queue_items, docs = await discover(sb, base, payload.max_pages)
    except Exception as exc:
        print(f"[crawl] discovery failed: {exc}")
        queue_items, docs = [], []

    await update_scan(
        sb,
        scan_id,
        {
            "status": "EXTRACTING",
            "pages_discovered": len(queue_items),
            "updated_at": now_iso(),
        },
    )

    visited: set = set()
    crawled_rows = 0
    rendered_rows = 0
    failed_rows = 0
    queue = sorted(queue_items, key=lambda item: item["priority"], reverse=True)
    shared_crawler: Optional[Any] = None

    async def get_shared_crawler() -> Any:
        nonlocal shared_crawler
        if shared_crawler is None:
            from crawl4ai import AsyncWebCrawler
            shared_crawler = AsyncWebCrawler()
            await shared_crawler.__aenter__()
        return shared_crawler

    async def process_item(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        nonlocal crawled_rows, rendered_rows, failed_rows
        url = item["url"]
        if url in visited:
            return None
        visited.add(url)
        depth = item["depth"]
        if depth > payload.max_depth:
            return None
        if crawled_rows >= payload.max_pages or time.time() - started > timeout_s:
            return None

        evidence = None
        response = await fetch_static(url)
        if response is not None:
            static_evidence = extract_static_evidence(response, url, depth)
            link_count = len(static_evidence["links"])
            heading_count = len(static_evidence["headings"])
            if looks_like_js_shell(static_evidence["text"], static_evidence["html_len"], link_count, heading_count):
                evidence = await render_with_crawl4ai(url, await get_shared_crawler())
                if evidence is None:
                    evidence = static_evidence
                    evidence["rendered"] = False
                    evidence["render_method"] = "static"
            else:
                evidence = static_evidence
                evidence["rendered"] = False
                evidence["render_method"] = "static"
        else:
            evidence = await render_with_crawl4ai(url, await get_shared_crawler())
            if evidence is None:
                failed_rows += 1
                return {"url": url, "failed": True}

        crawled_rows += 1
        if evidence["rendered"]:
            rendered_rows += 1

        page_type = classify_page(url, evidence["title"], evidence["headings"])
        word_count = len(evidence["text"].split())
        content_hash = str(abs(hash(evidence["text"][:2000]))) if evidence["text"] else "empty"

        language = "unknown"
        hindi_chars = len(re.findall(r"[\u0900-\u097F]", evidence["text"]))
        if hindi_chars > word_count * 0.05:
            language = "hindi" if hindi_chars > word_count * 0.4 else "hinglish"
        elif re.search(r"[a-zA-Z]{5,}", evidence["text"]):
            language = "english"

        row = {
            "scan_id": scan_id,
            "user_id": user_id,
            "url": url,
            "final_url": evidence.get("final_url") or url,
            "canonical_url": evidence.get("canonical_url"),
            "page_title": evidence["title"][:500] or None,
            "page_type": page_type,
            "depth": depth,
            "content_hash": content_hash,
            "content": evidence["text"],
            "status": "crawled",
            "http_status": 200,
            "rendered": evidence["rendered"],
            "render_method": evidence["render_method"],
            "word_count": word_count,
            "links_found": len(evidence["links"]),
            "language": language,
            "social_links": evidence["social_links"],
            "emails": evidence["emails"],
            "phones": evidence["phones"],
            "structured_data": evidence["structured_data"],
        }
        await insert_page(sb, row)
        return {"url": url, "failed": False, "links": evidence["links"]}

    index = 0
    while index < len(queue) and crawled_rows < payload.max_pages and time.time() - started < timeout_s:
        batch = queue[index : index + 3]
        index += len(batch)
        results = await asyncio.gather(*[process_item(item) for item in batch])
        for result in results:
            if result and not result.get("failed"):
                for link in result["links"]:
                    if len(queue) >= payload.max_pages * 2:
                        break
                    normalized = normalize_url(link)
                    if not normalized or normalized in visited:
                        continue
                    parsed = urlparse(normalized)
                    if not is_safe_url(normalized):
                        continue
                    if not same_registered_domain(parsed.hostname or "", urlparse(base).hostname or ""):
                        continue
                    if ASSET_EXTENSIONS.search(parsed.path) or PDF_EXTENSION.search(parsed.path):
                        continue
                    queue.append({"url": normalized, "depth": result.get("_depth", 1) + 1, "priority": page_priority(normalized), "source": "links"})

    if shared_crawler is not None:
        try:
            await shared_crawler.__aexit__(None, None, None)
        except Exception:
            pass

    await update_scan(
        sb,
        scan_id,
        {
            "pages_scanned": crawled_rows,
            "pages_rendered": rendered_rows,
            "pages_discovered": len(queue),
            "updated_at": now_iso(),
        },
    )

    if crawled_rows == 0:
        await update_scan(
            sb,
            scan_id,
            {"status": "FAILED", "error_message": "No useful public content found", "completed_at": now_iso()},
        )
        return

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                ANALYZE_CALLBACK_URL,
                headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
                json={"scan_id": scan_id, "user_id": user_id},
            )
    except Exception as exc:
        print(f"[crawl] analyze callback failed: {exc}")
        await update_scan(
            sb,
            scan_id,
            {"status": "FAILED", "error_message": f"Analyze callback failed: {exc}", "completed_at": now_iso()},
        )


async def render_with_crawl4ai(url: str, crawler: Any) -> Optional[Dict[str, Any]]:
    try:
        from crawl4ai import CrawlerRunConfig, CacheMode

        config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            wait_for="js:() => document.body && document.body.innerText.trim().length > 200",
            page_timeout=20000,
        )
        result = await crawler.arun(url=url, config=config)
        if result is None or not getattr(result, "success", False):
            return None
        text = (getattr(result, "markdown", "") or "").strip()
        if len(text) < 80:
            return None
        return extract_rendered_evidence(result, url, 0)
    except Exception as exc:
        print(f"[render] crawl4ai failed for {url}: {exc}")
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def social_monitor_loop() -> None:
    """Poll the Vercel social monitor endpoint on a fixed interval."""
    monitor_url = os.environ.get("SOCIAL_MONITOR_URL")
    monitor_key = os.environ.get("SOCIAL_MONITOR_KEY")
    interval_s = float(os.environ.get("SOCIAL_MONITOR_INTERVAL_S", "600"))
    if not monitor_url:
        print("[monitor] SOCIAL_MONITOR_URL not set - social monitor loop disabled")
        return
    while True:
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    monitor_url,
                    headers={"x-api-key": monitor_key or "dev-key"},
                )
                print(f"[monitor] run -> HTTP {response.status_code}")
        except Exception as exc:
            print(f"[monitor] run failed: {exc}")
        await asyncio.sleep(interval_s)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
