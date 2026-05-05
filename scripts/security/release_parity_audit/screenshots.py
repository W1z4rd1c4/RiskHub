from __future__ import annotations

import json
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ScreenshotCapturePlan:
    command_id: str
    command: str


def build_screenshot_capture_plan(*, command_id: str, command: str) -> ScreenshotCapturePlan:
    return ScreenshotCapturePlan(command_id=command_id, command=command)


def build_login_screenshot_command(*, url: str, output_path: Path, ui_state_path: Path) -> str:
    return (
        "cd frontend && "
        + "node - "
        + shlex.quote(url)
        + " "
        + shlex.quote(str(output_path))
        + " "
        + shlex.quote(str(ui_state_path))
        + " <<'NODE'\n"
        + "const fs = require('fs');\n"
        + "const { chromium } = require('playwright');\n"
        + "const targetUrl = process.argv[2];\n"
        + "const outputPath = process.argv[3];\n"
        + "const uiStatePath = process.argv[4];\n"
        + "(async () => {\n"
        + "  const browser = await chromium.launch({ headless: true });\n"
        + "  const context = await browser.newContext({\n"
        + "    viewport: { width: 1280, height: 720 },\n"
        + "    serviceWorkers: 'block',\n"
        + "    locale: 'en-US',\n"
        + "  });\n"
        + "  const page = await context.newPage();\n"
        + "  await page.emulateMedia({ reducedMotion: 'reduce' });\n"
        + "  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });\n"
        + "  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});\n"
        + "  await page.waitForSelector('h1:has-text(\"RiskHub\")', { timeout: 30000 });\n"
        + "  await page.addStyleTag({ content: "
        + "'* , *::before, *::after { animation: none !important; transition: none !important; }' });\n"
        + "  await page.evaluate(async () => {\n"
        + "    if (document.fonts && document.fonts.ready) {\n"
        + "      await document.fonts.ready;\n"
        + "    }\n"
        + "  });\n"
        + "  await page.waitForTimeout(1500);\n"
        + "  const uiState = await page.evaluate(() => {\n"
        + "    const heading = document.querySelector('h1')?.textContent?.trim() || null;\n"
        + "    const bodyText = document.body?.innerText || '';\n"
        + "    const hasConfigWarning = bodyText.includes('Auth config unavailable; showing demo login');\n"
        + "    const hasSsoButton = Array.from(document.querySelectorAll('button')).some((btn) =>\n"
        + "      (btn.textContent || '').toLowerCase().includes('microsoft')\n"
        + "    );\n"
        + "    const demoCardCount = document.querySelectorAll('.glass-card').length;\n"
        + "    return {\n"
        + "      path: window.location.pathname,\n"
        + "      heading,\n"
        + "      has_config_warning: hasConfigWarning,\n"
        + "      has_sso_button: hasSsoButton,\n"
        + "      demo_card_count: demoCardCount,\n"
        + "    };\n"
        + "  });\n"
        + "  await page.screenshot({ path: outputPath, fullPage: true });\n"
        + "  fs.writeFileSync(uiStatePath, JSON.stringify(uiState, null, 2));\n"
        + "  await context.close();\n"
        + "  await browser.close();\n"
        + "})().catch((err) => {\n"
        + "  console.error(err);\n"
        + "  process.exit(1);\n"
        + "});\n"
        + "NODE"
    )


def capture_login_screenshot(
    *,
    command_id: str,
    url: str,
    output_path: Path,
    run_command,
    sha256_file,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ui_state_path = output_path.with_suffix(".state.json")
    command = build_login_screenshot_command(url=url, output_path=output_path, ui_state_path=ui_state_path)
    result = run_command(command_id, command, required=False, timeout_sec=180)
    if result.rc != 0 or not output_path.exists():
        return False, None, None

    ui_state: dict[str, Any] | None = None
    if ui_state_path.exists():
        try:
            ui_state = json.loads(ui_state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            ui_state = None
    return True, sha256_file(output_path), ui_state
