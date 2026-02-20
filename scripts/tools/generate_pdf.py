import asyncio
from playwright.async_api import async_playwright
import os

async def generate_pdf():
    """Generate a PDF from the presentation.html file using Playwright."""
    html_path = os.path.abspath("presentation.html")
    pdf_path = os.path.abspath("presentation.pdf")
    
    print(f"Loading HTML from: {html_path}")
    
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Load the HTML file
        await page.goto(f"file://{html_path}", wait_until="networkidle")
        
        # Wait for fonts and images to load
        await page.wait_for_timeout(2000)
        
        # Generate PDF with high quality settings
        await page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,
            margin={
                "top": "20px",
                "right": "20px",
                "bottom": "20px",
                "left": "20px"
            },
            scale=0.8,
            prefer_css_page_size=False
        )
        
        await browser.close()
        
    print(f"PDF generated successfully: {pdf_path}")
    print(f"File size: {os.path.getsize(pdf_path) / (1024*1024):.2f} MB")

if __name__ == "__main__":
    asyncio.run(generate_pdf())
