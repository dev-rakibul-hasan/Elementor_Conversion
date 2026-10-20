<?php
/**
 * Plugin Name: Elementor MCP Bridge & REST API Enhancer
 * Description: Model Context Protocol (MCP) server endpoint and Elementor publishing bridge for design-to-elementor.
 * Version: 1.0.0
 * Author: Antigravity
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// 1. Enable application passwords in all local environments
add_filter( 'wp_is_application_passwords_available', '__return_true' );

// 2. Authentication fallback: support both Application Passwords and main login password for API requests
add_filter( 'determine_current_user', function( $user_id ) {
    if ( ! empty( $user_id ) ) {
        return $user_id;
    }

    $auth_header = '';
    if ( isset( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
        $auth_header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif ( isset( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
        $auth_header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    $user = null;
    $pass = null;

    if ( ! empty( $auth_header ) && preg_match( '/^Basic\s+(.*)$/i', $auth_header, $matches ) ) {
        $decoded = base64_decode( $matches[1] );
        if ( strpos( $decoded, ':' ) !== false ) {
            list( $user, $pass ) = explode( ':', $decoded, 2 );
        }
    } elseif ( isset( $_SERVER['PHP_AUTH_USER'], $_SERVER['PHP_AUTH_PW'] ) ) {
        $user = $_SERVER['PHP_AUTH_USER'];
        $pass = $_SERVER['PHP_AUTH_PW'];
    }

    if ( empty( $user ) || empty( $pass ) ) {
        return $user_id;
    }

    $wp_user = get_user_by( 'login', $user );
    if ( ! $wp_user && is_email( $user ) ) {
        $wp_user = get_user_by( 'email', $user );
    }

    if ( ! $wp_user ) {
        return $user_id;
    }

    // Try application password
    $auth = wp_authenticate_application_password( null, $wp_user->user_login, $pass );
    if ( $auth instanceof WP_User ) {
        return $auth->ID;
    }

    // Fallback: check main user password
    if ( wp_check_password( $pass, $wp_user->user_pass, $wp_user->ID ) ) {
        return $wp_user->ID;
    }

    return $user_id;
}, 20 );

// 3. Register Elementor post meta for REST API
add_action( 'init', function() {
    $types = array( 'page', 'post', 'elementor_library' );
    foreach ( $types as $type ) {
        register_post_meta( $type, '_elementor_edit_mode', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => '__return_true',
        ) );
        register_post_meta( $type, '_elementor_template_type', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => '__return_true',
        ) );
        register_post_meta( $type, '_elementor_data', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => '__return_true',
        ) );
        register_post_meta( $type, '_wp_page_template', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => '__return_true',
        ) );
        register_post_meta( $type, '_elementor_version', array(
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => '__return_true',
        ) );
    }
} );

// 4. Register Elementor MCP Endpoint: /wp-json/elementor/v1/mcp
add_action( 'rest_api_init', function() {
    register_rest_route( 'elementor/v1', '/mcp', array(
        'methods'             => array( 'POST', 'GET' ),
        'callback'            => 'handle_elementor_mcp_request',
        'permission_callback' => function( $request ) {
            return current_user_can( 'edit_pages' ) || current_user_can( 'manage_options' ) || is_user_logged_in();
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

            $post_arr = array(
                'post_title'   => $title,
                'post_status'  => $status,
                'post_type'    => $post_type,
                'post_content' => '',
            );

            $post_id = wp_insert_post( $post_arr, true );
            if ( is_wp_error( $post_id ) ) {
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
            if ( ! empty( $elements ) ) {
                update_post_meta( $post_id, '_elementor_data', wp_slash( json_encode( $elements ) ) );
            }

            // Apply any extra meta
            foreach ( $meta_input as $mk => $mv ) {
                if ( $mk !== '_elementor_data' && $mk !== '_elementor_edit_mode' ) {
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

            return array(
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
        }

        if ( $tool_name === 'elementor_set_post_data' ) {
            $post_id  = isset( $args['post_id'] ) ? intval( $args['post_id'] ) : 0;
            $data     = isset( $args['data'] ) ? $args['data'] : array();

            if ( ! $post_id ) {
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
            if ( ! $post ) {
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
            $meta_data = get_post_meta( $post_id, '_elementor_data', true );
            $elements  = ! empty( $meta_data ) ? json_decode( $meta_data, true ) : array();

            return array(
                'jsonrpc' => '2.0',
                'id'      => $id,
                'result'  => array(
                    'structuredData' => array(
                        'page_id'  => $post_id,
                        'elements' => $elements,
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
