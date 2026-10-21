# Elementor MCP Bridge 1.1

Install `elementor-mcp-bridge.php` in the target WordPress site's `wp-content/mu-plugins/` directory (create that directory if needed). Replace the previous bridge file when upgrading. The application requires this updated bridge for duplicate-safe publication and saved-content verification.

The authenticated endpoint is `/wp-json/elementor/v1/mcp`. Use a WordPress application password belonging to a user with permission to edit pages; publishing also requires permission to publish pages. This bridge uses WordPress authentication and does not accept a login password as a fallback. On local HTTP installations, WordPress must be configured to permit application passwords for its local environment.

The bridge saves Elementor elements, page settings, and the Canvas template. Publishing keys and receipts prevent duplicate pages across HTTP retries or application restarts. An interrupted request remains reserved and reports that reconciliation is required instead of risking a duplicate page. Receipts are scoped to the authenticated WordPress user.

Template-library publishing is currently unsupported; export JSON for manual template import. Connection or media-upload failures are returned as errors. Real connections never fall back to simulated publishing.
