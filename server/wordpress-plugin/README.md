# Elementor MCP Bridge & REST API Enhancer WordPress Plugin

This WordPress Must-Use (MU) plugin enables seamless remote publishing of Elementor Canvas Pages directly from the **Design-to-Elementor** system into WordPress.

## Features
- **Native Page Creation**: Publishes directly to WordPress **Pages > All Pages** (`post_type: 'page'`) with Elementor Canvas template (`_wp_page_template: 'elementor_canvas'`).
- **MCP Server Endpoints**: Exposes Model Context Protocol (MCP) tool endpoints at `/wp-json/elementor/v1/mcp` for AI agent publishing.
- **REST API Meta Support**: Registers `_elementor_edit_mode`, `_elementor_template_type`, `_wp_page_template`, `_elementor_version`, and `_elementor_data` in the WordPress REST API.
- **Local Application Password Support**: Enables Application Passwords in local environments (LocalWP, Docker, localhost) for secure, frictionless authentication.

## Installation in WordPress
1. Copy `elementor-mcp-bridge.php` into your WordPress site's `wp-content/mu-plugins/` directory:
   ```bash
   # Example for LocalWP:
   cp elementor-mcp-bridge.php "path/to/local-site/app/public/wp-content/mu-plugins/"
   ```
2. If the `mu-plugins` folder does not exist in `wp-content/`, create it.
3. The plugin will be automatically loaded by WordPress without needing manual activation.
