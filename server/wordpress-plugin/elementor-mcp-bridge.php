<?php
/**
 * Plugin Name: Elementor MCP Bridge & REST API Enhancer
 * Description: Model Context Protocol (MCP) server endpoint and Elementor publishing bridge for design-to-elementor.
 * Version: 1.1.0
 * Author: Antigravity
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Use WordPress application-password authentication; never accept the account's login password as an API fallback.

// 3. Register Elementor post meta for REST API
add_action( 'init', function() {
    $types = array( 'page', 'post', 'elementor_library' );
    foreach ( $types as $type ) {
        register_post_meta( $type, '_elementor_edit_mode', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function( $allowed, $meta_key, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
        ) );
        register_post_meta( $type, '_elementor_template_type', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function( $allowed, $meta_key, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
        ) );
        register_post_meta( $type, '_elementor_data', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function( $allowed, $meta_key, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
        ) );
        register_post_meta( $type, '_elementor_page_settings', array(
            'show_in_rest' => array( 'schema' => array( 'type' => 'object', 'additionalProperties' => true ) ),
            'single' => true, 'type' => 'object',
            'auth_callback' => function( $allowed, $meta_key, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
        ) );
        register_post_meta( $type, '_wp_page_template', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function( $allowed, $meta_key, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
        ) );
        register_post_meta( $type, '_elementor_version', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function( $allowed, $meta_key, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
        ) );
    }
} );

// 4. Register Elementor MCP Endpoint: /wp-json/elementor/v1/mcp
add_action( 'rest_api_init', function() {
    register_rest_route( 'elementor/v1', '/mcp', array(
        'methods'             => array( 'POST', 'GET' ),
        'callback'            => 'handle_elementor_mcp_request',
        'permission_callback' => function( $request ) {
            return current_user_can( 'edit_pages' );
        },
    ) );
} );

function handle_elementor_mcp_request( WP_REST_Request $request ) {
    $body = $request->get_json_params();
    if ( empty( $body ) ) {
        $body = json_decode( $request->get_body(), true ) ?: array();
    }

    $id     = isset( $body['id'] ) ? $body['id'] : 1;
    $method = isset( $body['method'] ) ? $body['method'] : '';
    $params = isset( $body['params'] ) ? $body['params'] : array();

    $elementor_version = defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : '3.24.7';
    global $wp_version;

    if ( $method === 'initialize' ) {
        return array(
            'jsonrpc' => '2.0',
            'id'      => $id,
            'result'  => array(
                'protocolVersion'  => '2024-11-05',
                'capabilities'     => array(
                    'idempotentPublishing' => true,
                    'tools' => array(
                        'listChanged' => true,
                    ),
                ),
                'serverInfo'       => array(
                    'name'    => 'elementor-wp-mcp-server',
                    'version' => '1.0.0',
                ),
                'wordpressVersion' => $wp_version,
                'elementorVersion' => $elementor_version,
            ),
        );
    }

    if ( $method === 'tools/list' ) {
        return array(
            'jsonrpc' => '2.0',
            'id'      => $id,
            'result'  => array(
                'tools' => array(
                    array(
                        'name' => 'dte_get_publish_result',
                        'description' => 'Look up an idempotent publishing receipt for the authenticated user',
                        'inputSchema' => array( 'type' => 'object', 'properties' => array( 'idempotency_key' => array( 'type' => 'string' ) ), 'required' => array( 'idempotency_key' ) ),
                    ),
                    array(
                        'name'        => 'elementor_create_page',
                        'description' => 'Create a new WordPress page configured with Elementor JSON document',
                        'inputSchema' => array(
                            'type'       => 'object',
                            'properties' => array(
                                'title'    => array( 'type' => 'string' ),
                                'status'   => array( 'type' => 'string', 'enum' => array( 'draft', 'publish' ) ),
                                'elements' => array( 'type' => 'array' ),
                            ),
                            'required'   => array( 'title' ),
                        ),
                    ),
                    array(
                        'name'        => 'wp_create_post',
                        'description' => 'Create a new WordPress post or page with meta attributes',
                        'inputSchema' => array(
                            'type'       => 'object',
                            'properties' => array(
                                'title'      => array( 'type' => 'string' ),
                                'status'     => array( 'type' => 'string' ),
                                'post_type'  => array( 'type' => 'string' ),
                                'meta_input' => array( 'type' => 'object' ),
                            ),
                            'required'   => array( 'title' ),
                        ),
                    ),
                    array(
                        'name'        => 'elementor_set_post_data',
                        'description' => 'Update the Elementor elements data for an existing post',
                        'inputSchema' => array(
                            'type'       => 'object',
                            'properties' => array(
                                'post_id' => array( 'type' => 'number' ),
                                'data'    => array( 'type' => 'array' ),
                            ),
                            'required'   => array( 'post_id', 'data' ),
                        ),
                    ),
                    array(
                        'name'        => 'wp_get_post',
                        'description' => 'Retrieve a WordPress post by ID',
                        'inputSchema' => array(
                            'type'       => 'object',
                            'properties' => array(
                                'id' => array( 'type' => 'number' ),
                            ),
                            'required'   => array( 'id' ),
                        ),
                    ),
                    array(
                        'name'        => 'elementor_get_page_structure',
                        'description' => 'Retrieve Elementor structure for a post',
                        'inputSchema' => array(
                            'type'       => 'object',
                            'properties' => array(
                                'page_id' => array( 'type' => 'number' ),
                            ),
                            'required'   => array( 'page_id' ),
                        ),
                    ),
                ),
            ),
        );
    }

    if ( $method === 'tools/call' ) {
        $tool_name = isset( $params['name'] ) ? $params['name'] : '';
        $args      = isset( $params['arguments'] ) ? $params['arguments'] : array();

        if ( $tool_name === 'dte_get_publish_result' ) {
            $key = isset( $args['idempotency_key'] ) ? sanitize_text_field( $args['idempotency_key'] ) : '';
            if ( ! $key ) return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32602, 'message' => 'Missing publishing key' ) );
            $receipt = get_option( 'dte_publish_' . hash( 'sha256', get_current_user_id() . ':' . $key ) );
            $data = array( 'state' => $receipt ? $receipt['state'] : 'missing' );
            if ( isset( $receipt['response'] ) ) {
                $data['result'] = $receipt['response']['result']['structuredData'];
                $data['elements'] = $receipt['elements'];
                $data['page_settings'] = $receipt['page_settings'];
                if ( ! current_user_can( 'edit_post', $data['result']['id'] ) ) return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32003, 'message' => 'Permission denied for this page' ) );
            }
            return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'content' => array(), 'structuredData' => $data ) );
        }

        if ( $tool_name === 'elementor_create_page' || $tool_name === 'wp_create_post' ) {
            $title      = ! empty( $args['title'] ) ? sanitize_text_field( $args['title'] ) : 'Untitled Page';
            $status     = ! empty( $args['status'] ) ? $args['status'] : 'draft';
            $post_type  = ! empty( $args['post_type'] ) ? $args['post_type'] : 'page';
            $meta_input = ! empty( $args['meta_input'] ) ? $args['meta_input'] : array();

            $elements   = isset( $args['elements'] ) ? $args['elements'] : array();
            if ( empty( $elements ) && ! empty( $meta_input['_elementor_data'] ) ) {
                $elements = is_string( $meta_input['_elementor_data'] )
                    ? json_decode( $meta_input['_elementor_data'], true )
                    : $meta_input['_elementor_data'];
            }

            if ( ! in_array( $post_type, array( 'page', 'post' ), true ) || ! in_array( $status, array( 'draft', 'publish' ), true ) ) {
                return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32602, 'message' => 'Unsupported post type or status' ) );
            }
            $type_object = get_post_type_object( $post_type );
            if ( ! $type_object || ! current_user_can( $type_object->cap->create_posts ) || ( $status === 'publish' && ! current_user_can( $type_object->cap->publish_posts ) ) ) {
                return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32003, 'message' => 'Permission denied for page creation or publishing' ) );
            }
            $request_key = isset( $args['idempotency_key'] ) ? sanitize_text_field( $args['idempotency_key'] ) : '';
            $operation_option = $request_key ? 'dte_publish_' . hash( 'sha256', get_current_user_id() . ':' . $request_key ) : '';
            if ( $operation_option && ! add_option( $operation_option, array( 'state' => 'processing' ), '', false ) ) {
                $existing = get_option( $operation_option );
                if ( isset( $existing['response'] ) ) {
                    $response = $existing['response'];
                    if ( ! current_user_can( 'edit_post', $response['result']['structuredData']['id'] ) ) return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32003, 'message' => 'Permission denied for this page' ) );
                    $response['id'] = $id;
                    $response['result']['structuredData']['replayed'] = true;
                    $response['result']['structuredData']['elements'] = $existing['elements'];
                    $response['result']['structuredData']['page_settings'] = $existing['page_settings'];
                    return $response;
                }
                return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32009, 'message' => 'This publishing request is in progress or requires reconciliation; no duplicate page was created' ) );
            }
            $post_arr = array(
                'post_title'   => $title,
                'post_status'  => $status,
                'post_type'    => $post_type,
                'post_content' => '',
            );

            $post_id = wp_insert_post( $post_arr, true );
            if ( is_wp_error( $post_id ) ) {
                if ( $operation_option ) delete_option( $operation_option );
                return array(
                    'jsonrpc' => '2.0',
                    'id'      => $id,
                    'error'   => array(
                        'code'    => -32000,
                        'message' => $post_id->get_error_message(),
                    ),
                );
            }

            // Save Elementor specific meta
            update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
            update_post_meta( $post_id, '_elementor_template_type', 'wp-page' );
            update_post_meta( $post_id, '_wp_page_template', 'elementor_canvas' );
            update_post_meta( $post_id, '_elementor_version', $elementor_version );
            $page_settings = isset( $args['page_settings'] ) ? $args['page_settings'] : ( isset( $meta_input['_elementor_page_settings'] ) ? $meta_input['_elementor_page_settings'] : array() );
            update_post_meta( $post_id, '_elementor_page_settings', wp_slash( $page_settings ) );
            if ( ! empty( $elements ) ) {
                update_post_meta( $post_id, '_elementor_data', wp_slash( json_encode( $elements ) ) );
            }

            // Apply any extra meta
            foreach ( $meta_input as $mk => $mv ) {
                if ( in_array( $mk, array( '_elementor_template_type', '_wp_page_template', '_elementor_version' ), true ) ) {
                    update_post_meta( $post_id, $mk, $mv );
                }
            }

            // Refresh Elementor CSS files if Elementor is available
            if ( class_exists( '\Elementor\Core\Files\CSS\Post' ) ) {
                try {
                    $css_file = \Elementor\Core\Files\CSS\Post::create( $post_id );
                    if ( $css_file ) {
                        $css_file->update();
                    }
                } catch ( Exception $e ) {
                    // Ignore CSS compile errors on initial create
                }
            }

            $permalink = get_permalink( $post_id );

            $response = array(
                'jsonrpc' => '2.0',
                'id'      => $id,
                'result'  => array(
                    'content' => array(
                        array(
                            'type' => 'text',
                            'text' => "Created page #{$post_id} titled '{$title}'",
                        ),
                    ),
                    'structuredData' => array(
                        'id'        => $post_id,
                        'page_id'   => $post_id,
                        'url'       => $permalink,
                        'permalink' => $permalink,
                        'link'      => $permalink,
                        'status'    => $status,
                    ),
                ),
            );
            if ( $operation_option ) update_option( $operation_option, array( 'state' => 'completed', 'response' => $response, 'elements' => $elements, 'page_settings' => $page_settings ), false );
            return $response;
        }

        if ( $tool_name === 'elementor_set_post_data' ) {
            $post_id  = isset( $args['post_id'] ) ? intval( $args['post_id'] ) : 0;
            $data     = isset( $args['data'] ) ? $args['data'] : array();

            if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
                return array(
                    'jsonrpc' => '2.0',
                    'id'      => $id,
                    'error'   => array( 'code' => -32602, 'message' => 'Missing post_id' ),
                );
            }

            update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
            update_post_meta( $post_id, '_elementor_data', wp_slash( json_encode( $data ) ) );

            return array(
                'jsonrpc' => '2.0',
                'id'      => $id,
                'result'  => array(
                    'content' => array(
                        array( 'type' => 'text', 'text' => "Updated Elementor data for post #{$post_id}" ),
                    ),
                    'structuredData' => array( 'post_id' => $post_id, 'success' => true ),
                ),
            );
        }

        if ( $tool_name === 'wp_get_post' ) {
            $post_id = isset( $args['id'] ) ? intval( $args['id'] ) : 0;
            $post    = get_post( $post_id );
            if ( ! $post || ! current_user_can( 'read_post', $post_id ) ) {
                return array(
                    'jsonrpc' => '2.0',
                    'id'      => $id,
                    'error'   => array( 'code' => -32004, 'message' => 'Post not found' ),
                );
            }

            return array(
                'jsonrpc' => '2.0',
                'id'      => $id,
                'result'  => array(
                    'structuredData' => array(
                        'id'        => $post->ID,
                        'title'     => $post->post_title,
                        'status'    => $post->post_status,
                        'permalink' => get_permalink( $post->ID ),
                    ),
                ),
            );
        }

        if ( $tool_name === 'elementor_get_page_structure' ) {
            $post_id   = isset( $args['page_id'] ) ? intval( $args['page_id'] ) : 0;
            if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
                return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32003, 'message' => 'Permission denied for this page' ) );
            }
            $meta_data = get_post_meta( $post_id, '_elementor_data', true );
            $elements  = ! empty( $meta_data ) ? json_decode( $meta_data, true ) : array();

            return array(
                'jsonrpc' => '2.0',
                'id'      => $id,
                'result'  => array(
                    'structuredData' => array(
                        'page_id'  => $post_id,
                        'elements' => $elements,
                        'page_settings' => get_post_meta( $post_id, '_elementor_page_settings', true ),
                    ),
                ),
            );
        }

        return array(
            'jsonrpc' => '2.0',
            'id'      => $id,
            'error'   => array(
                'code'    => -32601,
                'message' => "Tool '{$tool_name}' not implemented",
            ),
        );
    }

    return array(
        'jsonrpc' => '2.0',
        'id'      => $id,
        'error'   => array(
            'code'    => -32601,
            'message' => "Method '{$method}' not found",
        ),
    );
}
