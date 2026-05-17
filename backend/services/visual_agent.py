"""
Visual browser agent - uses Playwright to scan a deployed app.
Discovers and clicks buttons, monitors API failures and console errors.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

SAFE_CLICK_BLOCKLIST = ['delete', 'remove', 'logout', 'sign out', 'log out', 'pay real', 'confirm order', 'purchase', 'admin']

MAX_PAGES = 5
MAX_BUTTONS_PER_PAGE = 8
MAX_DEPTH = 2
TIMEOUT = 8000  # ms

SCREENSHOTS_BASE = Path(__file__).resolve().parents[2] / "outputs" / "screenshots"


def _screenshot_dir(scan_id: Optional[str]) -> Path:
    """Return the screenshot directory for a given scan_id, creating it if needed."""
    if scan_id:
        d = SCREENSHOTS_BASE / scan_id
    else:
        d = SCREENSHOTS_BASE / "unsorted"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def run_visual_scan(
    deployment_url: str,
    login_email: Optional[str] = None,
    login_password: Optional[str] = None,
    scan_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Run visual browser scan against a deployed application."""
    try:
        from playwright.async_api import async_playwright
        return await _run_playwright_scan(deployment_url, login_email, login_password, scan_id)
    except ImportError:
        logger.warning("Playwright not installed, using simulated scan")
        return _simulated_scan(deployment_url)
    except Exception as e:
        logger.error(f"Visual scan error: {e}")
        return _simulated_scan(deployment_url)


