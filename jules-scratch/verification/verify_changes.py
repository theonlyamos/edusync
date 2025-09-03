from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:3000")

    # Wait for the page to load and the start button to be visible
    overlay_button_selector = ".absolute.inset-0 button"
    page.wait_for_selector(overlay_button_selector, timeout=30000)
    page.screenshot(path="jules-scratch/verification/01_initial_state.png")

    # Click the start button
    page.click(overlay_button_selector)

    # Wait for the connection to be established and the visualiser to appear
    page.wait_for_selector(".pulse-orb", timeout=30000)

    # Take a screenshot of the connected state
    page.screenshot(path="jules-scratch/verification/02_connected_state.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
