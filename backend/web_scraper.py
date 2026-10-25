"""
Web scraping and real-time search utilities for the interview agent.
Uses DuckDuckGo (no API key required) + httpx + BeautifulSoup.
"""

import logging
import re

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

MAX_CONTENT_CHARS = 3000
REQUEST_TIMEOUT = 10

SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def web_search(query: str, max_results: int = 4) -> str:
    """
    Search the web using DuckDuckGo and return summarised results.
    No API key required.

    Args:
        query: Search query string
        max_results: Maximum number of results to return

    Returns:
        Formatted search results as a string
    """
    try:
        from duckduckgo_search import DDGS

        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(
                    f"Title: {r['title']}\n"
                    f"Summary: {r['body']}\n"
                    f"URL: {r['href']}"
                )

        if not results:
            return f"No search results found for: {query}"

        return "\n\n---\n\n".join(results)

    except Exception as e:
        logger.error(f"Web search error for '{query}': {e}")
        return f"Web search failed: {e!s}"


def scrape_page(url: str, max_chars: int = MAX_CONTENT_CHARS) -> str:
    """
    Scrape readable text content from a webpage.

    Args:
        url: URL to scrape
        max_chars: Maximum characters to return

    Returns:
        Extracted text content
    """
    try:
        resp = httpx.get(
            url,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
            headers=SCRAPE_HEADERS,
        )
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        # Remove noise elements
        for tag in soup(["script", "style", "nav", "footer", "header",
                          "aside", "form", "iframe", "noscript"]):
            tag.decompose()

        # Prefer main content areas
        main = (
            soup.find("main")
            or soup.find("article")
            or soup.find(id=re.compile(r"content|main|body", re.I))
            or soup.body
        )
        text = main.get_text(separator=" ", strip=True) if main else soup.get_text(separator=" ", strip=True)

        # Collapse whitespace
        text = re.sub(r"\s+", " ", text).strip()

        return text[:max_chars] if text else "No readable content found on this page."

    except Exception as e:
        logger.error(f"Scrape error for '{url}': {e}")
        return f"Could not scrape page: {e!s}"


def search_and_summarise(query: str, max_results: int = 3) -> str:
    """
    Search the web and optionally fetch the top result for more detail.

    Args:
        query: Search query
        max_results: Number of search results

    Returns:
        Combined search summary
    """
    try:
        from duckduckgo_search import DDGS

        results = []
        top_url = None

        with DDGS() as ddgs:
            for i, r in enumerate(ddgs.text(query, max_results=max_results)):
                results.append(
                    f"[{i+1}] {r['title']}\n{r['body']}\nURL: {r['href']}"
                )
                if i == 0:
                    top_url = r["href"]

        summary = "\n\n".join(results) if results else "No results found."

        # Optionally scrape top result for deeper context
        if top_url and len(results) > 0:
            page_content = scrape_page(top_url, max_chars=1500)
            if page_content and "Could not scrape" not in page_content:
                summary += f"\n\n=== Detailed content from top result ===\n{page_content}"

        return summary

    except Exception as e:
        logger.error(f"Search and summarise error: {e}")
        return web_search(query, max_results)  # Fallback to simple search
