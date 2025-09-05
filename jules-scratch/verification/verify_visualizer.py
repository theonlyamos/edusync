from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the homepage
            page.goto("http://localhost:3000", wait_until="networkidle")

            # Click the start button to activate voice
            start_button = page.get_by_role("button", name="Start")
            expect(start_button).to_be_visible(timeout=10000)
            start_button.click()

            # Wait for the connection to be established and for the AI to potentially start speaking.
            # This is a bit of a guess, but we'll wait for the "Streaming mic" indicator.
            expect(page.get_by_text("Streaming mic")).to_be_visible(timeout=15000)

            # It's hard to deterministically trigger the AI to speak, so we'll just wait a bit
            # and hope the visualizer shows up. In a real test, we'd mock the backend response.
            page.wait_for_timeout(5000) # wait for 5 seconds for AI to speak

            # Take a screenshot
            page.screenshot(path="jules-scratch/verification/visualizer.png")

        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
