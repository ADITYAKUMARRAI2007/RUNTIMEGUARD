"""
Visual browser agent - uses Playwright to scan a deployed app.
Detects: API failures, console errors, dead buttons, UI/UX issues,
mobile responsiveness, icon rendering, and auth flow problems.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

SAFE_CLICK_BLOCKLIST = ['delete', 'remove', 'pay real', 'confirm order', 'purchase', 'admin', 'danger']
AUTH_KEYWORDS = ['sign in', 'signin', 'sign up', 'signup', 'log in', 'login', 'log out', 'logout',
                 'sign out', 'signout', 'register', 'create account', 'get started', 'join']

MAX_PAGES = 5
MAX_BUTTONS_PER_PAGE = 10
MAX_DEPTH = 2
TIMEOUT = 10000

SCREENSHOTS_BASE = Path(__file__).resolve().parents[2] / "outputs" / "screenshots"

MOBILE_VIEWPORT  = {"width": 390,  "height": 844}   # iPhone 14
TABLET_VIEWPORT  = {"width": 768,  "height": 1024}
DESKTOP_VIEWPORT = {"width": 1280, "height": 720}


def _screenshot_dir(scan_id: Optional[str]) -> Path:
    d = SCREENSHOTS_BASE / (scan_id or "unsorted")
    d.mkdir(parents=True, exist_ok=True)
    return d


async def run_visual_scan(
    deployment_url: str,
    login_email: Optional[str] = None,
    login_password: Optional[str] = None,
    scan_id: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        from playwright.async_api import async_playwright
        return await _run_playwright_scan(deployment_url, login_email, login_password, scan_id)
    except ImportError:
        logger.warning("Playwright not installed, using simulated scan")
        return _simulated_scan(deployment_url)
    except Exception as e:
        logger.error(f"Visual scan error: {e}")
        return _simulated_scan(deployment_url)


async def _run_playwright_scan(
    url: str,
    login_email: Optional[str],
    login_password: Optional[str],
    scan_id: Optional[str] = None,
) -> Dict[str, Any]:
    from playwright.async_api import async_playwright

    events: List[Dict] = []
    pages_visited = 0
    buttons_tested = 0
    failed_api_calls = 0
    console_errors_count = 0
    dead_buttons = 0
    critical_flow_failure = False
    screenshots = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ── Desktop pass ──────────────────────────────────────────────────────
        context = await browser.new_context(
            viewport=DESKTOP_VIEWPORT,
            user_agent="RuntimeGuard-AI/1.0 (Production Scanner)"
        )
        page = await context.new_page()

        def on_console(msg):
            nonlocal console_errors_count
            if msg.type in ('error', 'warning'):
                console_errors_count += 1
                events.append({
                    "event_type": "console_error",
                    "message": msg.text[:200],
                    "page": page.url,
                    "type": msg.type
                })

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

        page.on("console", on_console)
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

                ss_dir = _screenshot_dir(scan_id)
                ss_path = str(ss_dir / f"desktop_{pages_visited:03d}.png")
                await page.screenshot(path=ss_path, full_page=True)
                screenshots.append(ss_path)

                title = await page.title()
                events.append({"event_type": "page_loaded", "url": current_url, "title": title, "page": current_url})

                # ── UI / UX checks ─────────────────────────────────────────────
                await _check_ui_issues(page, current_url, events)

                # ── Icon rendering check ───────────────────────────────────────
                await _check_icons(page, current_url, events)

                # ── Auth flow detection ────────────────────────────────────────
                auth_result = await _check_auth_flow(page, current_url, events, login_email, login_password)
                if auth_result:
                    buttons_tested += 1

                # ── Button scan ────────────────────────────────────────────────
                buttons = await page.query_selector_all(
                    "button, input[type='submit'], a[role='button'], [data-testid*='btn'], [class*='btn']:not(div)"
                )

                for button in buttons[:MAX_BUTTONS_PER_PAGE]:
                    try:
                        text = (await button.inner_text()).strip()
                        if not text:
                            text = (await button.get_attribute("value") or
                                    await button.get_attribute("aria-label") or
                                    await button.get_attribute("title") or "unknown")
                        text = text[:60]
                        text_lower = text.lower()

                        if any(blocked in text_lower for blocked in SAFE_CLICK_BLOCKLIST):
                            events.append({"event_type": "button_skipped", "text": text, "reason": "blocklisted", "page": current_url})
                            continue

                        # Auth buttons handled separately
                        if any(k in text_lower for k in AUTH_KEYWORDS):
                            continue

                        is_visible = await button.is_visible()
                        is_enabled = await button.is_enabled()
                        if not is_visible or not is_enabled:
                            continue

                        events.append({"event_type": "button_discovered", "text": text, "page": current_url})
                        before = len([e for e in events if e.get('event_type') == 'failed_api'])

                        try:
                            await button.click(timeout=3000)
                            await page.wait_for_timeout(1500)
                            buttons_tested += 1

                            after = len([e for e in events if e.get('event_type') == 'failed_api'])
                            if after > before:
                                critical_flow_failure = True
                                events.append({"event_type": "button_triggered_failure", "text": text, "page": current_url, "api_failures": after - before})
                                for ev in events[-5:]:
                                    if ev.get('event_type') == 'failed_api':
                                        ev['triggered_by'] = text
                            else:
                                # Check if button did anything (nav/DOM change)
                                new_url = page.url
                                events.append({"event_type": "button_clicked", "text": text, "page": current_url, "result": "ok", "navigated": new_url != current_url})

                        except Exception as click_err:
                            dead_buttons += 1
                            events.append({"event_type": "dead_button", "text": text, "page": current_url, "error": str(click_err)[:100]})

                        if page.url != current_url:
                            await page.go_back(timeout=3000)
                            await page.wait_for_timeout(500)

                    except Exception:
                        continue

                # Collect links
                links = await page.query_selector_all("a[href]")
                for link in links[:5]:
                    href = await link.get_attribute("href")
                    if href and href.startswith("/") and pages_visited < MAX_PAGES:
                        full = url.rstrip("/") + href
                        if full not in visited_urls:
                            urls_to_visit.append(full)

            except Exception as page_err:
                logger.warning(f"Page error for {current_url}: {page_err}")
                events.append({"event_type": "page_error", "url": current_url, "error": str(page_err)[:200]})

        await context.close()

        # ── Mobile responsiveness pass ─────────────────────────────────────────
        mobile_events = await _check_mobile_responsiveness(browser, url, scan_id, screenshots)
        events.extend(mobile_events)

        await browser.close()

    return {
        "pages_visited": pages_visited,
        "buttons_tested": buttons_tested,
        "failed_api_calls": failed_api_calls,
        "console_errors": console_errors_count,
        "dead_buttons": dead_buttons,
        "critical_flow_failure": critical_flow_failure,
        "events": events,
        "screenshots": screenshots
    }


# ── UI / UX checks ─────────────────────────────────────────────────────────────

async def _check_ui_issues(page, url: str, events: list):
    """Detect broken images, empty links, accessibility issues."""
    try:
        results = await page.evaluate("""() => {
            const issues = [];

            // Broken images
            document.querySelectorAll('img').forEach(img => {
                if (!img.complete || img.naturalWidth === 0) {
                    issues.push({ type: 'broken_image', src: img.src || img.getAttribute('src') || '(no src)', alt: img.alt });
                }
            });

            // Empty links (href="#" or href="")
            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (href === '#' || href === '' || href === 'javascript:void(0)') {
                    const text = a.innerText.trim().slice(0, 40);
                    if (text) issues.push({ type: 'empty_link', text, href });
                }
            });

            // Buttons with no accessible text
            document.querySelectorAll('button').forEach(btn => {
                const text = btn.innerText.trim();
                const label = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
                if (!text && !label) {
                    issues.push({ type: 'inaccessible_button', class: btn.className.slice(0, 60) });
                }
            });

            // Inputs with no label
            document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])').forEach(input => {
                const id = input.id;
                const hasLabel = id && document.querySelector('label[for="' + id + '"]');
                const hasAria = input.getAttribute('aria-label') || input.getAttribute('placeholder');
                if (!hasLabel && !hasAria) {
                    issues.push({ type: 'unlabeled_input', inputType: input.type, name: input.name });
                }
            });

            return issues;
        }""")

        for issue in (results or [])[:10]:
            itype = issue.get("type", "ui_issue")
            if itype == "broken_image":
                events.append({"event_type": "ui_issue", "issue": "broken_image",
                                "detail": f"Broken image: {issue.get('src','')[:80]}", "page": url, "severity": "medium"})
            elif itype == "empty_link":
                events.append({"event_type": "ui_issue", "issue": "empty_link",
                                "detail": f"Empty link: \"{issue.get('text','')}\" → {issue.get('href','')}", "page": url, "severity": "low"})
            elif itype == "inaccessible_button":
                events.append({"event_type": "ui_issue", "issue": "inaccessible_button",
                                "detail": f"Button with no accessible label (class: {issue.get('class','')})", "page": url, "severity": "medium"})
            elif itype == "unlabeled_input":
                events.append({"event_type": "ui_issue", "issue": "unlabeled_input",
                                "detail": f"Input[{issue.get('inputType','')}] '{issue.get('name','')}' has no label", "page": url, "severity": "low"})

    except Exception as e:
        logger.debug(f"UI check error: {e}")


async def _check_icons(page, url: str, events: list):
    """Check if icon fonts and SVG icons render correctly."""
    try:
        results = await page.evaluate("""() => {
            const issues = [];

            // Check for icon font libraries in stylesheets
            const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
            const hasFA = styleLinks.some(h => h.includes('font-awesome') || h.includes('fontawesome'));
            const hasMI = styleLinks.some(h => h.includes('material-icons') || h.includes('material-symbols'));

            // Check <i> icon elements render something
            const iconEls = document.querySelectorAll('i[class*="fa"], i[class*="icon"], span[class*="icon"]');
            let brokenCount = 0;
            iconEls.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) brokenCount++;
            });
            if (brokenCount > 0) {
                issues.push({ type: 'broken_icon_font', count: brokenCount });
            }

            // Check SVG icons
            const svgs = document.querySelectorAll('svg');
            let emptySvgs = 0;
            svgs.forEach(svg => {
                if (svg.children.length === 0) emptySvgs++;
            });
            if (emptySvgs > 0) {
                issues.push({ type: 'empty_svg', count: emptySvgs });
            }

            // Check img used as icon (tiny images)
            document.querySelectorAll('img').forEach(img => {
                const w = img.naturalWidth, h = img.naturalHeight;
                if (img.complete && (w === 0 || h === 0)) {
                    issues.push({ type: 'broken_icon_image', src: (img.src || '').slice(0, 80) });
                }
            });

            return issues;
        }""")

        for issue in (results or [])[:5]:
            itype = issue.get("type")
            if itype == "broken_icon_font":
                events.append({"event_type": "ui_issue", "issue": "broken_icon_font",
                                "detail": f"{issue.get('count', '?')} icon font element(s) rendered with zero size — icon font may not be loading",
                                "page": url, "severity": "medium"})
            elif itype == "empty_svg":
                events.append({"event_type": "ui_issue", "issue": "empty_svg",
                                "detail": f"{issue.get('count', '?')} empty <svg> element(s) — icons may be missing paths",
                                "page": url, "severity": "low"})
            elif itype == "broken_icon_image":
                events.append({"event_type": "ui_issue", "issue": "broken_icon_image",
                                "detail": f"Icon image failed to load: {issue.get('src', '')}", "page": url, "severity": "medium"})

    except Exception as e:
        logger.debug(f"Icon check error: {e}")


# ── Auth flow ──────────────────────────────────────────────────────────────────

async def _check_auth_flow(page, url: str, events: list, email: Optional[str], password: Optional[str]) -> bool:
    """Detect sign-in/sign-out buttons and test them."""
    try:
        auth_buttons = await page.query_selector_all("button, a, [role='button']")
        found_auth = False

        for btn in auth_buttons[:20]:
            try:
                text = (await btn.inner_text()).strip().lower()
                if not text:
                    continue

                is_signin = any(k in text for k in ['sign in', 'log in', 'login', 'signin'])
                is_signout = any(k in text for k in ['sign out', 'log out', 'logout', 'signout'])
                is_signup  = any(k in text for k in ['sign up', 'register', 'create account', 'get started'])

                if not (is_signin or is_signout or is_signup):
                    continue

                is_visible = await btn.is_visible()
                if not is_visible:
                    continue

                found_auth = True
                action = "sign_in" if is_signin else ("sign_out" if is_signout else "sign_up")
                events.append({"event_type": "auth_button_found", "text": text.title(), "action": action, "page": url})

                # Try clicking it
                try:
                    await btn.click(timeout=3000)
                    await page.wait_for_timeout(1500)
                    new_url = page.url

                    # Check what happened
                    if new_url != url:
                        events.append({"event_type": "auth_flow_ok", "action": action,
                                        "detail": f"Navigated to {new_url}", "page": url})
                    else:
                        # Check if modal/form appeared
                        modal = await page.query_selector("[role='dialog'], .modal, [class*='modal'], [class*='dialog']")
                        form  = await page.query_selector("form input[type='email'], form input[type='password']")

                        if modal or form:
                            events.append({"event_type": "auth_flow_ok", "action": action,
                                            "detail": "Auth form/modal opened on click", "page": url})

                            # Try filling credentials if provided
                            if email and password and form:
                                await _try_login(page, email, password, events, url)
                        else:
                            events.append({"event_type": "auth_flow_issue", "action": action,
                                            "detail": f"\"{text.title()}\" clicked but no navigation, modal, or form appeared — button may be broken",
                                            "page": url, "severity": "high"})
                except Exception as click_err:
                    events.append({"event_type": "auth_flow_issue", "action": action,
                                    "detail": f"\"{text.title()}\" button click failed: {str(click_err)[:80]}",
                                    "page": url, "severity": "medium"})

                # Only test first auth button found per page
                break

            except Exception:
                continue

        return found_auth

    except Exception as e:
        logger.debug(f"Auth check error: {e}")
        return False


async def _try_login(page, email: str, password: str, events: list, url: str):
    """Attempt to fill and submit a login form."""
    try:
        email_input = await page.query_selector("input[type='email'], input[name*='email'], input[placeholder*='email' i]")
        pass_input  = await page.query_selector("input[type='password']")

        if email_input and pass_input:
            await email_input.fill(email)
            await pass_input.fill(password)
            await page.wait_for_timeout(500)

            submit = await page.query_selector("button[type='submit'], input[type='submit']")
            if submit:
                before_url = page.url
                await submit.click(timeout=5000)
                await page.wait_for_timeout(2000)

                if page.url != before_url:
                    events.append({"event_type": "auth_login_success", "detail": f"Login succeeded → {page.url}", "page": url})
                else:
                    # Check for error message
                    err_el = await page.query_selector("[class*='error'], [class*='alert'], [role='alert']")
                    err_text = (await err_el.inner_text()).strip()[:100] if err_el else ""
                    if err_text:
                        events.append({"event_type": "auth_login_failed", "detail": f"Login error: {err_text}", "page": url})
                    else:
                        events.append({"event_type": "auth_login_failed", "detail": "Login submitted but no redirect or error — check credentials", "page": url})

    except Exception as e:
        logger.debug(f"Login attempt error: {e}")


# ── Mobile responsiveness ──────────────────────────────────────────────────────

async def _check_mobile_responsiveness(browser, url: str, scan_id: Optional[str], screenshots: list) -> list:
    """Re-load the page at mobile viewport and check for layout issues."""
    events = []
    try:
        context = await browser.new_context(
            viewport=MOBILE_VIEWPORT,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        )
        page = await context.new_page()

        mobile_errors = []
        def on_console(msg):
            if msg.type == 'error':
                mobile_errors.append(msg.text[:150])
        page.on("console", on_console)

        try:
            await page.goto(url, wait_until="networkidle", timeout=10000)

            # Screenshot at mobile
            ss_dir = _screenshot_dir(scan_id)
            ss_path = str(ss_dir / "mobile_001.png")
            await page.screenshot(path=ss_path, full_page=True)
            screenshots.append(ss_path)

            # Run responsiveness checks
            results = await page.evaluate(f"""() => {{
                const vw = {MOBILE_VIEWPORT['width']};
                const issues = [];

                // Horizontal overflow
                if (document.body.scrollWidth > vw + 5) {{
                    issues.push({{ type: 'horizontal_overflow', scrollWidth: document.body.scrollWidth, viewportWidth: vw }});
                }}

                // Elements wider than viewport
                const all = document.querySelectorAll('*');
                const wide = [];
                all.forEach(el => {{
                    const rect = el.getBoundingClientRect();
                    if (rect.right > vw + 10 && rect.width > 50) {{
                        wide.push(el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''));
                    }}
                }});
                if (wide.length > 0) {{
                    issues.push({{ type: 'elements_overflow', elements: wide.slice(0, 3) }});
                }}

                // Touch targets too small (<44px)
                const smallTargets = [];
                document.querySelectorAll('button, a, input, [role="button"]').forEach(el => {{
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {{
                        const text = el.innerText?.trim().slice(0, 30) || el.tagName;
                        smallTargets.push(text);
                    }}
                }});
                if (smallTargets.length > 3) {{
                    issues.push({{ type: 'small_touch_targets', count: smallTargets.length, examples: smallTargets.slice(0, 3) }});
                }}

                // Font size too small
                const smallText = [];
                document.querySelectorAll('p, span, li, td, label').forEach(el => {{
                    const fs = parseFloat(window.getComputedStyle(el).fontSize);
                    if (fs > 0 && fs < 12) smallText.push(el.tagName);
                }});
                if (smallText.length > 5) {{
                    issues.push({{ type: 'small_font_size', count: smallText.length }});
                }}

                // No viewport meta tag
                const vpm = document.querySelector('meta[name="viewport"]');
                if (!vpm) {{
                    issues.push({{ type: 'missing_viewport_meta' }});
                }}

                return issues;
            }}""")

            for issue in (results or []):
                itype = issue.get("type")
                if itype == "horizontal_overflow":
                    events.append({"event_type": "mobile_issue", "issue": "horizontal_overflow",
                                    "detail": f"Page scrolls horizontally on mobile — content {issue.get('scrollWidth')}px wide in {issue.get('viewportWidth')}px viewport",
                                    "page": url, "severity": "high"})
                elif itype == "elements_overflow":
                    els = ", ".join(issue.get("elements", []))
                    events.append({"event_type": "mobile_issue", "issue": "elements_overflow",
                                    "detail": f"Elements overflow mobile viewport: {els}",
                                    "page": url, "severity": "high"})
                elif itype == "small_touch_targets":
                    examples = ", ".join(f'"{e}"' for e in issue.get("examples", []))
                    events.append({"event_type": "mobile_issue", "issue": "small_touch_targets",
                                    "detail": f"{issue.get('count')} touch targets smaller than 44px (e.g. {examples}) — hard to tap on mobile",
                                    "page": url, "severity": "medium"})
                elif itype == "small_font_size":
                    events.append({"event_type": "mobile_issue", "issue": "small_font_size",
                                    "detail": f"{issue.get('count')} text elements under 12px — likely unreadable on mobile",
                                    "page": url, "severity": "medium"})
                elif itype == "missing_viewport_meta":
                    events.append({"event_type": "mobile_issue", "issue": "missing_viewport_meta",
                                    "detail": "Missing <meta name='viewport'> tag — page will not scale correctly on mobile",
                                    "page": url, "severity": "high"})

            if not results:
                events.append({"event_type": "mobile_ok", "detail": "No mobile layout issues detected at 390×844", "page": url})

        except Exception as e:
            events.append({"event_type": "mobile_issue", "issue": "load_failed",
                            "detail": f"Page failed to load at mobile viewport: {str(e)[:100]}", "page": url, "severity": "high"})

        await context.close()

    except Exception as e:
        logger.warning(f"Mobile check error: {e}")

    return events


def _simulated_scan(url: str) -> Dict[str, Any]:
    events = [
        {"event_type": "page_loaded", "url": url, "title": "SentinelStore Checkout", "page": url},
        {"event_type": "button_discovered", "text": "Pay Now", "page": url},
        {"event_type": "failed_api", "url": f"{url.rstrip('/')}/api/payment/create-order", "status": 500, "page": url, "method": "POST", "triggered_by": "Pay Now"},
        {"event_type": "console_error", "message": "Cannot read properties of undefined (reading 'code')", "page": url, "type": "error"},
        {"event_type": "button_triggered_failure", "text": "Pay Now", "page": url, "api_failures": 1},
        {"event_type": "ui_issue", "issue": "broken_image", "detail": "Broken image: /assets/logo.png", "page": url, "severity": "medium"},
        {"event_type": "mobile_issue", "issue": "horizontal_overflow", "detail": "Page scrolls horizontally on mobile — content 1280px wide in 390px viewport", "page": url, "severity": "high"},
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
