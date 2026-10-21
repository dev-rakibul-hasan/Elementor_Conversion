<?php
// Standalone contract tests; no WordPress installation, database, or remote mutations.
define( 'ABSPATH', __DIR__ );
$GLOBALS['actions'] = array();
$GLOBALS['caps'] = array( 'edit_pages' => true, 'publish_pages' => true );
$GLOBALS['posts'] = array();
$GLOBALS['meta'] = array();
$GLOBALS['options'] = array();
$GLOBALS['owner'] = 7;
$GLOBALS['allowed_post'] = true;
function add_action( $name, $callback ) { $GLOBALS['actions'][$name] = $callback; }
function add_filter( ...$args ) {}
function get_current_user_id() { return $GLOBALS['owner']; }
function current_user_can( $cap, ...$args ) { return in_array( $cap, array( 'edit_post', 'read_post' ), true ) ? $GLOBALS['allowed_post'] : ! empty( $GLOBALS['caps'][$cap] ); }
function get_post_type_object( $type ) { return (object) array( 'cap' => (object) array( 'create_posts' => 'edit_pages', 'publish_posts' => 'publish_pages' ) ); }
function sanitize_text_field( $text ) { return trim( strip_tags( $text ) ); }
function add_option( $key, $value, ...$args ) { if ( isset( $GLOBALS['options'][$key] ) ) return false; $GLOBALS['options'][$key] = $value; return true; }
function get_option( $key ) { return isset( $GLOBALS['options'][$key] ) ? $GLOBALS['options'][$key] : false; }
function update_option( $key, $value, ...$args ) { $GLOBALS['options'][$key] = $value; }
function delete_option( $key ) { unset( $GLOBALS['options'][$key] ); }
function wp_insert_post( $data, $error ) { $id = count( $GLOBALS['posts'] ) + 1; $GLOBALS['posts'][$id] = (object) array_merge( $data, array( 'ID' => $id ) ); return $id; }
function is_wp_error( $value ) { return false; }
function wp_slash( $value ) { return $value; }
function update_post_meta( $id, $key, $value ) { $GLOBALS['meta'][$id][$key] = $value; }
function get_post_meta( $id, $key, $single ) { return isset( $GLOBALS['meta'][$id][$key] ) ? $GLOBALS['meta'][$id][$key] : ''; }
function get_permalink( $id ) { return 'https://wp.test/?p=' . $id; }
function get_post( $id ) { return isset( $GLOBALS['posts'][$id] ) ? $GLOBALS['posts'][$id] : null; }
function register_rest_route( $namespace, $path, $config ) { $GLOBALS['route'] = $config; }
class WP_REST_Request {
    private $body;
    public function __construct( $body ) { $this->body = $body; }
    public function get_json_params() { return $this->body; }
    public function get_body() { return json_encode( $this->body ); }
}
require __DIR__ . '/../elementor-mcp-bridge.php';
function call_tool( $name, $args ) {
    return handle_elementor_mcp_request( new WP_REST_Request( array( 'id' => 1, 'method' => 'tools/call', 'params' => array( 'name' => $name, 'arguments' => $args ) ) ) );
}
function check( $condition, $message ) { if ( ! $condition ) throw new Exception( $message ); }
$GLOBALS['wp_version'] = '6.8';
$GLOBALS['actions']['rest_api_init']();
$GLOBALS['caps'] = array();
check( ! call_user_func( $GLOBALS['route']['permission_callback'], null ), 'A subscriber must not pass the route permission check' );
check( isset( call_tool( 'elementor_create_page', array( 'title' => 'Denied' ) )['error'] ), 'Creation must enforce page permissions' );
$GLOBALS['caps'] = array( 'edit_pages' => true );
check( isset( call_tool( 'elementor_create_page', array( 'title' => 'Denied publish', 'status' => 'publish' ) )['error'] ), 'Publishing needs publish_pages permission' );
$elements = array( array( 'id' => 'abc1234', 'elType' => 'container', 'settings' => array( 'background_color' => '#123456' ), 'elements' => array() ) );
$args = array( 'title' => 'Saved page', 'status' => 'draft', 'elements' => $elements, 'page_settings' => array( 'background_color' => '#123456' ), 'idempotency_key' => 'one-publication' );
$first = call_tool( 'elementor_create_page', $args );
check( isset( $first['result']['structuredData']['id'] ), 'Draft creation must return a real ID' );
$id = $first['result']['structuredData']['id'];
$second = call_tool( 'elementor_create_page', $args );
check( $second['result']['structuredData']['id'] === $id && count( $GLOBALS['posts'] ) === 1, 'Duplicate keys must not create another page' );
$receipt = call_tool( 'dte_get_publish_result', array( 'idempotency_key' => 'one-publication' ) );
check( $receipt['result']['structuredData']['state'] === 'completed', 'A completed receipt must survive another request' );
check( $receipt['result']['structuredData']['elements'] === $elements, 'Receipts must retain the original media mapping' );
$read = call_tool( 'elementor_get_page_structure', array( 'page_id' => $id ) );
check( $read['result']['structuredData']['elements'] === $elements, 'Read-back must include saved elements' );
check( $read['result']['structuredData']['page_settings']['background_color'] === '#123456', 'Read-back must include saved page settings' );
$GLOBALS['allowed_post'] = false;
check( isset( call_tool( 'elementor_set_post_data', array( 'post_id' => $id, 'data' => array() ) )['error'] ), 'Updating a page must check edit_post permission' );
check( isset( call_tool( 'elementor_get_page_structure', array( 'page_id' => $id ) )['error'] ), 'Reading Elementor data must check edit_post permission' );
check( isset( call_tool( 'dte_get_publish_result', array( 'idempotency_key' => 'one-publication' ) )['error'] ), 'Receipt access must check current page permission' );
$GLOBALS['allowed_post'] = true;
$GLOBALS['owner'] = 8;
check( call_tool( 'dte_get_publish_result', array( 'idempotency_key' => 'one-publication' ) )['result']['structuredData']['state'] === 'missing', 'Receipts must not leak between users' );
echo "WordPress bridge contract checks passed.\n";
