import asyncio
from playwright.async_api import async_playwright

FOOTER = """
<div style="width:100%;font-family:'IBM Plex Mono',monospace;font-size:7pt;color:#8C8084;
padding:0 0.62in;display:flex;justify-content:space-between;">
  <span>Vibe Coding: Building Real Apps with AI &middot; Haverford College &middot; Fall 2026</span>
  <span class="pageNumber"></span>
</div>
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.goto("file://" + __import__("os").path.abspath("syllabus-source.html"), wait_until="networkidle")
        await pg.evaluate("document.fonts.ready")
        await pg.wait_for_timeout(1200)
        await pg.pdf(
            path="HaverTrack-Syllabus-Fall2026.pdf",
            format="Letter",
            print_background=True,
            display_header_footer=True,
            header_template="<div></div>",
            footer_template=FOOTER,
            margin={"top": "0.55in", "bottom": "0.6in", "left": "0.62in", "right": "0.62in"},
        )
        await b.close()

asyncio.run(main())