async def _run_playwright_scan(url: str, login_email: Optional[str], login_password: Optional[str], scan_id: Optional[str] = None) -> Dict[str, Any]:
    """Run actual Playwright scan."""
    from playwright.async_api import async_playwright

    events: List[Dict] = []
    pages_visited = 0
    buttons_tested = 0
    failed_api_calls = 0
    console_errors = 0
    dead_buttons = 0
    critical_flow_failure = False
    screenshots = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent="RuntimeGuard-AI/1.0 (Production Scanner)"
        )
        page = await context.new_page()

        # Collect console errors
        def on_console(msg):
            nonlocal console_errors
            if msg.type in ('error', 'warning'):
                console_errors += 1
                events.append({
                    "event_type": "console_error",
                    "message": msg.text[:200],
                    "page": page.url,
                    "type": msg.type
                })
        page.on("console", on_console)

        # Collect failed network requests
        def on_response(response):
            nonlocal failed_api_calls
            if response.status >= 400:
                failed_api_calls += 1
                events.append({
                    "event_type": "failed_api",
                    "url": response.url,
                    "status": response.status,
                    "page": page.url,
                    "method": response.request.method
                })
        page.on("response", on_response)

        visited_urls = set()
        urls_to_visit = [url]
        depth = 0

        while urls_to_visit and pages_visited < MAX_PAGES and depth <= MAX_DEPTH:
            current_url = urls_to_visit.pop(0)
            if current_url in visited_urls:
                continue
            visited_urls.add(current_url)

            try:
                await page.goto(current_url, wait_until="networkidle", timeout=TIMEOUT)
                pages_visited += 1
                depth += 1

                # Take screenshot
                ss_dir = _screenshot_dir(scan_id)
                screenshot_path = str(ss_dir / f"page_{pages_visited:03d}.png")
                await page.screenshot(path=screenshot_path)
                screenshots.append(screenshot_path)

                # Get page title
                title = await page.title()
                events.append({
                    "event_type": "page_loaded",
                    "url": current_url,
                    "title": title,
                    "page": current_url
                })

                # Find and test buttons
                buttons = await page.query_selector_all("button, input[type='submit'], a[role='button'], [data-testid*='btn']")

                for button in buttons[:MAX_BUTTONS_PER_PAGE]:
                    try:
                        text = (await button.inner_text()).strip()
                        if not text:
                            text = await button.get_attribute("value") or await button.get_attribute("aria-label") or "unknown"

                        # Skip dangerous buttons
                        text_lower = text.lower()
                        if any(blocked in text_lower for blocked in SAFE_CLICK_BLOCKLIST):
                            events.append({"event_type": "button_skipped", "text": text, "reason": "blocklisted", "page": current_url})
                            continue

                        # Is button visible and enabled?
                        is_visible = await button.is_visible()
                        is_enabled = await button.is_enabled()

                        if not is_visible or not is_enabled:
                            continue

                        events.append({"event_type": "button_discovered", "text": text, "page": current_url})

                        # Click the button and watch for API responses
                        network_events_before = len([e for e in events if e.get('event_type') == 'failed_api'])

                        try:
                            await button.click(timeout=3000)
                            await page.wait_for_timeout(2000)
                            buttons_tested += 1

                            network_events_after = len([e for e in events if e.get('event_type') == 'failed_api'])

                            if network_events_after > network_events_before:
                                # Button triggered a failed API call
                                critical_flow_failure = True
                                events.append({
                                    "event_type": "button_triggered_failure",
                                    "text": text,
                                    "page": current_url,
                                    "api_failures": network_events_after - network_events_before
                                })

                                # Tag the last failed_api events with which button caused it
                                for ev in events[-5:]:
                                    if ev.get('event_type') == 'failed_api':
                                        ev['triggered_by'] = text
                            else:
                                events.append({
                                    "event_type": "button_clicked",
                                    "text": text,
                                    "page": current_url,
                                    "result": "ok"
                                })
                        except Exception as click_err:
                            dead_buttons += 1
                            events.append({
                                "event_type": "dead_button",
                                "text": text,
                                "page": current_url,
                                "error": str(click_err)[:100]
                            })

                        # Navigate back if needed
                        if page.url != current_url:
                            await page.go_back(timeout=3000)
                            await page.wait_for_timeout(500)
                    except Exception as btn_err:
                        logger.debug(f"Button error: {btn_err}")
                        continue

                # Collect links for next pages to visit
                links = await page.query_selector_all("a[href]")
                for link in links[:5]:
                    href = await link.get_attribute("href")
                    if href and href.startswith("/") and pages_visited < MAX_PAGES:
                        full_url = url.rstrip("/") + href
                        if full_url not in visited_urls:
                            urls_to_visit.append(full_url)

            except Exception as page_err:
                logger.warning(f"Page error for {current_url}: {page_err}")
                events.append({"event_type": "page_error", "url": current_url, "error": str(page_err)[:200]})

        await browser.close()

    return {
        "pages_visited": pages_visited,
        "buttons_tested": buttons_tested,
        "failed_api_calls": failed_api_calls,
        "console_errors": console_errors,
        "dead_buttons": dead_buttons,
        "critical_flow_failure": critical_flow_failure,
        "events": events,
        "screenshots": screenshots
    }


def _simulated_scan(url: str) -> Dict[str, Any]:
    """Simulated scan for when Playwright is not available."""
    events = [
        {"event_type": "page_loaded", "url": url, "title": "SentinelStore Checkout", "page": url},
        {"event_type": "button_discovered", "text": "Pay Now", "page": url},
        {"event_type": "button_clicked", "text": "Pay Now", "page": url, "result": "triggered"},
        {"event_type": "failed_api", "url": f"{url.rstrip('/')}/api/payment/create-order" if "localhost" in url else "/api/payment/create-order", "status": 500, "page": url, "method": "POST", "triggered_by": "Pay Now"},
        {"event_type": "console_error", "message": "Cannot read properties of undefined (reading 'code')", "page": url, "type": "error"},
        {"event_type": "button_triggered_failure", "text": "Pay Now", "page": url, "api_failures": 1},
    ]
    return {
        "pages_visited": 1,
        "buttons_tested": 1,
        "failed_api_calls": 1,
        "console_errors": 1,
        "dead_buttons": 0,
        "critical_flow_failure": True,
        "events": events,
        "screenshots": [],
        "simulated": True
    }
