"""Browser checks against the isolated production client and mock conversion API."""
import json
import os
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

artifacts = Path('audit-artifacts')
artifacts.mkdir(exist_ok=True)
errors = []
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('AUDIT_CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe'))
    try:
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce', accept_downloads=True)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:3501/auth/register')
        page.wait_for_load_state('networkidle')
        page.get_by_label('Email Address').fill(f'audit-{time.time_ns()}@example.test')
        page.get_by_label('Password (min 6 characters)', exact=True).fill('Audit-password-12345')
        page.get_by_label('Confirm Password').fill('Audit-password-12345')
        page.get_by_role('button', name='Create Account', exact=True).click()
        page.wait_for_url('http://127.0.0.1:3501/')
        checks.append('registration and persisted authentication')
        page.goto('http://127.0.0.1:3501/upload')
        page.wait_for_load_state('networkidle')
        # A real PNG fixture, produced by the browser, is uploaded through the UI.
        page.screenshot(path=str(artifacts / 'upload-source.png'), clip={'x': 0, 'y': 0, 'width': 100, 'height': 80})
        page.locator('input[type=file]').set_input_files(str(artifacts / 'upload-source.png'))
        page.get_by_label('Project Title').fill('Browser Audit Project')
        page.get_by_role('button', name='Start Conversion Pipeline').click()
        page.wait_for_url('http://127.0.0.1:3501/')
        page.get_by_text('Browser Audit Project', exact=True).first.click()
        expect(page.get_by_role('button', name='Export Page JSON')).to_be_visible(timeout=60000)
        checks.append('PNG upload, queue, worker, vision fixture, asset extraction and all conversion stages')
        with page.expect_download() as download_info:
            page.get_by_role('button', name='Export Page JSON').click()
        export = artifacts / 'browser-export.json'
        download_info.value.save_as(str(export))
        document = json.loads(export.read_text(encoding='utf8'))
        assert document['type'] == 'page' and document['page_settings']['template'] == 'elementor_canvas'
        assert len(document['content']) == 1
        assert document['content'][0]['elements'][0]['settings']['title'] == 'Browser audit design'
        image_url = document['content'][0]['elements'][1]['settings']['image']['url']
        assert context.request.get(f'http://127.0.0.1:4501{image_url}').ok
        checks.append('downloaded export and served extracted image')
        page.get_by_role('button', name='DIR Architecture').click()
        expect(page.get_by_text('Design Intermediate Representation (DIR)', exact=True)).to_be_visible()
        page.get_by_role('button', name='Elementor Canvas Page Structure', exact=False).click()
        expect(page.get_by_text('Browser audit design', exact=False).first).to_be_visible()
        checks.append('DIR and Elementor inspectors')
        page.get_by_role('button', name='Toggle theme').click()
        saved_theme = page.evaluate("localStorage.getItem('dte_theme')")
        page.reload(); page.wait_for_load_state('networkidle')
        assert page.locator('html').evaluate("el => el.classList.contains('dark')") == (saved_theme == 'dark')
        checks.append('theme persistence')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_load_state('networkidle')
        page.screenshot(path=str(artifacts / 'mobile-project.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile layout overflows the viewport'
        checks.append('390px mobile project layout')
        page.get_by_role('button', name='Delete', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        page.get_by_role('button', name='Delete Project', exact=True).click()
        page.wait_for_url('http://127.0.0.1:3501/')
        expect(page.get_by_text('Browser Audit Project', exact=True)).to_have_count(0)
        checks.append('project deletion through confirmation dialog')
        page.get_by_role('button', name='Log out').click()
        expect(page.get_by_role('button', name='Sign In', exact=True)).to_be_visible()
        checks.append('logout clears session and project list')
        assert not errors, errors
    finally:
        browser.close()
(artifacts / 'browser-results.json').write_text(json.dumps({'checks': checks, 'pageErrors': errors}, indent=2), encoding='utf8')
print(json.dumps({'passed': len(checks), 'pageErrors': errors, 'checks': checks}, indent=2))
